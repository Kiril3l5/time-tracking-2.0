#!/usr/bin/env node

/**
 * Logger Module
 * 
 * Provides unified logging functionality with structured output format,
 * file logging capabilities, color-coded messages, and log levels.
 * 
 * Features:
 * - Color-coded output for different types of messages
 * - Section formatting and visual separation for steps
 * - Optional file logging with ANSI color code stripping
 * - Verbose mode toggle for detailed or concise output
 * 
 * @module preview/logger
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
 * @param {boolean} isVerbose - Whether to enable verbose logging
 */
export function setVerbose(isVerbose) {
  verbose = isVerbose;
}

/**
 * Start logging to a file
 * @param {string} [filename] - Optional custom filename, defaults to timestamp-based name
 * @returns {string} - Path to the log file
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
 */
export function stopFileLogging() {
  if (logStream) {
    logStream.end();
    logStream = null;
  }
}

/**
 * Log a standard message
 * @param {string} message - The message to log
 */
export function log(message) {
  console.log(message);
}

/**
 * Log an info message (blue)
 * @param {string} message - The message to log
 */
export function info(message) {
  console.log(`${colors.styled.info('INFO:')} ${message}`);
}

/**
 * Log a success message (green)
 * @param {string} message - The message to log
 */
export function success(message) {
  console.log(`${colors.styled.success('SUCCESS:')} ${message}`);
}

/**
 * Log a warning message (yellow)
 * @param {string} message - The message to log
 */
export function warn(message) {
  console.warn(`${colors.styled.warning('WARNING:')} ${message}`);
}

/**
 * Log an error message (red)
 * @param {string} message - The message to log
 */
export function error(message) {
  console.error(`${colors.styled.error('ERROR:')} ${message}`);
}

/**
 * Log a debug message (only shown in verbose mode)
 * @param {string} message - The message to log
 */
export function debug(message) {
  if (verbose) {
    console.log(`${colors.styled.format('DEBUG:', colors.colors.dim)} ${message}`);
  }
}

/**
 * Start a section with a title
 * @param {string} title - The section title
 */
export function section(title) {
  console.log('\n');
  console.log(`${colors.colors.cyan}${colors.colors.bold}${'='.repeat(80)}${colors.colors.reset}`);
  console.log(`${colors.colors.cyan}${colors.colors.bold}${title.toUpperCase()}${colors.colors.reset}`);
  console.log(`${colors.colors.cyan}${colors.colors.bold}${'='.repeat(80)}${colors.colors.reset}`);
  console.log('');
}

/**
 * Set up step tracking for multi-step processes
 * @param {number} steps - Total number of steps
 */
export function setSteps(steps) {
  totalSteps = steps;
  currentStep = 0;
  startTime = Date.now();
}

/**
 * Start a new step with a title
 * @param {string} title - The step title
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
 * @param {string} status - The status (success, warning, error)
 * @param {string} message - An optional message
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
 */
export function showProgress() {
  if (totalSteps === 0) return;
  
  const percent = Math.round((currentStep / totalSteps) * 100);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log(`\n${colors.colors.blue}${colors.colors.bold}Overall Progress: ${percent}% (${elapsed}s elapsed)${colors.colors.reset}\n`);
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
  setSteps,
  startStep,
  endStep,
  showProgress
}; 