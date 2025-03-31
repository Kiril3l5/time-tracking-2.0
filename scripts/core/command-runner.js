/**
 * Command Runner Module
 * 
 * Provides utilities for running shell commands with proper error handling
 * and output capturing.
 * 
 * Features:
 * - Synchronous and asynchronous command execution
 * - Flexible output handling
 * - Error handling with informative messages
 * - Timeout support for long-running commands
 */

import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger.js';
import readline from 'readline';

/* global process, console */

// Promisify exec for async/await usage
const execAsync = promisify(exec);

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify readline question
const question = (query) => new Promise((resolve) => {
  rl.question(query, (answer) => {
    resolve(answer);
  });
});

/**
 * Run a command synchronously
 * 
 * @param {string} command - Command to run
 * @param {Object} [options] - Options for command execution
 * @param {string} [options.cwd] - Working directory for command
 * @param {Object} [options.env] - Environment variables
 * @param {boolean} [options.ignoreError=false] - Don't throw on non-zero exit code
 * @param {string} [options.stdio='inherit'] - stdio option for child_process
 * @returns {Object} Command result object with:
 *   - success {boolean}: Whether the command completed successfully
 *   - output {string}: Command output (if stdio is not 'inherit')
 *   - error {string}: Error message if command failed
 */
export function runCommand(command, options = {}) {
  try {
    const defaultOptions = {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options
    };

    const result = execSync(command, defaultOptions);
    return {
      success: true,
      output: result.toString().trim()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message.split('\n')[0] // Just the main error message
    };
  }
}

/**
 * Run a command asynchronously
 * 
 * @async
 * @param {string} command - Command to run
 * @param {Object} [options] - Options for command execution
 * @param {string} [options.cwd] - Working directory for command
 * @param {Object} [options.env] - Environment variables
 * @param {boolean} [options.ignoreError=false] - Don't throw on non-zero exit code
 * @param {string} [options.stdio='inherit'] - stdio option for child_process
 * @param {number} [options.timeout] - Timeout in milliseconds
 * @param {boolean} [options.captureOutput=false] - Capture output even if stdio is not pipe
 * @param {boolean} [options.silent=false] - Suppress all output to console
 * @returns {Promise<Object>} Command result object with:
 *   - success {boolean}: Whether the command completed successfully
 *   - output {string}: Command output (if stdio is not 'inherit')
 *   - error {string}: Error message if command failed
 */
export async function runCommandAsync(command, options = {}) {
  const {
    cwd = process.cwd(),
    env = process.env,
    ignoreError = false,
    stdio = 'inherit',
    timeout = 0,
    shell = false,
    captureOutput = false,
    silent = false
  } = options;
  
  const startTime = Date.now();
  let output = '';
  let error = '';
  let success = false;
  
  try {
    // Determine stdio mode
    const effectiveStdio = captureOutput || stdio === 'pipe'
      ? 'pipe'
      : silent ? 'ignore' : stdio;
    
    // Log command only if not silent
    if (!silent) {
      logger.debug(`Running command: ${command}`);
    }
    
    const execOptions = {
      cwd,
      env,
      shell: shell === true || process.platform === 'win32',
      timeout: timeout > 0 ? timeout : undefined,
      stdio: effectiveStdio
    };
    
    if (effectiveStdio === 'pipe') {
      // Use execAsync for capturing stdout/stderr
      const { stdout, stderr } = await execAsync(command, execOptions);
      output = stdout.trim();
      error = stderr.trim();
      success = true;
    } else {
      // Use execAsync but ignore output
      await execAsync(command, execOptions);
      success = true;
    }
    
    const duration = Date.now() - startTime;
    
    if (!silent) {
      logger.debug(`Command completed in ${duration}ms`);
    }
    
    return { success, output, error, duration };
    
  } catch (err) {
    const duration = Date.now() - startTime;
    
    // Format error message nicely
    const errorMsg = err.message || 'Unknown error';
    
    if (!silent) {
      logger.error(`Command failed after ${duration}ms: ${errorMsg}`);
    }
    
    if (err.stdout) output = err.stdout.toString().trim();
    if (err.stderr) error = err.stderr.toString().trim();
    
    // Return error info but don't throw if ignoreError is true
    if (ignoreError) {
      return { 
        success: false, 
        output, 
        error: errorMsg,
        duration
      };
    }
    
    return { 
      success: false, 
      output, 
      error: errorMsg,
      duration
    };
  }
}

/**
 * Prompt user for input with a default value
 * 
 * @async
 * @param {string} prompt - Prompt message
 * @param {string} [defaultValue=''] - Default value if user enters nothing
 * @returns {Promise<string>} User input
 */
export async function promptText(prompt, defaultValue = '') {
  const defaultSuffix = defaultValue ? ` (${defaultValue})` : '';
  const answer = await question(`${prompt}${defaultSuffix}: `);
  return answer.trim() || defaultValue;
}

/**
 * Prompt user with a list of options
 * 
 * @async
 * @param {string} message - Prompt message
 * @param {string[]} options - List of options
 * @returns {Promise<string>} Selected option index (1-based)
 */
export async function promptWorkflowOptions(message, options) {
  console.log('\n' + message);
  
  // Display numbered options
  options.forEach((option, index) => {
    console.log(`  ${index + 1}. ${option}`);
  });
  
  // Get user selection
  const answer = await question(`\nEnter your choice (1-${options.length}): `);
  const selection = parseInt(answer, 10);
  
  // Validate selection
  if (isNaN(selection) || selection < 1 || selection > options.length) {
    console.log(`Invalid selection. Please enter a number between 1 and ${options.length}.`);
    return promptWorkflowOptions(message, options);
  }
  
  return selection.toString();
}

/**
 * Generate a command execution function with predefined options
 * 
 * @param {Object} defaultOptions - Default options for command execution
 * @returns {Function} Command execution function
 */
export function createCommandRunner(defaultOptions = {}) {
  return {
    runCommand: (command, options = {}) => 
      runCommand(command, { ...defaultOptions, ...options }),
    
    runCommandAsync: (command, options = {}) => 
      runCommandAsync(command, { ...defaultOptions, ...options }),
      
    promptText,
    
    promptWorkflowOptions
  };
}

// Export a singleton instance with default options
export const commandRunner = {
  runCommand,
  runCommandAsync,
  promptText,
  promptWorkflowOptions
}; 