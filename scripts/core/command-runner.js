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
import { logger } from './logger.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { homedir, platform } from 'os';
import { fileURLToPath } from 'url';
import * as child_process from 'child_process';
import { errorTracker } from './error-handler.js';
import { performanceMonitor } from './performance-monitor.js';

/* global process, global, Buffer, setTimeout, clearTimeout */

// Promisify exec for async/await usage
const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '../..');

// Global cache for command outputs
// This allows access to command outputs from anywhere in the codebase
if (!global.__commandOutputs) {
  global.__commandOutputs = [];
}

// Maximum size of the output cache
const MAX_CACHE_SIZE = 100;

// Directory for storing command logs
const COMMAND_LOGS_DIR = join(rootDir, 'temp', 'command-logs');

// Ensure command logs directory exists
function ensureCommandLogsDir() {
  try {
    if (!existsSync(COMMAND_LOGS_DIR)) {
      writeFileSync(COMMAND_LOGS_DIR, '', { recursive: true });
    }
  } catch (error) {
    logger.warn(`Failed to create command logs directory: ${error.message}`);
  }
}

// Save command output to cache and file
function saveCommandOutput(command, output, error, success, startTime, endTime) {
  const commandRecord = {
    command,
    output: output || '',
    error: error || '',
    success,
    timestamp: new Date().toISOString(),
    duration: endTime - startTime,
  };
  
  // Add to global cache, limiting size
  global.__commandOutputs.unshift(commandRecord);
  if (global.__commandOutputs.length > MAX_CACHE_SIZE) {
    global.__commandOutputs.splice(MAX_CACHE_SIZE);
  }
  
  // Save to file if it contains 'firebase' and 'deploy' (likely a deployment command)
  if ((command.includes('firebase') && command.includes('deploy')) || 
      command.includes('channel') ||
      command.includes('preview')) {
    try {
      ensureCommandLogsDir();
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const sanitizedCommand = command.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
      const logFile = join(COMMAND_LOGS_DIR, `${timestamp}-${sanitizedCommand}.log`);
      
      writeFileSync(logFile, `COMMAND: ${command}\n` +
        `TIMESTAMP: ${commandRecord.timestamp}\n` +
        `DURATION: ${commandRecord.duration}ms\n` +
        `SUCCESS: ${success}\n\n` +
        `OUTPUT:\n${output || 'No output'}\n\n` +
        `ERROR:\n${error || 'No error'}\n`);
      
      logger.debug(`Command output saved to ${logFile}`);
    } catch (error) {
      logger.warn(`Failed to save command output to file: ${error.message}`);
    }
  }
  
  return commandRecord;
}

// Get recent command outputs
export function getRecentCommandOutputs(filter = null) {
  if (!filter) {
    return global.__commandOutputs;
  }
  
  return global.__commandOutputs.filter(record => {
    if (typeof filter === 'function') {
      return filter(record);
    } else if (typeof filter === 'string') {
      return record.command.includes(filter);
    } else if (filter instanceof RegExp) {
      return filter.test(record.command);
    }
    return false;
  });
}

// Find deployment logs
export function findDeploymentLogs() {
  ensureCommandLogsDir();
  
  try {
    const files = existsSync(COMMAND_LOGS_DIR)
      ? readFileSync(COMMAND_LOGS_DIR, 'utf8')
        .split('\n')
        .filter(file => file.includes('firebase') || file.includes('deploy') || file.includes('channel'))
        .map(file => join(COMMAND_LOGS_DIR, file))
        .sort((a, b) => readFileSync(b, 'utf8').split('\n')[0].localeCompare(readFileSync(a, 'utf8').split('\n')[0]))
      : [];
    
    return files;
  } catch (error) {
    logger.warn(`Failed to find deployment logs: ${error.message}`);
    return [];
  }
}

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
    // Default to suppressing output unless explicitly requested
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
    // Determine stdio mode:
    // - 'pipe' if captureOutput is true or stdio is 'pipe'
    // - 'ignore' if silent is true
    // - otherwise use the provided stdio option
    const effectiveStdio = captureOutput || stdio === 'pipe'
      ? 'pipe'
      : silent ? 'ignore' : stdio;
    
    // Log command only if not silent
    if (!silent) {
      logger.debug(`Running command: ${command}`);
    }
    
    // Configure spawn options
    const spawnOptions = {
      cwd,
      env: { ...env },
      stdio: effectiveStdio,
      shell: true  // Use shell: true for all platforms
    };
    
    await new Promise((resolve, reject) => {
      // Use shell: true for all platforms to ensure commands work properly
      const childProcess = child_process.spawn(
        command,
        [],
        spawnOptions
      );
      
      let stdoutChunks = [];
      let stderrChunks = [];
      
      if (childProcess.stdout) {
        childProcess.stdout.on('data', (data) => {
          if (captureOutput || effectiveStdio === 'pipe') {
            stdoutChunks.push(data);
          }
        });
      }
      
      if (childProcess.stderr) {
        childProcess.stderr.on('data', (data) => {
          if (captureOutput || effectiveStdio === 'pipe') {
            stderrChunks.push(data);
          }
        });
      }
      
      let timeoutId;
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          childProcess.kill();
          const err = new Error(`Command timed out after ${timeout}ms: ${command}`);
          err.code = 'TIMEOUT';
          reject(err);
        }, timeout);
      }
      
      childProcess.on('close', (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        
        if (captureOutput || effectiveStdio === 'pipe') {
          output = Buffer.concat(stdoutChunks).toString('utf8');
          error = Buffer.concat(stderrChunks).toString('utf8');
        }
        
        if (code === 0) {
          success = true;
          resolve();
        } else if (ignoreError) {
          resolve();
        } else {
          const err = new Error(`Command failed with exit code ${code}: ${command}`);
          err.code = code;
          reject(err);
        }
      });
      
      childProcess.on('error', (err) => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(err);
      });
    });
    
    success = true;
    
    const endTime = Date.now();
    const result = {
      success: true,
      output
    };
    
    // Save command output to cache and file if not silent
    if (!silent) {
      saveCommandOutput(command, output, error, success, startTime, endTime);
    }
    
    return result;
  } catch (err) {
    const endTime = Date.now();
    error = err.message || 'Unknown error';
    output = err.stdout || '';
    const stderr = err.stderr || error;
    
    // Save command output to cache and file if not silent
    if (!silent) {
      saveCommandOutput(command, output, stderr, false, startTime, endTime);
    }
    
    if (ignoreError) {
      return {
        success: false,
        output,
        stderr,
        error,
        errorCode: err.code || 1
      };
    } else {
      throw err;
    }
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

export class CommandRunner {
  constructor() {
    this.defaultTimeout = 30000; // 30 seconds
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
    this.commandHistory = new Map();
  }

  /**
   * Execute a command with timeout and retry logic
   * @param {string} command - Command to execute
   * @param {Object} options - Command options
   * @param {number} [options.timeout] - Command timeout in ms
   * @param {number} [options.retries] - Number of retry attempts
   * @param {boolean} [options.requireSuccess=true] - Whether to throw on failure
   * @returns {Promise<{stdout: string, stderr: string}>} Command output
   */
  async run(command, options = {}) {
    const {
      timeout = this.defaultTimeout,
      retries = this.maxRetries,
      requireSuccess = true
    } = options;

    let lastError;
    let attempt = 0;

    while (attempt <= retries) {
      try {
        // Track command start
        const startTime = Date.now();
        this.commandHistory.set(command, {
          startTime,
          attempts: attempt + 1
        });

        // Execute command with timeout
        const result = await Promise.race([
          execAsync(command, { timeout }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Command timed out')), timeout)
          )
        ]);

        // Track command completion
        const duration = Date.now() - startTime;
        performanceMonitor.trackStepPerformance(`command-${command}`, duration);

        // Log success
        logger.debug(`Command executed successfully: ${command}`);
        return result;

      } catch (error) {
        lastError = error;
        attempt++;

        // Log retry attempt
        if (attempt <= retries) {
          logger.warn(`Command failed (attempt ${attempt}/${retries}): ${command}`);
          logger.debug(`Error: ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        }
      }
    }

    // Handle final failure
    const error = new Error(`Command failed after ${retries} attempts: ${command}`);
    error.cause = lastError;
    
    // Track error
    errorTracker.addError(error);

    if (requireSuccess) {
      throw error;
    }

    return { stdout: '', stderr: error.message };
  }

  /**
   * Prompt user for input
   * @param {string} message - Message to display to user
   * @param {Object} [options] - Prompt options
   * @param {Array<string>} [options.choices] - List of choices for user
   * @param {boolean} [options.isConfirm=false] - Whether this is a yes/no confirmation
   * @returns {Promise<string|boolean>} User's response
   */
  async prompt(message, options = {}) {
    const { choices = [], isConfirm = false } = options;

    // Display message and choices
    logger.info(message);
    if (choices.length > 0) {
      choices.forEach((choice, index) => {
        logger.info(`${index + 1}. ${choice}`);
      });
    }

    // Create readline interface
    const readline = (await import('readline')).createInterface({
      input: process.stdin,
      output: process.stdout
    });

    try {
      const answer = await new Promise(resolve => {
        readline.question('> ', resolve);
      });

      // Handle yes/no confirmation
      if (isConfirm) {
        const normalizedAnswer = answer.toLowerCase().trim();
        return normalizedAnswer === 'y' || normalizedAnswer === 'yes';
      }

      // Handle choices
      if (choices.length > 0) {
        const choiceIndex = parseInt(answer, 10) - 1;
        if (choiceIndex >= 0 && choiceIndex < choices.length) {
          return choices[choiceIndex];
        }
        throw new Error('Invalid choice');
      }

      return answer;
    } finally {
      readline.close();
    }
  }

  /**
   * Validate command before execution
   * @private
   * @param {string} command - Command to validate
   * @returns {boolean} Whether command is valid
   */
  validateCommand(command) {
    if (!command || typeof command !== 'string') {
      throw new Error('Invalid command: Command must be a non-empty string');
    }

    // Basic security check
    if (command.includes('&&') || command.includes('||') || command.includes(';')) {
      throw new Error('Invalid command: Command contains potentially dangerous operators');
    }

    return true;
  }

  /**
   * Get command history
   * @returns {Map} Command execution history
   */
  getHistory() {
    return this.commandHistory;
  }

  /**
   * Clear command history
   */
  clearHistory() {
    this.commandHistory.clear();
  }

  /**
   * Get command statistics
   * @returns {Object} Command execution statistics
   */
  getStats() {
    const stats = {
      totalCommands: this.commandHistory.size,
      commandsByStatus: {
        success: 0,
        failed: 0,
        retried: 0
      },
      averageDuration: 0
    };

    let totalDuration = 0;

    for (const [command, data] of this.commandHistory) {
      const duration = Date.now() - data.startTime;
      totalDuration += duration;

      if (data.attempts > 1) {
        stats.commandsByStatus.retried++;
      } else {
        stats.commandsByStatus.success++;
      }
    }

    if (stats.totalCommands > 0) {
      stats.averageDuration = totalDuration / stats.totalCommands;
    }

    return stats;
  }

  /**
   * Prompt user for workflow options
   * @param {string} message - Main message to display
   * @param {Array<string>} options - List of options to present
   * @returns {Promise<string>} User's choice
   */
  async promptWorkflowOptions(message, options) {
    // Display message and options
    logger.info(message);
    options.forEach((option, index) => {
      logger.info(`${index + 1}. ${option}`);
    });

    // Create readline interface
    const readline = (await import('readline')).createInterface({
      input: process.stdin,
      output: process.stdout
    });

    try {
      const answer = await new Promise(resolve => {
        readline.question('Choose an option (1-' + options.length + '): ', resolve);
      });

      const choice = parseInt(answer.trim(), 10);
      if (choice >= 1 && choice <= options.length) {
        return choice.toString();
      }
      throw new Error('Invalid choice');
    } finally {
      readline.close();
    }
  }

  /**
   * Prompt user for text input
   * @param {string} message - Message to display
   * @returns {Promise<string>} User's input
   */
  async promptText(message) {
    const readline = (await import('readline')).createInterface({
      input: process.stdin,
      output: process.stdout
    });

    try {
      return await new Promise(resolve => {
        readline.question(message, resolve);
      });
    } finally {
      readline.close();
    }
  }
}

// Create and export a singleton instance
export const commandRunner = {
  runCommand,
  runCommandAsync,
  getRecentCommandOutputs,
  findDeploymentLogs,
  saveCommandOutput,
  prompt: new CommandRunner().prompt.bind(new CommandRunner()),
  promptWorkflowOptions: new CommandRunner().promptWorkflowOptions.bind(new CommandRunner()),
  promptText: new CommandRunner().promptText.bind(new CommandRunner())
};

export default commandRunner; 