#!/usr/bin/env node

/**
 * TypeScript Type Validator Module
 * 
 * Provides utilities for validating TypeScript types, analyzing errors,
 * and providing suggestions for fixing common type issues.
 * 
 * Features:
 * - Run TypeScript compiler for type checking
 * - Parse and categorize TypeScript errors
 * - Provide suggestions for fixing type errors
 * - Generate error reports
 * 
 * @module typescript/type-validator
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';

/* global process */

/**
 * Run TypeScript type checking
 * 
 * @param {Object} options - Type checking options
 * @param {boolean} [options.project=true] - Whether to use tsconfig.json
 * @param {string} [options.configPath='tsconfig.json'] - Path to tsconfig.json
 * @param {string[]} [options.files=[]] - Files to check (if not using project)
 * @param {boolean} [options.verbose=false] - Whether to show detailed output
 * @returns {Promise<Object>} - Type checking result
 */
export async function runTypeCheck(options = {}) {
  const {
    project = true,
    configPath = 'tsconfig.json',
    files = [],
    verbose = false
  } = options;
  
  logger.info('Running TypeScript type checking...');
  
  // Build the command
  let command = 'tsc';
  
  if (project) {
    // Use project configuration
    if (configPath && configPath !== 'tsconfig.json') {
      command += ` --project ${configPath}`;
    }
  } else if (files.length > 0) {
    // Check specific files
    command += ` ${files.join(' ')}`;
  }
  
  // Always use --noEmit to only check types without generating output files
  command += ' --noEmit';
  
  const result = await commandRunner.runCommandAsync(command, {
    ignoreError: true,
    verbose
  });
  
  // Parse the output
  const parsedErrors = parseTypeScriptErrors(result.output || '');
  
  const success = parsedErrors.length === 0;
  
  if (success) {
    logger.success('TypeScript type checking passed');
  } else {
    logger.error(`TypeScript type checking failed with ${parsedErrors.length} errors`);
  }
  
  return {
    success,
    command,
    errors: parsedErrors,
    rawOutput: result.output
  };
}

/**
 * Parse TypeScript errors from command output
 * 
 * @param {string} output - Command output from tsc
 * @returns {Array} - Parsed errors
 */
export function parseTypeScriptErrors(output) {
  const errors = [];
  
  // Regex to match TS error pattern: file(line,col): error TS1234: message
  const errorRegex = /^(.+)\((\d+),(\d+)\): error (TS\d+): (.+)$/gm;
  
  let match;
  while ((match = errorRegex.exec(output)) !== null) {
    const [_, file, line, column, code, message] = match;
    
    errors.push({
      file,
      line: parseInt(line, 10),
      column: parseInt(column, 10),
      code,
      message,
      category: categorizeTypeError(code, message)
    });
  }
  
  return errors;
}

/**
 * Categorize TypeScript errors
 * 
 * @param {string} code - Error code (e.g., TS2322)
 * @param {string} message - Error message
 * @returns {string} - Error category
 */
export function categorizeTypeError(code, message) {
  // Common error categories based on code and message patterns
  if (code === 'TS2322' || code === 'TS2345') {
    return 'type-mismatch';
  }
  
  if (code === 'TS2531' || message.includes('undefined') || message.includes('null')) {
    return 'null-undefined';
  }
  
  if (code === 'TS2551' || code === 'TS2339') {
    return 'missing-property';
  }
  
  if (code === 'TS2304') {
    return 'unknown-identifier';
  }
  
  if (code === 'TS1005' || code === 'TS1128') {
    return 'syntax-error';
  }
  
  if (message.includes('import') || message.includes('export')) {
    return 'import-export';
  }
  
  return 'other';
}

/**
 * Generate suggestions for common TypeScript errors
 * 
 * @param {Object} error - Parsed TypeScript error
 * @returns {string[]} - Array of suggestions
 */
export function suggestErrorFix(error) {
  const suggestions = [];
  
  switch (error.category) {
    case 'type-mismatch':
      suggestions.push('Check if you\'re passing the correct type of value');
      suggestions.push('Use type assertions if you\'re sure the type is correct (e.g., `as Type`)');
      suggestions.push('Update the expected type in the function/variable declaration');
      break;
      
    case 'null-undefined':
      suggestions.push('Use optional chaining (e.g., `obj?.prop`) to safely access potentially undefined properties');
      suggestions.push('Add null/undefined checks before accessing properties');
      suggestions.push('Use a default value with the nullish coalescing operator (e.g., `value ?? defaultValue`)');
      break;
      
    case 'missing-property':
      suggestions.push('Check for typos in property name');
      suggestions.push('Make sure the object has been initialized with the required properties');
      suggestions.push('Update the type definition if the property should be optional');
      break;
      
    case 'unknown-identifier':
      suggestions.push('Import the required module or type');
      suggestions.push('Check for typos in variable/type name');
      suggestions.push('Define the variable or type before using it');
      break;
      
    case 'import-export':
      suggestions.push('Check that the imported module exists');
      suggestions.push('Verify that the exported name matches the import');
      suggestions.push('Make sure the export is properly defined in the source module');
      break;
      
    case 'syntax-error':
      suggestions.push('Check for missing semicolons, brackets, or other syntax elements');
      suggestions.push('Verify that JSX syntax is properly formatted');
      break;
      
    default:
      suggestions.push('Review the TypeScript documentation for this error code');
      suggestions.push('Check for similar issues in the codebase that have been resolved');
  }
  
  return suggestions;
}

/**
 * Generate a human-readable error report
 * 
 * @param {Array} errors - Parsed TypeScript errors
 * @param {Object} [options] - Report options
 * @param {boolean} [options.includeSuggestions=true] - Whether to include fix suggestions
 * @param {boolean} [options.groupByFile=true] - Whether to group errors by file
 * @returns {string} - Formatted error report
 */
export function generateErrorReport(errors, options = {}) {
  const {
    includeSuggestions = true,
    groupByFile = true
  } = options;
  
  if (errors.length === 0) {
    return 'No TypeScript errors found.';
  }
  
  let report = `Found ${errors.length} TypeScript errors:\n\n`;
  
  if (groupByFile) {
    // Group errors by file
    const fileGroups = {};
    
    for (const error of errors) {
      if (!fileGroups[error.file]) {
        fileGroups[error.file] = [];
      }
      fileGroups[error.file].push(error);
    }
    
    // Generate report for each file
    for (const [file, fileErrors] of Object.entries(fileGroups)) {
      report += `File: ${file} (${fileErrors.length} errors)\n`;
      report += ''.padStart(80, '-') + '\n';
      
      for (const error of fileErrors) {
        report += `Line ${error.line}, Column ${error.column}: ${error.code} - ${error.message}\n`;
        
        if (includeSuggestions) {
          const suggestions = suggestErrorFix(error);
          if (suggestions.length > 0) {
            report += 'Suggestions:\n';
            for (const suggestion of suggestions) {
              report += `  - ${suggestion}\n`;
            }
          }
        }
        
        report += '\n';
      }
    }
  } else {
    // List all errors without grouping
    for (const error of errors) {
      report += `${error.file}:${error.line}:${error.column} - ${error.code}: ${error.message}\n`;
      
      if (includeSuggestions) {
        const suggestions = suggestErrorFix(error);
        if (suggestions.length > 0) {
          report += 'Suggestions:\n';
          for (const suggestion of suggestions) {
            report += `  - ${suggestion}\n`;
          }
        }
      }
      
      report += '\n';
    }
  }
  
  return report;
}

/**
 * Save error report to file
 * 
 * @param {Array} errors - Parsed TypeScript errors
 * @param {string} [filePath='typescript-errors.log'] - Output file path
 * @param {Object} [options] - Report options
 * @returns {boolean} - Whether the save was successful
 */
export function saveErrorReport(errors, filePath = 'typescript-errors.log', options = {}) {
  logger.info(`Saving TypeScript error report to ${filePath}`);
  
  try {
    const report = generateErrorReport(errors, options);
    fs.writeFileSync(filePath, report, 'utf8');
    logger.success(`Error report saved to ${filePath}`);
    return true;
  } catch (error) {
    logger.error(`Failed to save error report: ${error.message}`);
    return false;
  }
}

export default {
  runTypeCheck,
  parseTypeScriptErrors,
  categorizeTypeError,
  suggestErrorFix,
  generateErrorReport,
  saveErrorReport
}; 