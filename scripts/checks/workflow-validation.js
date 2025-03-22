#!/usr/bin/env node

/**
 * Workflow Validation Module
 * 
 * This module validates GitHub Actions workflows against package.json scripts
 * to ensure that all referenced scripts exist and that workflow files use a
 * consistent package manager.
 * 
 * Used in the preview workflow to catch CI/CD configuration issues early.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as logger from '../core/logger.js';

// Define a simple YAML parser fallback
const simplifiedYamlParser = {
  // Very basic YAML parser for simple workflow files
  load(content) {
    try {
      // This is a simplified parser that won't handle complex YAML
      // but should work for basic GitHub workflow files
      const lines = content.split('\n');
      const result = {};
      let currentSection = result;
      let currentKey = '';
      let indentLevel = 0;
      const stack = [result];

      for (let line of lines) {
        line = line.trimEnd();
        if (!line || line.trim().startsWith('#')) continue;
        
        // Count leading spaces for indentation
        const leadingSpaces = line.match(/^(\s*)/)[0].length;
        const trimmedLine = line.trim();
        
        // Handle different indent levels
        if (leadingSpaces > indentLevel) {
          indentLevel = leadingSpaces;
        } else if (leadingSpaces < indentLevel) {
          const levelsUp = Math.floor((indentLevel - leadingSpaces) / 2);
          for (let i = 0; i < levelsUp; i++) {
            stack.pop();
          }
          currentSection = stack[stack.length - 1];
          indentLevel = leadingSpaces;
        }
        
        // Parse key-value pairs
        if (trimmedLine.includes(':')) {
          const [key, value] = trimmedLine.split(':', 2);
          const trimmedKey = key.trim();
          const trimmedValue = value ? value.trim() : '';
          
          if (trimmedValue) {
            // Simple key-value pair
            currentSection[trimmedKey] = trimmedValue;
          } else {
            // New section
            currentSection[trimmedKey] = {};
            currentSection = currentSection[trimmedKey];
            stack.push(currentSection);
            currentKey = trimmedKey;
          }
        } else if (trimmedLine.startsWith('-')) {
          // List item
          const item = trimmedLine.substring(1).trim();
          if (!currentSection[currentKey]) {
            currentSection[currentKey] = [];
          }
          currentSection[currentKey].push(item);
        }
      }
      
      return result;
    } catch (error) {
      logger.error(`Error parsing YAML: ${error.message}`);
      return {};
    }
  },
  
  dump(obj) {
    try {
      let result = '';
      
      const dumpObject = (obj, indent = 0) => {
        for (const [key, value] of Object.entries(obj)) {
          const spaces = ' '.repeat(indent);
          
          if (Array.isArray(value)) {
            result += `${spaces}${key}:\n`;
            for (const item of value) {
              result += `${spaces}- ${item}\n`;
            }
          } else if (typeof value === 'object' && value !== null) {
            result += `${spaces}${key}:\n`;
            dumpObject(value, indent + 2);
          } else {
            result += `${spaces}${key}: ${value}\n`;
          }
        }
      };
      
      dumpObject(obj);
      return result;
    } catch (error) {
      logger.error(`Error dumping YAML: ${error.message}`);
      return '';
    }
  }
};

// Try to use js-yaml or fall back to simplified parser
let yaml;
try {
  // Try to import js-yaml dynamically
  const importedYaml = await import('js-yaml');
  yaml = importedYaml.default || importedYaml;
  logger.debug('Using js-yaml for YAML parsing');
} catch (error) {
  // If import fails, use simplified parser
  logger.warn('js-yaml not available, using simplified YAML parser (limited functionality)');
  yaml = simplifiedYamlParser;
}

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

/**
 * Read package.json to get available scripts
 * @param {string} packageJsonPath - Path to package.json
 * @returns {Object} Package.json contents and scripts
 */
function readPackageJson(packageJsonPath = path.join(rootDir, 'package.json')) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return {
      success: true,
      scripts: Object.keys(packageJson.scripts || {}),
      packageJson
    };
  } catch (error) {
    logger.error(`Error reading package.json: ${error.message}`);
    return {
      success: false,
      error: error.message,
      scripts: []
    };
  }
}

/**
 * Get all workflow files
 * @param {string} workflowDir - Directory containing workflow files
 * @returns {Array} List of workflow files
 */
function getWorkflowFiles(workflowDir = path.join(rootDir, '.github', 'workflows')) {
  try {
    if (!fs.existsSync(workflowDir)) {
      return {
        success: false,
        error: `Workflow directory ${workflowDir} not found`,
        files: []
      };
    }
    
    const files = fs.readdirSync(workflowDir)
      .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))
      .map(file => path.join(workflowDir, file));
    
    return {
      success: true,
      files,
      count: files.length
    };
  } catch (error) {
    logger.error(`Error reading workflow directory: ${error.message}`);
    return {
      success: false,
      error: error.message,
      files: []
    };
  }
}

/**
 * Extract run commands from a workflow
 * @param {Object} obj - Workflow object or part of it
 * @returns {Array} List of script names
 */
function extractRunCommands(obj) {
  const runCommands = [];
  
  if (!obj) return runCommands;
  
  if (typeof obj === 'string') {
    // Look for patterns like: npm run script-name, pnpm run script-name, etc.
    const runMatches = obj.match(/(?:npm|yarn|pnpm)\s+run\s+([a-zA-Z0-9:_-]+)/g);
    if (runMatches) {
      runMatches.forEach(match => {
        const scriptName = match.split(/\s+run\s+/)[1];
        runCommands.push(scriptName);
      });
    }
  } else if (Array.isArray(obj)) {
    obj.forEach(item => {
      const commands = extractRunCommands(item);
      runCommands.push(...commands);
    });
  } else if (typeof obj === 'object') {
    Object.values(obj).forEach(value => {
      const commands = extractRunCommands(value);
      runCommands.push(...commands);
    });
  }
  
  return runCommands;
}

/**
 * Check for package manager consistency
 * @param {string} content - Workflow file content
 * @returns {Object} Package managers found
 */
function checkPackageManagerConsistency(content) {
  const contentLower = content.toLowerCase();
  
  // Use a more specific regex pattern to find package manager references
  // This avoids false positives from pnpm/action-setup or similar strings
  const npmPattern = /(?:^|\s|`)npm\s+(run|install|ci|test)/g;
  const yarnPattern = /(?:^|\s|`)yarn\s+(run|install|add)/g;
  const pnpmPattern = /(?:^|\s|`)pnpm\s+(run|install|add)/g;
  
  // Count actual occurrences
  const npmMatches = contentLower.match(npmPattern) || [];
  const yarnMatches = contentLower.match(yarnPattern) || [];
  const pnpmMatches = contentLower.match(pnpmPattern) || [];
  
  // Determine if each package manager is used based on matches
  const hasNpm = npmMatches.length > 0;
  const hasYarn = yarnMatches.length > 0;
  const hasPnpm = pnpmMatches.length > 0;
  
  const packageManagers = [];
  if (hasNpm) packageManagers.push('npm');
  if (hasYarn) packageManagers.push('yarn');
  if (hasPnpm) packageManagers.push('pnpm');
  
  // This project should use pnpm exclusively
  const preferredManager = 'pnpm';
  const usesPreferredManager = packageManagers.includes(preferredManager);
  const hasNonPreferred = packageManagers.filter(pm => pm !== preferredManager).length > 0;
  
  return {
    packageManagers,
    isConsistent: packageManagers.length <= 1,
    count: packageManagers.length,
    usesPreferredManager,
    hasNonPreferred,
    preferredManager
  };
}

/**
 * Validate a single workflow file
 * @param {string} filePath - Path to workflow file
 * @param {Array} availableScripts - Available scripts from package.json
 * @returns {Object} Validation results
 */
function validateWorkflowFile(filePath, availableScripts) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const workflow = yaml.load(content);
    
    // Extract all npm/yarn/pnpm run commands from the workflow
    const runCommands = extractRunCommands(workflow);
    
    // Deduplicate commands
    const uniqueCommands = [...new Set(runCommands)];
    
    // Check if all commands exist in package.json
    const missingScripts = uniqueCommands.filter(cmd => !availableScripts.includes(cmd));
    
    // Check for package manager consistency
    const packageManagerConsistency = checkPackageManagerConsistency(content);
    
    return {
      success: true,
      filePath,
      fileName: path.basename(filePath),
      runCommands: uniqueCommands,
      missingScripts,
      packageManagerConsistency,
      isValid: missingScripts.length === 0 && packageManagerConsistency.isConsistent
    };
  } catch (error) {
    logger.error(`Error validating workflow file ${filePath}: ${error.message}`);
    return {
      success: false,
      filePath,
      fileName: path.basename(filePath),
      error: error.message,
      isValid: false
    };
  }
}

/**
 * Validate all workflow files
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Validation results
 */
export async function validateWorkflows(options = {}) {
  const {
    workflowDir = path.join(rootDir, '.github', 'workflows'),
    packageJsonPath = path.join(rootDir, 'package.json'),
    verbose = false
  } = options;
  
  logger.info('Validating GitHub Actions workflows...');
  
  try {
    // Read package.json
    const packageJsonResult = readPackageJson(packageJsonPath);
    if (!packageJsonResult.success) {
      return {
        success: false,
        error: `Failed to read package.json: ${packageJsonResult.error}`
      };
    }
    
    const availableScripts = packageJsonResult.scripts;
    logger.info(`Found ${availableScripts.length} scripts in package.json`);
    
    // Get workflow files
    const workflowFilesResult = getWorkflowFiles(workflowDir);
    if (!workflowFilesResult.success) {
      return {
        success: false,
        error: `Failed to get workflow files: ${workflowFilesResult.error}`
      };
    }
    
    const workflowFiles = workflowFilesResult.files;
    logger.info(`Found ${workflowFiles.length} workflow files to validate`);
    
    if (workflowFiles.length === 0) {
      logger.warn('No workflow files found to validate');
      return {
        success: true,
        isValid: true,
        message: 'No workflow files found to validate',
        workflowResults: []
      };
    }
    
    // Validate each workflow file
    const workflowResults = workflowFiles.map(file => 
      validateWorkflowFile(file, availableScripts)
    );
    
    // Track issues
    let foundIssues = false;
    let invalidWorkflows = 0;
    
    // Log results
    workflowResults.forEach(result => {
      if (!result.success) {
        logger.error(`Error validating ${result.fileName}: ${result.error}`);
        foundIssues = true;
        invalidWorkflows++;
        return;
      }
      
      logger.info(`Checking ${result.fileName}...`);
      
      if (result.missingScripts && result.missingScripts.length > 0) {
        logger.warn(`Found ${result.missingScripts.length} scripts in ${result.fileName} that don't exist in package.json:`);
        result.missingScripts.forEach(script => logger.warn(`  - ${script}`));
        foundIssues = true;
        invalidWorkflows++;
      } else if (verbose) {
        logger.success(`All scripts in ${result.fileName} exist in package.json`);
      }
      
      // Check package manager consistency and preferences
      if (!result.packageManagerConsistency.isConsistent) {
        logger.warn(`${result.fileName} uses multiple package managers, which may cause issues:`);
        result.packageManagerConsistency.packageManagers.forEach(pm => {
          if (pm !== result.packageManagerConsistency.preferredManager) {
            logger.warn(`  - ${pm} (should be replaced with ${result.packageManagerConsistency.preferredManager})`);
          } else {
            logger.warn(`  - ${pm}`);
          }
        });
        foundIssues = true;
        invalidWorkflows++;
      } else if (result.packageManagerConsistency.packageManagers.length > 0 && 
                !result.packageManagerConsistency.usesPreferredManager) {
        // Workflow is consistent but doesn't use the preferred package manager
        logger.warn(`${result.fileName} uses ${result.packageManagerConsistency.packageManagers[0]} but should use ${result.packageManagerConsistency.preferredManager}`);
        foundIssues = true;
        invalidWorkflows++;
      } else if (verbose) {
        logger.success(`${result.fileName} uses a consistent package manager: ${result.packageManagerConsistency.packageManagers[0] || 'none'}`);
      }
    });
    
    // Prepare final result
    const isValid = !foundIssues;
    
    if (isValid) {
      logger.success('All workflows are valid!');
    } else {
      logger.warn(`Found ${invalidWorkflows} issues in ${workflowFiles.length} workflow files`);
    }
    
    return {
      success: true,
      isValid,
      invalidWorkflows,
      totalWorkflows: workflowFiles.length,
      workflowResults
    };
  } catch (error) {
    logger.error(`Error in workflow validation: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
} 