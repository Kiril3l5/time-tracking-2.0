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
import { logger } from '../core/logger.js';

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
 * Validate a workflow file for required security checks
 * @param {Object} workflow - Parsed workflow content
 * @returns {Object} Validation results
 */
function validateSecurityChecks(workflow) {
  const results = {
    success: true,
    issues: [],
    warnings: []
  };

  // Required security checks
  const requiredChecks = {
    'dependency-audit': false,
    'code-scanning': false,
    'secret-scanning': false,
    'vulnerability-scan': false
  };

  // Check jobs for security steps
  const jobs = workflow.jobs || {};
  for (const [_, job] of Object.entries(jobs)) {
    const steps = job.steps || [];
    for (const step of steps) {
      // Check for dependency audit
      if (step.run && /npm audit|yarn audit|pnpm audit/.test(step.run)) {
        requiredChecks['dependency-audit'] = true;
      }
      // Check for code scanning
      if (step.uses && step.uses.startsWith('github/codeql-action')) {
        requiredChecks['code-scanning'] = true;
      }
      // Check for secret scanning
      if (step.uses && step.uses.includes('secret-scanning')) {
        requiredChecks['secret-scanning'] = true;
      }
      // Check for vulnerability scanning
      if (step.run && /security|vulnerability|CVE|scan/.test(step.run)) {
        requiredChecks['vulnerability-scan'] = true;
      }
    }
  }

  // Report missing checks
  for (const [check, found] of Object.entries(requiredChecks)) {
    if (!found) {
      results.issues.push(`Missing required security check: ${check}`);
      results.success = false;
    }
  }

  return results;
}

/**
 * Validate a workflow file
 * @param {string} filePath - Path to workflow file
 * @param {Array} availableScripts - List of available package.json scripts
 * @returns {Object} Validation results
 */
function validateWorkflowFile(filePath, availableScripts) {
  const results = {
    success: true,
    issues: [],
    warnings: [],
    stats: {
      scripts: {
        total: 0,
        missing: 0
      },
      packageManagers: []
    }
  };

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const workflow = yaml.load(content);

    // Extract and validate script names
    const runCommands = extractRunCommands(workflow);
    results.stats.scripts.total = runCommands.length;

    for (const script of runCommands) {
      if (!availableScripts.includes(script)) {
        results.issues.push(`Script "${script}" not found in package.json`);
        results.stats.scripts.missing++;
      }
    }

    // Check package manager consistency
    const packageManagerResults = checkPackageManagerConsistency(content);
    results.stats.packageManagers = packageManagerResults.packageManagers;

    if (packageManagerResults.packageManagers.length > 1) {
      results.issues.push(
        `Multiple package managers found: ${packageManagerResults.packageManagers.join(', ')}`
      );
    }

    // Validate security checks
    const securityResults = validateSecurityChecks(workflow);
    if (!securityResults.success) {
      results.issues.push(...securityResults.issues);
    }

    // Check for environment variables
    if (workflow.env) {
      const sensitivePatterns = ['key', 'token', 'password', 'secret', 'credential'];
      for (const [key, value] of Object.entries(workflow.env)) {
        if (typeof value === 'string' && sensitivePatterns.some(pattern => key.toLowerCase().includes(pattern))) {
          results.issues.push(`Potential hardcoded secret in environment variable: ${key}`);
        }
      }
    }

    // Check for proper environment setup
    const hasSetupNode = workflow.jobs && Object.values(workflow.jobs).some(job => 
      (job.steps || []).some(step => step.uses && step.uses.startsWith('actions/setup-node'))
    );
    if (!hasSetupNode) {
      results.warnings.push('No Node.js setup step found in workflow');
    }

    results.success = results.issues.length === 0;
    return results;

  } catch (error) {
    logger.error(`Error validating workflow file ${filePath}:`, error);
    return {
      success: false,
      issues: [`Failed to validate workflow file: ${error.message}`],
      warnings: [],
      stats: {
        scripts: { total: 0, missing: 0 },
        packageManagers: []
      }
    };
  }
}

/**
 * Validate workflows
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Validation results
 */
export async function validateWorkflows(options = {}) {
  const { verbose = false } = options;
  
  // Get available scripts from package.json
  const packageJsonResult = readPackageJson();
  if (!packageJsonResult.success) {
    logger.error('Failed to read package.json:', packageJsonResult.error);
    return { success: false };
  }
  
  // Get workflow files
  const workflowFilesResult = getWorkflowFiles();
  if (!workflowFilesResult.success) {
    logger.error('Failed to get workflow files:', workflowFilesResult.error);
    return { success: false };
  }
  
  let foundIssues = false;
  let invalidWorkflows = 0;
  
  // Validate each workflow file
  const workflowResults = workflowFilesResult.files.map(filePath => {
    const result = validateWorkflowFile(filePath, packageJsonResult.scripts);
    const fileName = path.basename(filePath);
    
    if (!result.success) {
      logger.error(`Error validating ${fileName}: ${result.issues.join(', ')}`);
      foundIssues = true;
      invalidWorkflows++;
      return result;
    }
    
    logger.info(`Checking ${fileName}...`);
    
    if (result.stats.scripts.missing > 0) {
      logger.warn(`Found ${result.stats.scripts.missing} scripts in ${fileName} that don't exist in package.json:`);
      result.issues.forEach(issue => logger.warn(`  - ${issue}`));
      foundIssues = true;
      invalidWorkflows++;
    } else if (verbose) {
      logger.success(`All scripts in ${fileName} exist in package.json`);
    }
    
    // Check package manager consistency and preferences
    if (result.stats.packageManagers.length > 1) {
      logger.warn(`${fileName} uses multiple package managers, which may cause issues:`);
      result.stats.packageManagers.forEach(pm => {
        logger.warn(`  - ${pm}`);
      });
      foundIssues = true;
      invalidWorkflows++;
    } else if (verbose) {
      logger.success(`${fileName} uses a consistent package manager: ${result.stats.packageManagers[0] || 'none'}`);
    }
    
    return result;
  });
  
  // Report overall status
  if (foundIssues) {
    logger.error(`Found issues in ${invalidWorkflows} workflow files`);
    return { success: false, invalidWorkflows };
  }
  
  logger.success('All workflow files validated successfully');
  return { success: true };
} 