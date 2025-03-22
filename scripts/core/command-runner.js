#!/usr/bin/env node

/**
 * Command Runner Module
 * 
 * Provides utilities for running shell commands with proper error handling,
 * output capturing, and timeout controls. This module is a critical component
 * of the preview workflow, enabling interaction with system commands and CLI tools.
 * 
 * Features:
 * - Synchronous and asynchronous command execution
 * - Flexible output handling (inherit, pipe, ignore)
 * - Robust error handling with detailed reporting
 * - Timeout support for long-running commands
 * - Command output extraction and pattern matching
 * - Configurable verbosity for debugging
 * 
 * @module preview/command-runner
 * @example
 * // Basic usage example
 * import { runCommand, runCommandAsync } from './core/command-runner.js';
 * 
 * // Run a command synchronously
 * const result = runCommand('npm version', { stdio: 'pipe', verbose: true });
 * if (result.success) {
 *   console.log('npm version:', result.output);
 * }
 * 
 * // Run a command asynchronously
 * async function deployToFirebase() {
 *   const result = await runCommandAsync('firebase deploy --only hosting', { 
 *     timeout: 120000, // 2 minutes
 *     verbose: true 
 *   });
 *   
 *   if (result.success) {
 *     console.log('Deployment complete!');
 *   } else {
 *     console.error('Deployment failed:', result.error);
 *   }
 * }
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
 * @function runCommand
 * @param {string} command - The command to execute
 * @param {Object} [options] - Command options
 * @param {boolean} [options.ignoreError=false] - Whether to ignore errors (don't exit the process)
 * @param {string} [options.stdio='inherit'] - Standard IO handling:
 *   - 'inherit': Show output in the terminal (default)
 *   - 'pipe': Capture output and return it
 *   - 'ignore': Discard all output
 * @param {number} [options.timeout] - Timeout in milliseconds before the command is killed
 * @param {boolean} [options.verbose=false] - Whether to show verbose output
 * @returns {Object} - Command result object containing:
 *   - success {boolean}: Whether the command completed successfully
 *   - output {string|null}: Command output if stdio is 'pipe', otherwise null
 *   - error {string|undefined}: Error message if the command failed
 *   - code {number|undefined}: Exit code if the command failed
 *   - stderr {string|undefined}: Standard error output if the command failed
 * @description Executes a shell command synchronously, with configurable output handling 
 * and error management. By default, outputs directly to the terminal and exits the process
 * if the command fails. When using this function, be aware that it will block the JavaScript
 * event loop until the command completes.
 * @example
 * // Basic command execution showing output in terminal
 * runCommand('npm install');
 * 
 * // Capture command output and handle errors
 * const result = runCommand('git status --porcelain', {
 *   stdio: 'pipe',
 *   ignoreError: true,
 *   verbose: true
 * });
 * 
 * if (result.success) {
 *   if (result.output.trim() === '') {
 *     console.log('Working directory is clean');
 *   } else {
 *     console.log('Uncommitted changes detected');
 *   }
 * } else {
 *   console.error(`Git error (code ${result.code}): ${result.error}`);
 * }
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
 * @async
 * @function runCommandAsync
 * @param {string} command - The command to execute
 * @param {Object} [options] - Command options
 * @param {boolean} [options.ignoreError=false] - Whether to ignore errors (don't exit the process)
 * @param {boolean} [options.verbose=false] - Whether to show verbose output
 * @param {number} [options.timeout] - Timeout in milliseconds before the command is killed
 * @returns {Promise<Object>} - Promise resolving to a command result object containing:
 *   - success {boolean}: Whether the command completed successfully
 *   - output {string}: Standard output from the command
 *   - stderr {string}: Standard error output from the command
 *   - error {string|undefined}: Error message if the command failed
 *   - code {number|undefined}: Exit code if the command failed
 * @description Executes a shell command asynchronously, returning a Promise that resolves
 * when the command completes. Unlike runCommand, this function doesn't block the JavaScript
 * event loop, making it suitable for use in async functions and when you need to maintain
 * responsiveness. All command output is captured and returned in the result object.
 * @example
 * // Basic asynchronous command execution
 * async function buildProject() {
 *   const result = await runCommandAsync('npm run build', { verbose: true });
 *   
 *   if (result.success) {
 *     console.log('Build completed successfully!');
 *     return true;
 *   } else {
 *     console.error('Build failed:', result.error);
 *     console.error('Build output:', result.stderr);
 *     return false;
 *   }
 * }
 * 
 * // Using with timeout for commands that might hang
 * async function fetchRemote() {
 *   return await runCommandAsync('git fetch origin', {
 *     timeout: 30000, // 30 seconds
 *     ignoreError: true
 *   });
 * }
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
 * @function extractFromCommand
 * @param {string} command - The command to execute
 * @param {RegExp} extractPattern - Regular expression with capturing groups to extract data
 * @param {Object} [options] - Command options (same as runCommand)
 * @param {boolean} [options.ignoreError=false] - Whether to ignore errors
 * @param {boolean} [options.verbose=false] - Whether to show verbose output
 * @returns {string|null} - First matching group from regex or null if no match/command failed
 * @description Specialized utility function that runs a command, captures its output, and 
 * extracts specific information using a regular expression. This is extremely useful for 
 * tasks like getting the current git branch, finding version numbers, or other scenarios
 * where you need just a specific piece of information from command output.
 * @example
 * // Get the current git branch name
 * const branch = extractFromCommand(
 *   'git rev-parse --abbrev-ref HEAD',
 *   /^(.+)$/
 * );
 * console.log('Current branch:', branch);
 * 
 * // Get the Node.js version
 * const nodeVersion = extractFromCommand(
 *   'node --version',
 *   /v(\d+\.\d+\.\d+)/
 * );
 * console.log('Node.js version:', nodeVersion);
 * 
 * // Extract the project version from package.json
 * const version = extractFromCommand(
 *   'cat package.json',
 *   /"version":\s*"([^"]+)"/
 * );
 * console.log('Project version:', version);
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