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
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import * as child_process from 'child_process';

/* global process, global, Buffer, setTimeout, clearTimeout */

// Promisify exec for async/await usage
const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

// Global cache for command outputs
// This allows access to command outputs from anywhere in the codebase
if (!global.__commandOutputs) {
  global.__commandOutputs = [];
}

// Maximum size of the output cache
const MAX_CACHE_SIZE = 100;

// Directory for storing command logs
const COMMAND_LOGS_DIR = path.join(rootDir, 'temp', 'command-logs');

// Ensure command logs directory exists
function ensureCommandLogsDir() {
  try {
    if (!fs.existsSync(COMMAND_LOGS_DIR)) {
      fs.mkdirSync(COMMAND_LOGS_DIR, { recursive: true });
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
      const logFile = path.join(COMMAND_LOGS_DIR, `${timestamp}-${sanitizedCommand}.log`);
      
      fs.writeFileSync(logFile, `COMMAND: ${command}\n` +
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
    const files = fs.readdirSync(COMMAND_LOGS_DIR)
      .filter(file => file.includes('firebase') || file.includes('deploy') || file.includes('channel'))
      .map(file => path.join(COMMAND_LOGS_DIR, file))
      .sort((a, b) => fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime());
    
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
  const {
    cwd = process.cwd(),
    env = process.env,
    ignoreError = false,
    stdio = 'inherit',
    captureOutput = false
  } = options;
  
  const startTime = Date.now();
  let output = '';
  let error = '';
  let success = false;
  
  try {
    const captureStdio = stdio === 'pipe' || captureOutput;
    
    if (captureStdio) {
      const result = execSync(command, {
        cwd,
        env,
        stdio: 'pipe',
        encoding: 'utf8'
      });
      output = result || '';
      success = true;
    } else {
      execSync(command, {
        cwd,
        env,
        stdio
      });
      success = true;
    }
    
    const endTime = Date.now();
    const result = {
      success: true,
      output
    };
    
    // Save command output to cache and file
    saveCommandOutput(command, output, error, success, startTime, endTime);
    
    return result;
  } catch (err) {
    const endTime = Date.now();
    error = err.message || 'Unknown error';
    output = err.stdout ? err.stdout.toString() : '';
    const stderr = err.stderr ? err.stderr.toString() : '';
    
    // Save command output to cache and file
    saveCommandOutput(command, output, stderr || error, false, startTime, endTime);
    
    if (ignoreError) {
      return {
        success: false,
        output,
        error: stderr || error,
        errorCode: err.status || 1
      };
    } else {
      throw err;
    }
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
    captureOutput = false
  } = options;
  
  const startTime = Date.now();
  let output = '';
  let error = '';
  let success = false;
  
  try {
    const captureStdio = stdio === 'pipe' || captureOutput;
    
    if (captureStdio) {
      // For capturing stdout/stderr, use exec
      const execOptions = {
        cwd,
        env,
        encoding: 'utf8',
        maxBuffer: 5 * 1024 * 1024 // 5 MB buffer for large outputs
      };
      
      if (timeout > 0) {
        execOptions.timeout = timeout;
      }
      
      if (shell) {
        execOptions.shell = true;
      }
      
      const result = await execAsync(command, execOptions);
      output = result.stdout || '';
      success = true;
    } else {
      // For inheriting stdio, use spawn
      const spawnOptions = {
        cwd,
        env,
        stdio,
        shell: true // Use shell: true for cross-platform compatibility
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
            if (captureOutput) {
              stdoutChunks.push(data);
            }
          });
        }
        
        if (childProcess.stderr) {
          childProcess.stderr.on('data', (data) => {
            if (captureOutput) {
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
          
          if (captureOutput) {
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
    }
    
    const endTime = Date.now();
    const result = {
      success: true,
      output
    };
    
    // Save command output to cache and file
    saveCommandOutput(command, output, error, success, startTime, endTime);
    
    return result;
  } catch (err) {
    const endTime = Date.now();
    error = err.message || 'Unknown error';
    output = err.stdout || '';
    const stderr = err.stderr || error;
    
    // Save command output to cache and file
    saveCommandOutput(command, output, stderr, false, startTime, endTime);
    
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

export default {
  runCommand,
  runCommandAsync,
  extractFromCommand,
  getRecentCommandOutputs,
  findDeploymentLogs
}; 