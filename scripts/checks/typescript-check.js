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
    logger.success('TypeScript check passed with no errors');
    return {
      success: true,
      errorCount: 0
    };
  }
  
  // Parse errors from stderr
  const errorOutput = result.stderr || '';
  const errors = parseTypeScriptErrors(errorOutput);
  
  if (errors.length === 0) {
    // No errors parsed, but command failed - could be other issues
    if (errorOutput) {
      logger.error('TypeScript check failed with unexpected output:');
      logger.error(errorOutput);
    } else {
      logger.error('TypeScript check failed with no error output');
    }
    
    return {
      success: false,
      errorCount: 1,
      errors: []
    };
  }
  
  // Count and display errors
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
    logger.error('TypeScript check failed');
  }
  
  return {
    success: !failOnError,
    errorCount,
    errors
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

export default {
  runTypeCheck,
  isTypeScriptConfigured
}; 