#!/usr/bin/env node

/**
 * Command Runner Module
 * 
 * Provides utilities for running shell commands with proper error handling,
 * output capturing, and timeout controls.
 * 
 * Features:
 * - Synchronous and asynchronous command execution
 * - Flexible output handling (inherit, pipe, ignore)
 * - Error handling with option to ignore failures
 * - Timeout support for long-running commands
 * - Detailed error reporting
 * 
 * @module preview/command-runner
 */

import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import * as logger from './logger.js';

/* global process */

// Promisify exec for async/await usage
const execAsync = promisify(exec);

/**
 * Run a command synchronously
 * 
 * @param {string} command - The command to execute
 * @param {Object} [options] - Command options
 * @param {boolean} [options.ignoreError=false] - Whether to ignore errors
 * @param {string} [options.stdio='inherit'] - Standard IO handling ('inherit', 'pipe', 'ignore')
 * @param {number} [options.timeout] - Timeout in milliseconds
 * @param {boolean} [options.verbose=false] - Whether to show verbose output
 * @returns {Object} - Command result with success status and output
 */
export function runCommand(command, options = {}) {
  const {
    ignoreError = false,
    stdio = 'inherit',
    timeout,
    verbose = false
  } = options;
  
  if (verbose) {
    logger.info(`Running command: ${command}`);
  } else {
    logger.debug(`Running command: ${command}`);
  }
  
  try {
    const execOptions = {
      stdio,
      timeout,
      windowsHide: true
    };
    
    if (stdio === 'pipe') {
      execOptions.encoding = 'utf8';
    }
    
    const output = execSync(command, execOptions);
    
    if (verbose && stdio === 'pipe' && output) {
      logger.debug(`Command output: ${output}`);
    }
    
    return {
      success: true,
      output: stdio === 'pipe' ? output : null
    };
  } catch (error) {
    const errorMessage = `Command failed: ${command}`;
    
    if (ignoreError) {
      logger.warn(`${errorMessage} (ignored)`);
      return {
        success: false,
        error: error.message,
        code: error.code,
        output: error.stdout,
        stderr: error.stderr
      };
    }
    
    logger.error(errorMessage);
    logger.error(`Exit code: ${error.code}`);
    
    if (error.stderr) {
      logger.error(`Error output: ${error.stderr}`);
    }
    
    if (!ignoreError) {
      process.exit(1);
    }
    
    return {
      success: false,
      error: error.message,
      code: error.code,
      output: error.stdout,
      stderr: error.stderr
    };
  }
}

/**
 * Run a command asynchronously
 * 
 * @param {string} command - The command to execute
 * @param {Object} [options] - Command options
 * @param {boolean} [options.ignoreError=false] - Whether to ignore errors
 * @param {boolean} [options.verbose=false] - Whether to show verbose output
 * @param {number} [options.timeout] - Timeout in milliseconds
 * @returns {Promise<Object>} - Promise resolving to command result
 */
export async function runCommandAsync(command, options = {}) {
  const {
    ignoreError = false,
    verbose = false,
    timeout
  } = options;
  
  if (verbose) {
    logger.info(`Running command: ${command}`);
  } else {
    logger.debug(`Running command: ${command}`);
  }
  
  try {
    const execOptions = {
      timeout,
      windowsHide: true
    };
    
    const { stdout, stderr } = await execAsync(command, execOptions);
    
    if (verbose && stdout) {
      logger.debug(`Command output: ${stdout}`);
    }
    
    return {
      success: true,
      output: stdout,
      stderr
    };
  } catch (error) {
    const errorMessage = `Command failed: ${command}`;
    
    if (ignoreError) {
      logger.warn(`${errorMessage} (ignored)`);
      return {
        success: false,
        error: error.message,
        code: error.code || -1,
        output: error.stdout,
        stderr: error.stderr
      };
    }
    
    logger.error(errorMessage);
    
    if (error.code) {
      logger.error(`Exit code: ${error.code}`);
    }
    
    if (error.stderr) {
      logger.error(`Error output: ${error.stderr}`);
    }
    
    if (!ignoreError) {
      process.exit(1);
    }
    
    return {
      success: false,
      error: error.message,
      code: error.code || -1,
      output: error.stdout,
      stderr: error.stderr
    };
  }
}

/**
 * Run a command and extract specific information from its output using a regex
 * 
 * @param {string} command - The command to execute
 * @param {RegExp} extractPattern - Regular expression with capturing groups
 * @param {Object} [options] - Command options
 * @param {boolean} [options.ignoreError=false] - Whether to ignore errors
 * @param {boolean} [options.verbose=false] - Whether to show verbose output
 * @returns {string|null} - First matching group from regex or null if no match
 */
export function extractFromCommand(command, extractPattern, options = {}) {
  const result = runCommand(command, {
    ...options,
    stdio: 'pipe',
    ignoreError: true
  });
  
  if (!result.success || !result.output) {
    return null;
  }
  
  const match = result.output.match(extractPattern);
  
  if (match && match.length > 1) {
    return match[1].trim();
  }
  
  return null;
}

export default {
  runCommand,
  runCommandAsync,
  extractFromCommand
}; 