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

import { exec, execSync, spawn } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger.js';
import readline from 'readline';
import { setTimeout, clearTimeout } from 'timers';
import path, { dirname } from 'path';
import fs from 'fs';
import * as fsPromises from 'fs/promises'; // Import promise-based fs methods

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
 * Run a command asynchronously with better process control
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
 * @param {boolean} [options.forceKillOnTimeout=false] - Force kill the process on timeout (more reliable for hanging processes)
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
    silent = false,
    forceKillOnTimeout = false
  } = options;
  
  const startTime = Date.now();
  let output = '';
  let error = '';
  let success = false;
  
  // For webpack specifically, we want to ensure we can kill it if it hangs
  const isWebpack = command.includes('webpack');
  const shouldForceKill = forceKillOnTimeout || isWebpack;
  
  try {
    // If we need more control over the process (like forcing termination),
    // use spawn instead of exec
    if (shouldForceKill && timeout > 0) {
      return new Promise((resolve, reject) => {
        let killed = false;
        const shellToUse = shell === true || process.platform === 'win32';
        
        // Split command into command and args for spawn
        const parts = command.split(' ');
        const cmd = parts[0];
        const args = parts.slice(1);
        
        if (!silent) {
          logger.debug(`Running command with spawn: ${command}`);
        }
        
        // Define variables to hold potentially modified command/args/shell options
        let spawnCmd = cmd;
        let spawnArgs = args;
        let spawnShell = shellToUse;
        
        // Standard execution for all commands - no special handling needed now
        spawnCmd = cmd;
        spawnArgs = args;
        spawnShell = shellToUse;
        
        // Use spawn for better process control
        const childProcess = spawn(spawnCmd, spawnArgs, {
          cwd,
          env,
          shell: spawnShell,
          stdio: captureOutput ? 'pipe' : (silent ? 'ignore' : stdio)
        });
        
        // Add logging to trace process events (Optional but recommended for debugging)
        const taskName = command.substring(0, 30); // Short name for logging
        logger.debug(`[${taskName}] Spawned process PID: ${childProcess.pid}`);

        childProcess.stdout?.on('data', (data) => {
            logger.debug(`[${taskName}] stdout: ${data.toString().trim()}`);
            if (captureOutput) output += data.toString();
        });

        childProcess.stderr?.on('data', (data) => {
            logger.debug(`[${taskName}] stderr: ${data.toString().trim()}`);
            if (captureOutput) error += data.toString();
        });

        childProcess.on('exit', (code, signal) => {
             logger.debug(`[${taskName}] Process event: exit, code=${code}, signal=${signal}`);
        });
        // --- End of added logging ---
        
        // Setup timeout
        const timeoutId = setTimeout(() => {
          if (!silent) {
            logger.error(`Command timed out after ${timeout}ms: ${command}`);
          }
          
          // Kill the process and its children
          try {
            killed = true;
            childProcess.kill('SIGTERM');
            
            // Force kill after 2 seconds if still running
            setTimeout(() => {
              try {
                if (!childProcess.killed) {
                  childProcess.kill('SIGKILL');
                }
              } catch (e) {
                // Ignore kill errors
              }
            }, 2000);
          } catch (e) {
            // Ignore kill errors
          }
        }, timeout);
        
        // Handle process exit
        childProcess.on('close', (code) => {
          clearTimeout(timeoutId);
          const duration = Date.now() - startTime;
          // Added log for debugging completion timing
          logger.debug(`[${taskName}] Process event: close, code=${code}, duration=${duration}ms. Resolving promise now.`);
          
          if (!silent) {
            logger.debug(`Command completed in ${duration}ms with code ${code}`);
          }
          
          if (killed) {
            resolve({
              success: false,
              output,
              error: `Command timed out after ${timeout}ms`,
              duration,
              timedOut: true
            });
          } else if (code === 0 || ignoreError) {
            resolve({
              success: code === 0,
              output,
              error,
              duration
            });
          } else {
            resolve({
              success: false,
              output,
              error: error || `Command failed with exit code ${code}`,
              duration
            });
          }
        });
        
        // Handle process errors
        childProcess.on('error', (err) => {
          clearTimeout(timeoutId);
          const duration = Date.now() - startTime;
          // Added log for debugging completion timing
          logger.error(`[${taskName}] Process event: error, message=${err.message}, duration=${duration}ms. Resolving promise now.`);
          
          if (!silent) {
            logger.error(`Command failed after ${duration}ms: ${err.message}`);
          }
          
          resolve({
            success: false,
            output,
            error: err.message,
            duration
          });
        });
      });
    }
    
    // Use the original exec implementation for standard commands
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

// --- File Rotation Logic --- START ---

/**
 * Rotates files in a directory, keeping only the most recent ones.
 *
 * @async
 * @param {string} directoryPath - The absolute path to the directory.
 * @param {string} filePrefix - The prefix of the files to rotate (e.g., 'workflow-report-').
 * @param {string} fileSuffix - The suffix/extension of the files to rotate (e.g., '.json').
 * @param {number} keepCount - The number of most recent files to keep.
 * @param {string[]} [exclude=[]] - An array of exact filenames to exclude from deletion.
 * @returns {Promise<{deletedCount: number, keptCount: number}>} Object indicating deleted and kept counts.
 */
export async function rotateFiles(directoryPath, filePrefix, fileSuffix, keepCount, exclude = []) {
  logger.debug(`Rotating files in ${directoryPath} matching ${filePrefix}*${fileSuffix}, keeping ${keepCount}`);
  let deletedCount = 0;
  let keptCount = 0;

  try {
    // 1. Read directory contents
    let files;
    try {
      files = await fsPromises.readdir(directoryPath);
    } catch (readdirError) {
      if (readdirError.code === 'ENOENT') {
        logger.debug(`Directory not found, skipping rotation: ${directoryPath}`);
        return { deletedCount: 0, keptCount: 0 };
      }
      throw readdirError; // Re-throw other errors
    }

    // 2. Filter relevant files
    const relevantFiles = files.filter(file =>
      file.startsWith(filePrefix) && file.endsWith(fileSuffix)
    );

    if (relevantFiles.length <= keepCount) {
      logger.debug(`Found ${relevantFiles.length} files, which is less than or equal to keepCount (${keepCount}). No rotation needed.`);
      return { deletedCount: 0, keptCount: relevantFiles.length };
    }

    // 3. Get modification times and filter out excluded files
    const fileStats = [];
    for (const file of relevantFiles) {
      const filePath = path.join(directoryPath, file);
      // Check if file should be excluded
      if (exclude.includes(file)) {
        logger.debug(`Excluding file from rotation: ${file}`);
        keptCount++;
        continue;
      }
      try {
        const stats = await fsPromises.stat(filePath);
        fileStats.push({ name: file, path: filePath, mtime: stats.mtime });
      } catch (statError) {
        logger.warn(`Could not get stats for file ${filePath}, skipping: ${statError.message}`);
      }
    }

    // 4. Sort by modification time (newest first)
    fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // 5. Identify files to delete
    const filesToDelete = fileStats.slice(keepCount);
    keptCount += fileStats.length - filesToDelete.length;

    // 6. Delete old files
    for (const fileInfo of filesToDelete) {
      try {
        await fsPromises.unlink(fileInfo.path);
        logger.debug(`Deleted old file: ${fileInfo.name}`);
        deletedCount++;
      } catch (unlinkError) {
        logger.warn(`Failed to delete file ${fileInfo.path}: ${unlinkError.message}`);
      }
    }

    logger.debug(`Rotation complete. Deleted: ${deletedCount}, Kept: ${keptCount}`);
    return { deletedCount, keptCount };

  } catch (error) {
    logger.error(`Error during file rotation in ${directoryPath}: ${error.message}`);
    return { deletedCount: 0, keptCount: 0 }; // Return zero counts on error
  }
}

// --- File Rotation Logic --- END --- 