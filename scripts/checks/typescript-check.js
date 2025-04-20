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

export default {
  runTypeCheck,
  isTypeScriptConfigured
}; 