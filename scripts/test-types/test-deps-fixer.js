#!/usr/bin/env node

/**
 * Test Dependencies Fixer Module
 * 
 * This module ensures that React and its JSX runtime are properly installed
 * and available for testing. It addresses the common issue with missing jsx-runtime.js.
 * 
 * Can be used standalone or integrated into the preview workflow.
 */

import { execSync } from 'child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import * as logger from '../core/logger.js';

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

/**
 * Run a command and return its result
 * @param {string} command - Command to run
 * @param {Object} options - Options to pass to execSync
 * @returns {Object} Result of the command
 */
function runCommand(command, options = {}) {
  logger.info(`Running: ${command}`);
  try {
    const result = execSync(command, {
      encoding: 'utf8',
      stdio: 'pipe',
      ...options,
    });
    return { success: true, result };
  } catch (error) {
    logger.error(`Error executing command: ${command}`);
    logger.debug(error.message);
    return { success: false, error };
  }
}

/**
 * Check if React and its JSX runtime are properly installed
 * @returns {boolean} True if JSX runtime is available
 */
function checkReactJsxRuntime() {
  const jsxRuntimePath = path.join(rootDir, 'node_modules', 'react', 'jsx-runtime.js');
  
  if (!fs.existsSync(jsxRuntimePath)) {
    logger.warning(`React JSX runtime not found at ${jsxRuntimePath}`);
    return false;
  }
  
  return true;
}

/**
 * Fix React JSX runtime
 * @param {Object} options - Options
 * @param {boolean} options.dryRun - Whether to perform a dry run
 * @returns {boolean} True if fixed successfully
 */
function fixReactJsxRuntime(options = {}) {
  const { dryRun = false } = options;
  
  logger.info('Reinstalling React to ensure JSX runtime is available...');
  
  if (dryRun) {
    logger.info('[DRY RUN] Would reinstall React and React DOM');
    return true;
  }
  
  // First, check if pnpm is available
  const useYarn = !runCommand('which pnpm', { stdio: 'ignore' }).success;
  const packageManager = useYarn ? 'yarn' : 'pnpm';
  
  // Clean React installation
  runCommand(`${packageManager} remove react react-dom`, { cwd: rootDir });
  runCommand(`${packageManager} install react react-dom`, { cwd: rootDir });
  
  // Force package resolution
  runCommand(`${packageManager} ${useYarn ? 'install' : 'install --force'}`, { cwd: rootDir });
  
  // Check if it worked
  if (checkReactJsxRuntime()) {
    logger.success('Successfully fixed React JSX runtime');
    return true;
  } else {
    logger.warning('Failed to fix React JSX runtime');
    
    // Create a symlink or copy as a fallback
    try {
      const reactDir = path.join(rootDir, 'node_modules', 'react');
      const jsxDevRuntimePath = path.join(reactDir, 'jsx-dev-runtime.js');
      const jsxRuntimePath = path.join(reactDir, 'jsx-runtime.js');
      
      if (fs.existsSync(jsxDevRuntimePath) && !fs.existsSync(jsxRuntimePath)) {
        logger.info('Creating JSX runtime from JSX dev runtime...');
        fs.copyFileSync(jsxDevRuntimePath, jsxRuntimePath);
        
        // Also copy the .js.map if it exists
        const jsxDevRuntimeMapPath = path.join(reactDir, 'jsx-dev-runtime.js.map');
        const jsxRuntimeMapPath = path.join(reactDir, 'jsx-runtime.js.map');
        
        if (fs.existsSync(jsxDevRuntimeMapPath)) {
          fs.copyFileSync(jsxDevRuntimeMapPath, jsxRuntimeMapPath);
        }
        
        return true;
      }
    } catch (error) {
      logger.error(`Error creating JSX runtime: ${error.message}`);
    }
    
    return false;
  }
}

/**
 * Fix test dependencies
 * @param {Object} options - Options
 * @param {boolean} options.dryRun - Whether to perform a dry run
 * @param {boolean} options.verbose - Whether to log verbose output
 * @returns {Promise<Object>} Result of the fix operation
 */
export async function fixTestDependencies(options = {}) {
  const { dryRun = false, verbose = false } = options;
  
  logger.sectionHeader('Fixing Test Dependencies');
  
  try {
    logger.info('Checking for React JSX runtime...');
    
    if (!checkReactJsxRuntime()) {
      logger.warning('React JSX runtime is missing, attempting to fix...');
      
      const fixed = fixReactJsxRuntime({ dryRun });
      
      if (!fixed) {
        logger.error('Could not fix React JSX runtime automatically.');
        logger.info('Try running the following commands manually:');
        logger.info('pnpm install react react-dom --force');
        
        return {
          success: false,
          error: 'Could not fix React JSX runtime automatically',
          fixesApplied: false
        };
      }
      
      return {
        success: true,
        message: 'Successfully fixed React JSX runtime',
        fixesApplied: true
      };
    } else {
      logger.success('React JSX runtime is already available.');
      
      return {
        success: true,
        message: 'React JSX runtime already available',
        fixesApplied: false
      };
    }
  } catch (error) {
    logger.error(`Error fixing test dependencies: ${error.message}`);
    logger.debug(error.stack);
    
    return {
      success: false,
      error: error.message,
      fixesApplied: false
    };
  }
}

// Run main function if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fixTestDependencies().then(result => {
    if (!result.success) {
      process.exit(1);
    }
  }).catch(error => {
    logger.error(`Unhandled error: ${error.message}`);
    process.exit(1);
  });
} 