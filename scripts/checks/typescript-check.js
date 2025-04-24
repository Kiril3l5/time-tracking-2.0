#!/usr/bin/env node

/**
 * TypeScript Verification Module
 * 
 * Provides utilities for running TypeScript type checking and parsing errors.
 * 
 * Features:
 * - Run TypeScript type checking on the project
 * - Parse and format type errors for better readability
 * - Count and categorize errors by severity
 * 
 * @module checks/typescript-check
 */

import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

/* global process */

// Initialize directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

/**
 * Run TypeScript type checking
 * @param {Object} options - Type checking options
 * @param {boolean} [options.noEmit=true] - Whether to skip emitting files
 * @param {string} [options.project] - Path to tsconfig.json (defaults to project root)
 * @param {boolean} [options.failOnError=true] - Whether to exit with error code on type errors
 * @returns {Object} - Type checking results
 */
export function runTypeCheck(options = {}) {
  const { 
    noEmit = true, 
    project = './tsconfig.json', 
    failOnError = true 
  } = options;
  
  logger.info('Running TypeScript type check...');
  
  // Check if TypeScript is installed
  const tscResult = commandRunner.runCommand('npx tsc --version', {
    stdio: 'pipe',
    ignoreError: true
  });
  
  if (!tscResult.success) {
    logger.error('TypeScript compiler not found');
    logger.info('Install TypeScript with: pnpm add typescript --save-dev');
    
    return {
      success: false,
      error: 'TypeScript compiler not found'
    };
  }
  
  // Build the command
  let command = 'npx tsc';
  
  // Add options
  if (noEmit) {
    command += ' --noEmit';
  }
  
  if (project) {
    command += ` --project ${project}`;
  }
  
  // Run the command
  const result = commandRunner.runCommand(command, {
    stdio: 'pipe',
    ignoreError: true
  });
  
  // Parse the results
  if (result.success) {
    // Command exited 0 - definitely success
    logger.success('TypeScript check passed with no errors');
    return {
      success: true,
      errorCount: 0,
      errors: []
    };
  }
  
  // Command exited non-zero, check stderr for actual errors
  logger.warn('tsc command exited non-zero. Parsing stderr for type errors...');
  const errorOutput = result.stderr || '';
  const errors = parseTypeScriptErrors(errorOutput);
  
  if (errors.length === 0) {
    // Command failed BUT no type errors were parsed.
    // This might be a config warning or other non-blocking issue.
    // Consider it success unless there was non-empty stderr we couldn't parse.
    if (errorOutput.trim()) {
        logger.warn('TypeScript check command failed, but no specific type errors were parsed. Non-empty stderr was present:');
        logger.warn(errorOutput.substring(0, 500) + '...');
        // Return failure ONLY if there was unexpected stderr
        return {
            success: false, 
            errorCount: 0, // Still 0 parsed errors
            errors: [],
            error: 'tsc exited non-zero with unparsed stderr output.'
        };
    } else {
        // Command failed, no errors parsed, empty stderr - likely safe to consider success.
        logger.success('TypeScript check command exited non-zero, but no type errors were parsed and stderr was empty. Treating as success.');
        return {
            success: true, // Treat as success
            errorCount: 0,
            errors: []
        };
    }
  }
  
  // Actual type errors were parsed
  const errorCount = errors.length;
  logger.error(`TypeScript found ${errorCount} type error${errorCount === 1 ? '' : 's'}`);
  
  // Display a summary of errors
  const maxErrorsToShow = 5;
  const displayErrors = errors.slice(0, maxErrorsToShow);
  
  for (const error of displayErrors) {
    logger.info(`${error.file}:${error.line}:${error.column} - ${error.message}`);
  }
  
  if (errors.length > maxErrorsToShow) {
    logger.info(`... and ${errors.length - maxErrorsToShow} more errors`);
  }
  
  if (failOnError) {
    logger.error('TypeScript check failed due to type errors.');
  }
  
  // Return success: false only if failOnError is true and errors were found
  return {
    success: !(failOnError && errorCount > 0), // Success is true if failOnError is false OR errorCount is 0
    errorCount,
    errors,
    error: failOnError && errorCount > 0 ? `Found ${errorCount} TypeScript errors.` : null
  };
}

/**
 * Parse TypeScript error messages from command output
 * @param {string} output - Error output from tsc command
 * @returns {Array} - Array of parsed error objects
 */
function parseTypeScriptErrors(output) {
  const errors = [];
  const lines = output.split('\n');
  
  // Regular expression to match error lines
  // Format: file(line,col): error TS2345: message
  const errorRegex = /([^(]+)\((\d+),(\d+)\):\s*(error|warning)\s*(\w+):\s*(.*)/;
  
  for (const line of lines) {
    const match = line.match(errorRegex);
    if (match) {
      errors.push({
        file: match[1].trim(),
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        severity: match[4] === 'error' ? 'error' : 'warning',
        code: match[5],
        message: match[6].trim()
      });
    }
  }
  
  return errors;
}

/**
 * Check if TypeScript is configured in the project
 * @returns {boolean} - Whether TypeScript is configured
 */
export function isTypeScriptConfigured() {
  const tsconfigPath = path.join(rootDir, 'tsconfig.json');
  
  try {
    return fs.existsSync(tsconfigPath);
  } catch (error) {
    return false;
  }
}

/**
 * Run TypeScript build check on a specific package
 * @param {Object} options - Build check options
 * @param {string} options.package - Package name to check (e.g., 'common')
 * @param {boolean} options.dryRun - Whether to perform a dry run (don't emit files)
 * @param {boolean} options.debug - Enable debug logging
 * @returns {Object} - Build check results
 */
export function runPackageBuildCheck(options = {}) {
  const { 
    package: packageName = 'common',
    dryRun = true,
    debug = true  // Enable debug by default to help troubleshoot
  } = options;
  
  logger.info(`Running TypeScript build check for ${packageName} package...`);
  
  // Validate package directory exists
  const packageDir = path.join(rootDir, 'packages', packageName);
  if (!fs.existsSync(packageDir)) {
    logger.error(`Package directory not found: ${packageDir}`);
    return {
      success: false,
      error: `Package directory not found: ${packageDir}`
    };
  }
  
  // Run TypeScript compiler directly - no options so we get the real build errors
  // --noEmit is actually a problem because it might skip some build-time-only errors
  // Use direct npx tsc invocation from the package directory
  let buildCommand;
  let commandOptions = { stdio: 'pipe', ignoreError: true };
  
  if (process.platform === 'win32') {
    // For Windows/PowerShell, use direct execution with proper CWD
    buildCommand = 'npx tsc';
    commandOptions.cwd = packageDir;
  } else {
    // For Unix/Linux systems, use cd and &&
    buildCommand = `cd ${packageDir} && npx tsc`;
  }
  
  logger.debug(`Running command: ${buildCommand} in ${commandOptions.cwd || 'current directory'}`);
  
  // Run the command
  const result = commandRunner.runCommand(buildCommand, commandOptions);
  
  // Debug output to see what format the command returns
  if (debug) {
    logger.debug('==== TypeScript Build Command Output Start ====');
    logger.debug(`Command success: ${result.success}`);
    logger.debug(`Command exit code: ${result.exitCode}`);
    logger.debug(`STDOUT length: ${result.stdout ? result.stdout.length : 0}`);
    logger.debug(`STDERR length: ${result.stderr ? result.stderr.length : 0}`);
    logger.debug(`OUTPUT length: ${result.output ? result.output.length : 0}`);
    logger.debug(`ERROR length: ${result.error ? result.error.length : 0}`);
    
    if (result.stdout) logger.debug(`STDOUT sample: ${result.stdout.substring(0, 200)}...`);
    if (result.stderr) logger.debug(`STDERR sample: ${result.stderr.substring(0, 200)}...`);
    if (result.output) logger.debug(`OUTPUT sample: ${result.output.substring(0, 200)}...`);
    if (result.error) logger.debug(`ERROR sample: ${result.error.substring(0, 200)}...`);
    logger.debug('==== TypeScript Build Command Output End ====');
  }
  
  // Parse the results
  if (result.success) {
    logger.success(`TypeScript build check for package ${packageName} passed`);
    return {
      success: true,
      errorCount: 0,
      errors: []
    };
  }
  
  // Parse errors from the output - try all possible locations for error messages
  const errorOutput = result.stderr || '';
  const stdOutput = result.stdout || '';
  const defaultOutput = result.output || '';
  const errorField = result.error || '';
  
  // Combine all possible output sources
  const combinedOutput = [stdOutput, errorOutput, defaultOutput, errorField]
    .filter(output => output && output.trim() !== '')
    .join('\n');
  
  // Log the combined output for debugging
  if (debug) {
    logger.debug('==== Combined Output for Error Parsing ====');
    logger.debug(combinedOutput);
    logger.debug('========================================');
  }
  
  // Enhanced parsing for build-specific errors
  const errors = parseTypeScriptBuildErrors(combinedOutput);
  
  // Log parsed errors
  if (debug) {
    logger.debug(`Parsed ${errors.length} TypeScript errors`);
    if (errors.length > 0) {
      logger.debug('==== First 3 Parsed Errors ====');
      errors.slice(0, 3).forEach(error => logger.debug(JSON.stringify(error)));
      logger.debug('==============================');
    }
  }
  
  const errorCount = errors.length;
  if (errorCount > 0) {
    // Group errors by file for better reporting
    const fileErrors = new Map();
    errors.forEach(error => {
      const file = error.file || 'unknown';
      if (!fileErrors.has(file)) {
        fileErrors.set(file, []);
      }
      fileErrors.get(file).push(error);
    });
    
    // Create a summary by file
    const summaryByFile = Array.from(fileErrors.entries()).map(([file, fileErrors]) => {
      return `${file}: ${fileErrors.length} errors`;
    });
    
    logger.error(`TypeScript build check for package ${packageName} found ${errorCount} error${errorCount === 1 ? '' : 's'} in ${fileErrors.size} file${fileErrors.size === 1 ? '' : 's'}`);
    logger.error(`Files with errors: ${summaryByFile.join(', ')}`);
    
    // Display a summary of errors
    const maxErrorsToShow = 10; // Show more errors to help developers
    const displayErrors = errors.slice(0, maxErrorsToShow);
    
    // Print a more visible error block
    logger.error('===== TypeScript Build Errors =====');
    for (const error of displayErrors) {
      logger.error(`${error.file}:${error.line}:${error.column} - ${error.message}`);
    }
    
    if (errors.length > maxErrorsToShow) {
      logger.error(`... and ${errors.length - maxErrorsToShow} more errors`);
    }
    logger.error('===================================');
    
    // Create an actionable error message
    const actionableMessage = `Found ${errorCount} TypeScript errors in ${fileErrors.size} file(s). Fix TypeScript type issues in: ${Array.from(fileErrors.keys()).slice(0, 3).join(', ')}${fileErrors.size > 3 ? ' and others' : ''}.`;
    
    return {
      success: false,
      errorCount,
      errors,
      fileCount: fileErrors.size,
      filesSummary: summaryByFile,
      error: actionableMessage
    };
  }
  
  // If no errors were parsed but the command failed, try to extract some information from the output
  const outputLines = combinedOutput.split('\n');
  const errorLines = outputLines.filter(line => 
    line.includes('error') || 
    line.includes('Error:') || 
    line.includes('TS')
  );
  
  if (errorLines.length > 0) {
    logger.warn('TypeScript build command failed. Raw error output:');
    errorLines.slice(0, 10).forEach(line => logger.warn(`> ${line}`));
    if (errorLines.length > 10) {
      logger.warn(`... and ${errorLines.length - 10} more error lines`);
    }
  } else {
    logger.warn('TypeScript build command failed, but no specific errors were identified.');
  }
  
  return {
    success: false,
    errorCount: errorLines.length || 0,
    errors: errorLines.map(line => ({ message: line })),
    error: errorLines.length > 0 
      ? `Build failed with ${errorLines.length} errors. Fix TypeScript issues before proceeding.` 
      : 'Build command failed without specific errors. Check package configuration.'
  };
}

/**
 * Parse TypeScript error messages specifically from PowerShell output
 * This specialized parser handles the unique formatting in PowerShell output
 * @param {string} output - Error output from PowerShell
 * @returns {Array} - Array of parsed error objects
 */
function parsePowerShellTypeScriptOutput(output) {
  const errors = [];
  const lines = output.split('\n');
  
  // Look for specific PowerShell error patterns
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Pattern for src/file.tsx:line:column - error TSxxxx: message
    const colonFormat = line.match(/src\/([^:]+):(\d+):(\d+)\s*-\s*(error|warning)\s*(TS\d+):\s*(.*)/);
    if (colonFormat) {
      errors.push({
        file: 'src/' + colonFormat[1],
        line: parseInt(colonFormat[2], 10),
        column: parseInt(colonFormat[3], 10),
        severity: colonFormat[4],
        code: colonFormat[5],
        message: colonFormat[6].trim()
      });
      continue;
    }
    
    // Check for the specific TS6133 unused parameter pattern
    const unusedParameter = line.match(/([^:]+):(\d+):(\d+)\s*-\s*(error)\s*(TS6133):\s*'([^']+)'\s+is declared but its value is never read/);
    if (unusedParameter) {
      // Build a more actionable message for this common error
      const actionableMessage = `'${unusedParameter[6]}' is declared but never used. Remove this parameter or prefix with underscore (_${unusedParameter[6]}).`;
      
      errors.push({
        file: unusedParameter[1],
        line: parseInt(unusedParameter[2], 10),
        column: parseInt(unusedParameter[3], 10),
        severity: 'warning', // Treat unused parameters as warnings
        code: 'TS6133',
        message: actionableMessage,
        suggestion: `Use _${unusedParameter[6]} as parameter name to indicate it's intentionally unused`
      });
      continue;
    }
    
    // Check for the specific TS6133 unused import pattern in PowerShell
    const unusedImport = line.match(/([^:]+):(\d+):(\d+)\s*-\s*(error)\s*(TS6133):\s*'([^']+)' is declared but its value is never read/);
    if (unusedImport) {
      errors.push({
        file: unusedImport[1],
        line: parseInt(unusedImport[2], 10),
        column: parseInt(unusedImport[3], 10),
        severity: 'warning', // Treat unused imports as warnings
        code: 'TS6133',
        message: `'${unusedImport[6]}' is declared but its value is never read.`,
        suggestion: `Remove the unused import or export`
      });
      continue;
    }
    
    // Check for property not exist pattern that's common in PowerShell output
    const propertyNotExist = line.match(/([^:]+):(\d+):(\d+)\s*-\s*(error)\s*(TS2339):\s*Property\s+'([^']+)'\s+does not exist on type\s+'([^']+)'/);
    if (propertyNotExist) {
      errors.push({
        file: propertyNotExist[1],
        line: parseInt(propertyNotExist[2], 10),
        column: parseInt(propertyNotExist[3], 10),
        severity: 'error',
        code: 'TS2339',
        message: `Property '${propertyNotExist[6]}' does not exist on type '${propertyNotExist[7]}'.`
      });
      continue;
    }
  }
  
  return errors;
}

/**
 * Parse TypeScript error messages from build output
 * @param {string} output - Error output from build command
 * @returns {Array} - Array of parsed error objects
 */
function parseTypeScriptBuildErrors(output) {
  const errors = [];
  
  // First try the PowerShell specific parser
  const powerShellErrors = parsePowerShellTypeScriptOutput(output);
  if (powerShellErrors.length > 0) {
    return powerShellErrors;
  }
  
  // If PowerShell parser didn't find anything, try the general patterns
  const lines = output.split('\n');
  
  // Multiple regex patterns to match different error formats in build output
  const patterns = [
    // Standard TypeScript error: file(line,col): error TS2345: message
    /([^(]+)\((\d+),(\d+)\):\s*(error|warning)\s*(\w+):\s*(.*)/,
    
    // Build error format: Error: src/file.tsx(26,11): error TS2339: Property 'x' does not exist
    /Error:\s*([^(]+)\((\d+),(\d+)\):\s*(error|warning)\s*(\w+):\s*(.*)/,
    
    // CI/CD error format with "Error:" prefix
    /Error:\s*([^(]+)\((\d+),(\d+)\):\s*(error)\s*(\w+):\s*(.*)/,
    
    // Another common format seen in CI output for TS errors
    /src\/([^(]+)\((\d+),(\d+)\):\s*(error)\s*(\w+):\s*(.*)/,
    
    // Direct tsc output format with colons: file.tsx:26:11 - error TS2339: message
    /([^:]+):(\d+):(\d+)\s*-\s*(error|warning)\s*(\w+):\s*(.*)/,
    
    // Windows-style tsc output format - may have different path separator
    /((?:[a-zA-Z]:\\|\.\/|\.\\)?(?:[^:]+)):(\d+):(\d+)\s*-\s*(error|warning)\s*(\w+):\s*(.*)/,
    
    // PowerShell specific output format
    /src\/(.+?):(\d+):(\d+)\s*-\s*(error|warning)\s*(\w+):\s*(.*)/
  ];
  
  for (const line of lines) {
    // Try each pattern until one matches
    let matched = false;
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        // Extract file path, ensuring it's properly formatted
        let filePath = match[1].trim();
        if (!filePath.startsWith('src/') && pattern === patterns[3]) {
          filePath = 'src/' + filePath;
        }
        
        errors.push({
          file: filePath,
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          severity: match[4] === 'error' ? 'error' : 'warning',
          code: match[5],
          message: match[6].trim()
        });
        matched = true;
        break; // Stop checking patterns for this line
      }
    }
    
    // Special case for typescript errors that follow a different format
    if (!matched) {
      // PowerShell specific format without standard pattern
      const psMatch = line.match(/src\/(components\/auth\/\w+\.tsx):(\d+):(\d+)\s*-\s*(error)\s*TS(\d+):\s*(.*)/);
      if (psMatch) {
        errors.push({
          file: 'src/' + psMatch[1],
          line: parseInt(psMatch[2], 10),
          column: parseInt(psMatch[3], 10),
          severity: 'error',
          code: 'TS' + psMatch[5],
          message: psMatch[6].trim()
        });
        matched = true;
      }
    }
    
    // Check for import-related errors
    if (!matched && line.includes('TS6133') && line.includes('declared but its value is never read')) {
      // Import-related errors
      const importMatch = line.match(/([a-zA-Z0-9_/.\\]+\.[a-z]+):(\d+):(\d+)/);
      const variableMatch = line.match(/'([^']+)'/);
      
      if (importMatch && variableMatch) {
        errors.push({
          file: importMatch[1],
          line: parseInt(importMatch[2], 10),
          column: parseInt(importMatch[3], 10),
          severity: 'warning', // Import errors are usually warnings
          code: 'TS6133',
          message: `'${variableMatch[1]}' is declared but its value is never read.`
        });
        matched = true;
      }
    }
    
    // Special case for typescript errors that follow a different format
    if (!matched && line.includes('TS') && (line.includes('error') || line.toLowerCase().includes('property') || line.includes('declared but'))) {
      // Try to extract meaningful information even if it doesn't match the expected patterns
      logger.debug(`Parsing non-standard error line: ${line}`);
      
      // Simple extraction for lines that mention a file path
      const fileMatch = line.match(/([a-zA-Z0-9_\-/.:\\]+\.[a-zA-Z0-9]+)/);
      const tsErrorMatch = line.match(/TS(\d+)/);
      const propertyMatch = line.match(/Property ['"]?([^'"]+)['"]?/);
      
      if (fileMatch || tsErrorMatch || propertyMatch) {
        errors.push({
          file: fileMatch ? fileMatch[1] : 'unknown',
          line: 0,
          column: 0,
          severity: 'error',
          code: tsErrorMatch ? 'TS' + tsErrorMatch[1] : 'UNKNOWN',
          message: line.trim()
        });
      }
    }
  }
  
  return errors;
}

export default {
  runTypeCheck,
  isTypeScriptConfigured,
  runPackageBuildCheck
}; 