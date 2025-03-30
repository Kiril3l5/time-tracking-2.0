#!/usr/bin/env node

/**
 * ESLint Verification Module
 * 
 * Provides utilities for running ESLint checks and parsing the results.
 * 
 * Features:
 * - Run ESLint on specific files or the entire project
 * - Parse and format lint errors for readability
 * - Filter and count errors by severity
 * 
 * @module checks/lint-check
 */

import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import fs from 'fs';

/* global process */

// Initialize directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

/**
 * Run ESLint on specified files or directories
 * @param {Object} options - Lint options
 * @param {string[]} [options.targets] - Files or directories to lint (defaults to entire project)
 * @param {boolean} [options.fix=false] - Whether to automatically fix lint issues
 * @param {boolean} [options.failOnError=true] - Whether to exit with error code on lint errors
 * @returns {Object} - Lint results
 */
export function runLint(options = {}) {
  const { 
    targets = ['.'], 
    fix = false, 
    failOnError = true 
  } = options;
  
  logger.info('Running ESLint check...');
  
  // Build the command
  let command = 'npx eslint';
  
  // Add targets
  command += ' ' + targets.join(' ');
  
  // Add format option for JSON output
  command += ' --format json';
  
  // Add fix flag if needed
  if (fix) {
    command += ' --fix';
  }
  
  // Run the command
  const result = commandRunner.runCommand(command, {
    stdio: 'pipe',
    ignoreError: true,
    verbose: false
  });
  
  // Parse the results
  let parsedResults = [];
  let errorCount = 0;
  let warningCount = 0;
  
  try {
    if (result.output) {
      const jsonOutput = JSON.parse(result.output);
      parsedResults = jsonOutput;
      
      // Count errors and warnings
      for (const fileResult of jsonOutput) {
        errorCount += fileResult.errorCount || 0;
        warningCount += fileResult.warningCount || 0;
      }
    }
  } catch (error) {
    logger.warn(`Failed to parse ESLint output: ${error.message}`);
  }
  
  // Report results
  if (errorCount === 0 && warningCount === 0) {
    logger.success('ESLint check passed with no issues');
    return {
      success: true,
      errorCount: 0,
      warningCount: 0,
      results: parsedResults
    };
  }
  
  if (errorCount > 0) {
    logger.error(`ESLint found ${errorCount} errors and ${warningCount} warnings`);
    
    // Display a summary of the errors
    for (const fileResult of parsedResults) {
      if (fileResult.errorCount > 0 || fileResult.warningCount > 0) {
        const relativePath = path.relative(rootDir, fileResult.filePath);
        logger.info(`${relativePath}: ${fileResult.errorCount} errors, ${fileResult.warningCount} warnings`);
        
        // Show the first few errors/warnings
        const maxMessagesToShow = 5;
        const messages = fileResult.messages.slice(0, maxMessagesToShow);
        
        for (const msg of messages) {
          const type = msg.severity === 2 ? 'error' : 'warning';
          logger.info(`  Line ${msg.line}:${msg.column} - ${msg.message} (${type})`);
        }
        
        if (fileResult.messages.length > maxMessagesToShow) {
          logger.info(`  ... and ${fileResult.messages.length - maxMessagesToShow} more issues`);
        }
      }
    }
    
    if (failOnError) {
      logger.error('Lint check failed');
      return {
        success: false,
        errorCount,
        warningCount,
        results: parsedResults
      };
    }
  } else if (warningCount > 0) {
    logger.warn(`ESLint found ${warningCount} warnings`);
  }
  
  return {
    success: errorCount === 0 || !failOnError,
    errorCount,
    warningCount,
    results: parsedResults
  };
}

/**
 * Check if ESLint is configured in the project
 * @returns {boolean} - Whether ESLint is configured
 */
export function isEslintConfigured() {
  const possibleConfigFiles = [
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.yaml',
    '.eslintrc.yml',
    '.eslintrc.json',
    '.eslintrc',
    'package.json'
  ];
  
  for (const configFile of possibleConfigFiles) {
    try {
      const checkCommand = `test -f ${path.join(rootDir, configFile)}`;
      execSync(checkCommand, { stdio: 'ignore' });
      
      // For package.json, check if it contains eslintConfig
      if (configFile === 'package.json') {
        const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, configFile), 'utf8'));
        if (!packageJson.eslintConfig) {
          continue;
        }
      }
      
      return true;
    } catch (error) {
      // File doesn't exist, continue checking
    }
  }
  
  return false;
}

export default {
  runLint,
  isEslintConfigured
}; 