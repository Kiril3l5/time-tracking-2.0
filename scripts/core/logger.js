#!/usr/bin/env node

/**
 * Logger Module
 * 
 * Provides enhanced logging functionality with color formatting, timestamps,
 * and file output capabilities. Supports different log levels and includes
 * utility functions for common log types.
 * 
 * @module core/logger
 * @example
 * import * as logger from './core/logger.js';
 * 
 * logger.info('Starting application...');
 * logger.success('Operation completed successfully!');
 * logger.error('An error occurred:', error);
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as colors from './colors.js';

/* global console, process */

// Initialize directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

// Module state
let verbose = false;
let logStream = null;
let currentStep = 0;
let totalSteps = 0;
let stepStartTime = 0;
let startTime = Date.now();

/**
 * Set verbose logging mode
 * 
 * @function setVerbose
 * @param {boolean} isVerbose - Whether to enable verbose logging
 * @description Toggles verbose logging mode, which controls whether debug messages 
 * are displayed. When enabled, all levels of logs are shown including detailed debug
 * information. When disabled, debug messages are suppressed.
 * @example
 * // Enable verbose logging for detailed output
 * logger.setVerbose(true);
 * 
 * // Disable verbose logging for concise output
 * logger.setVerbose(false);
 */
export function setVerbose(isVerbose) {
  verbose = isVerbose;
}

/**
 * Start logging to a file
 * 
 * @function startFileLogging
 * @param {string} [filename] - Optional custom filename, defaults to timestamp-based name
 * @returns {string} - Path to the log file
 * @description Begins capturing all console output to a log file in addition to the 
 * terminal display. Creates the logs directory if it doesn't exist. If no filename is
 * provided, a timestamped filename is generated automatically. ANSI color codes are
 * stripped from file output for readability.
 * @example
 * // Start logging with auto-generated filename
 * const logPath = logger.startFileLogging();
 * console.log(`Logging to ${logPath}`);
 * 
 * // Start logging with a custom filename
 * const customLogPath = logger.startFileLogging('preview-deployment.log');
 */
export function startFileLogging(filename) {
  // Create logs directory if it doesn't exist
  const logsDir = path.join(rootDir, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  // Create filename with timestamp if not provided
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultFilename = `preview-${timestamp}.log`;
  const logFile = path.join(logsDir, filename || defaultFilename);
  
  // Create write stream
  logStream = fs.createWriteStream(logFile, { flags: 'a' });
  
  // Strip ANSI color codes for log files
  const stripColors = (text) => {
    if (typeof text !== 'string') return String(text);
    
    // Remove ANSI color sequences using string splitting approach
    const ESC = String.fromCharCode(27);
    let result = '';
    let i = 0;
    
    while (i < text.length) {
      if (text[i] === ESC && text[i + 1] === '[') {
        // Skip until 'm' character which ends color sequence
        i += 2; // Skip 'ESC['
        while (i < text.length && text[i] !== 'm') {
          i++;
        }
        if (i < text.length) i++; // Skip the 'm'
      } else {
        result += text[i++];
      }
    }
    
    return result;
  };
  
  // Store original console methods
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const originalConsoleInfo = console.info;
  
  // Override console methods to capture to file
  console.log = function(...args) {
    const cleanArgs = args.map(stripColors);
    logStream.write(cleanArgs.join(' ') + '\n');
    originalConsoleLog.apply(console, args);
  };
  
  console.error = function(...args) {
    const cleanArgs = args.map(stripColors);
    logStream.write('[ERROR] ' + cleanArgs.join(' ') + '\n');
    originalConsoleError.apply(console, args);
  };
  
  console.warn = function(...args) {
    const cleanArgs = args.map(stripColors);
    logStream.write('[WARN] ' + cleanArgs.join(' ') + '\n');
    originalConsoleWarn.apply(console, args);
  };
  
  console.info = function(...args) {
    const cleanArgs = args.map(stripColors);
    logStream.write('[INFO] ' + cleanArgs.join(' ') + '\n');
    originalConsoleInfo.apply(console, args);
  };
  
  return logFile;
}

/**
 * Stop file logging and close the log stream
 * 
 * @function stopFileLogging
 * @description Stops file logging and closes the log file stream. Should be called
 * at the end of the workflow or when logging to file is no longer needed. Not calling
 * this function might result in incomplete log files or file handle leaks.
 * @example
 * // After workflow completes
 * logger.stopFileLogging();
 */
export function stopFileLogging() {
  if (logStream) {
    logStream.end();
    logStream = null;
  }
}

/**
 * Log a standard message
 * 
 * @function log
 * @param {string} message - The message to log
 * @description Outputs a standard, unformatted message to the console and log file
 * (if file logging is enabled). Unlike the other logging methods, this doesn't
 * add any prefix or color formatting.
 * @example
 * logger.log('This is a standard log message with no formatting');
 */
export function log(message) {
  console.log(message);
}

/**
 * Log an info message (blue)
 * 
 * @function info
 * @param {string} message - The message to log
 * @description Outputs an information message with a blue "INFO:" prefix. Used for
 * general information and status updates that are important but not warnings or errors.
 * @example
 * logger.info('Configuration loaded successfully');
 * // Outputs: "[INFO:] Configuration loaded successfully" (with "INFO:" in blue)
 */
export function info(message) {
  console.log(`${colors.styled.info('INFO:')} ${message}`);
}

/**
 * Log a success message (green)
 * 
 * @function success
 * @param {string} message - The message to log
 * @description Outputs a success message with a green "SUCCESS:" prefix. Used to
 * indicate that an operation or step completed successfully.
 * @example
 * logger.success('Deployment completed without errors');
 * // Outputs: "[SUCCESS:] Deployment completed without errors" (with "SUCCESS:" in green)
 */
export function success(message) {
  console.log(`${colors.styled.success('SUCCESS:')} ${message}`);
}

/**
 * Log a warning message (yellow)
 * 
 * @function warn
 * @param {string} message - The message to log
 * @description Outputs a warning message with a yellow "WARNING:" prefix. Used for
 * issues that don't prevent the workflow from continuing but should be noted.
 * @example
 * logger.warn('API rate limit approaching, operations may be throttled');
 * // Outputs: "[WARNING:] API rate limit approaching, operations may be throttled" (with "WARNING:" in yellow)
 */
export function warn(message) {
  console.warn(`${colors.styled.warning('WARNING:')} ${message}`);
}

/**
 * Log an error message (red)
 * 
 * @function error
 * @param {string} message - The message to log
 * @description Outputs an error message with a red "ERROR:" prefix. Used for
 * significant issues that may prevent parts of the workflow from functioning correctly.
 * @example
 * logger.error('Failed to connect to database');
 * // Outputs: "[ERROR:] Failed to connect to database" (with "ERROR:" in red)
 */
export function error(message) {
  console.error(`${colors.styled.error('ERROR:')} ${message}`);
}

/**
 * Log a debug message (only shown in verbose mode)
 * 
 * @function debug
 * @param {string} message - The message to log
 * @description Outputs a debug message with a dimmed "DEBUG:" prefix, but only when
 * verbose mode is enabled. Used for detailed diagnostic information that would
 * normally clutter the output.
 * @example
 * logger.debug('Request payload: ' + JSON.stringify(data));
 * // Only appears if verbose mode is enabled
 */
export function debug(message) {
  if (verbose) {
    console.log(`${colors.styled.format('DEBUG:', colors.colors.dim)} ${message}`);
  }
}

/**
 * Start a section with a title
 * 
 * @function section
 * @param {string} title - The section title
 * @description Creates a visually distinct section header in the logs, with the
 * provided title in uppercase and surrounded by separator lines. Useful for
 * dividing the workflow output into logical sections.
 * @example
 * logger.section('Initializing Deployment');
 * // Outputs a header like:
 * // ==========================================================
 * // INITIALIZING DEPLOYMENT
 * // ==========================================================
 */
export function section(title) {
  console.log('\n');
  console.log(`${colors.colors.cyan}${colors.colors.bold}${'='.repeat(80)}${colors.colors.reset}`);
  console.log(`${colors.colors.cyan}${colors.colors.bold}${title.toUpperCase()}${colors.colors.reset}`);
  console.log(`${colors.colors.cyan}${colors.colors.bold}${'='.repeat(80)}${colors.colors.reset}`);
  console.log('');
}

/**
 * Create a section header (alias for section)
 * 
 * @function sectionHeader
 * @param {string} title - The section title
 * @description Alias for the section() function, provided for backward compatibility
 * and readability in some contexts.
 * @see section
 * @example
 * logger.sectionHeader('Building Application');
 */
export function sectionHeader(title) {
  section(title);
}

/**
 * Set up step tracking for multi-step processes
 * 
 * @function setSteps
 * @param {number} steps - Total number of steps
 * @description Initializes the step tracking system with the total number of steps
 * in the workflow. Resets the current step counter to 0 and starts the workflow timer.
 * This should be called once at the beginning of a multi-step workflow.
 * @example
 * // Initialize a workflow with 5 total steps
 * logger.setSteps(5);
 */
export function setSteps(steps) {
  totalSteps = steps;
  currentStep = 0;
  startTime = Date.now();
}

/**
 * Start a new step with a title
 * 
 * @function startStep
 * @param {string} title - The step title
 * @description Marks the beginning of a new step in the workflow. Increments the
 * current step counter, displays a header with step number, title, and starts
 * timing for this step. Should be paired with endStep().
 * @example
 * // Start the "Authentication" step (assuming setSteps was called earlier)
 * logger.startStep('Authentication');
 * // Outputs a header like:
 * // STEP 1/5: AUTHENTICATION
 * // ============================================================
 */
export function startStep(title) {
  currentStep++;
  stepStartTime = Date.now();
  
  console.log('\n');
  console.log(`${colors.colors.cyan}${colors.colors.bold}STEP ${currentStep}/${totalSteps}: ${title.toUpperCase()}${colors.colors.reset}`);
  console.log(`${colors.colors.cyan}${colors.colors.bold}${'='.repeat(60)}${colors.colors.reset}`);
  console.log('');
}

/**
 * End a step with status
 * 
 * @function endStep
 * @param {string} status - The status ('success', 'warning', or 'error')
 * @param {string} message - An optional message
 * @description Marks the end of a workflow step. Displays the time taken to complete
 * the step and a status message with appropriate color coding (green for success,
 * yellow for warning, red for error). Should be called after startStep().
 * @example
 * // End a step successfully
 * logger.endStep('success', 'All checks passed');
 * 
 * // End a step with a warning
 * logger.endStep('warning', 'Minor issues detected, continuing anyway');
 * 
 * // End a step with an error
 * logger.endStep('error', 'Critical failure in deployment');
 */
export function endStep(status = 'success', message = '') {
  const elapsed = ((Date.now() - stepStartTime) / 1000).toFixed(1);
  const statusColor = status === 'success' ? colors.colors.green : 
                     status === 'warning' ? colors.colors.yellow : colors.colors.red;
  
  console.log('\n');
  console.log(`${statusColor}${colors.colors.bold}Step completed in ${elapsed}s${colors.colors.reset}`);
  
  if (message) {
    console.log(`${statusColor}${message}${colors.colors.reset}`);
  }
  
  console.log(`${colors.colors.cyan}${colors.colors.bold}${'='.repeat(60)}${colors.colors.reset}`);
}

/**
 * Show overall progress as a percentage
 * 
 * @function showProgress
 * @description Displays the overall workflow progress as a percentage and shows the
 * total elapsed time. Uses the current step number and total steps set with setSteps().
 * Useful for long-running workflows to give users a sense of progress.
 * @example
 * // After several steps have completed
 * logger.showProgress();
 * // Outputs something like:
 * // Overall Progress: 60% (45.3s elapsed)
 */
export function showProgress() {
  if (totalSteps === 0) return;
  
  const percent = Math.round((currentStep / totalSteps) * 100);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log(`\n${colors.colors.blue}${colors.colors.bold}Overall Progress: ${percent}% (${elapsed}s elapsed)${colors.colors.reset}\n`);
}

/**
 * Get the colors object for external use
 * 
 * @function getColors
 * @returns {Object} The colors object with all available color functions
 * @description Provides access to the underlying colors utility for components
 * that need direct color control. The returned object contains color codes and
 * formatting functions for terminal output.
 * @example
 * const colors = logger.getColors();
 * console.log(`${colors.green}This text is green${colors.reset}`);
 */
export function getColors() {
  return colors.colors;
}

export default {
  setVerbose,
  startFileLogging,
  stopFileLogging,
  log,
  info,
  success,
  warn,
  error,
  debug,
  section,
  sectionHeader,
  setSteps,
  startStep,
  endStep,
  showProgress,
  getColors
}; 