/* global process, console */

/* eslint-disable no-console */

/**
 * Logger Module
 * 
 * Provides centralized logging with file and console output.
 */

import fs from 'fs';
import path from 'path';

export class Logger {
  constructor() {
    this.logDir = path.join(process.cwd(), 'logs');
    this.currentLogFile = null;
    this.logLevels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
    this.currentLevel = this.logLevels.info;
    this.maxLogSize = 5 * 1024 * 1024; // 5MB
    this.maxLogFiles = 5;
    this.verbose = false;
  }

  /**
   * Initialize logger
   */
  init() {
    try {
      // Create logs directory if it doesn't exist
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      // Create log file with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.currentLogFile = path.join(this.logDir, `workflow-${timestamp}.log`);
      
      // Clean up old log files
      this.cleanupOldLogs();
      
      // Write initial log entry
      this.info('Logger initialized');
      
      // Only show log file path in verbose mode
      if (this.verbose) {
        console.log(`Log file: ${this.currentLogFile}`);
      }
    } catch (error) {
      // Fallback to console-only logging
      this.currentLogFile = null;
      this.error('Failed to initialize file logging, falling back to console only');
    }
  }

  /**
   * Format error for display
   * @private
   */
  formatError(error) {
    if (!error) return '';
    if (typeof error === 'string') return error;
    
    // Clean up error message
    const message = error.message || String(error);
    if (!this.verbose) {
      return message.split('\n')[0]; // Just the main error message without stack
    }
    return error.stack || message; // Full stack in verbose mode
  }

  /**
   * Write log entry
   * @private
   */
  writeLog(level, message, data) {
    try {
      const timestamp = new Date().toISOString();
      let finalMessage = message;

      // Format error objects
      if (data instanceof Error) {
        data = this.formatError(data);
      }

      // Clean up the message
      if (data) {
        if (typeof data === 'object') {
          try {
            finalMessage += ' ' + JSON.stringify(data, null, this.verbose ? 2 : 0);
          } catch {
            finalMessage += ' ' + String(data);
          }
        } else {
          finalMessage += ' ' + data;
        }
      }

      const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${finalMessage}`;
      
      // Always write to file if available
      if (this.currentLogFile) {
        fs.appendFileSync(this.currentLogFile, logEntry + '\n');
      }

      // Always show errors and warnings
      if (level === 'error' || level === 'warn') {
        console[level](finalMessage);
        return;
      }

      // In non-verbose mode, only show info messages
      // In verbose mode, show both info and debug
      if (level === 'info' || (this.verbose && level === 'debug')) {
        console.log(finalMessage);
      }
    } catch (error) {
      console.error('Failed to log:', error.message);
    }
  }

  /**
   * Set verbose mode
   * @param {boolean} verbose - Whether to enable verbose mode
   */
  setVerbose(verbose) {
    this.verbose = verbose;
    // Set log level based on verbose mode
    this.currentLevel = verbose ? this.logLevels.debug : this.logLevels.info;
  }

  /**
   * Clean up old log files
   * @private
   */
  cleanupOldLogs() {
    try {
      const files = fs.readdirSync(this.logDir)
        .filter(file => file.startsWith('workflow-') && file.endsWith('.log'))
        .map(file => ({
          name: file,
          path: path.join(this.logDir, file),
          time: fs.statSync(path.join(this.logDir, file)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      // Remove old files beyond maxLogFiles
      while (files.length > this.maxLogFiles) {
        const file = files.pop();
        fs.unlinkSync(file.path);
      }
    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
    }
  }

  /**
   * Check if log file needs rotation
   * @private
   */
  checkLogRotation() {
    if (!this.currentLogFile || !fs.existsSync(this.currentLogFile)) {
      return;
    }

    const stats = fs.statSync(this.currentLogFile);
    if (stats.size > this.maxLogSize) {
      this.cleanupOldLogs();
      this.init();
    }
  }

  /**
   * Set log level
   * @param {string} level - Log level (error, warn, info, debug)
   */
  setLevel(level) {
    if (this.logLevels[level] !== undefined) {
      this.currentLevel = this.logLevels[level];
    }
  }

  /**
   * Log error message
   */
  error(message, ...args) {
    this.writeLog('error', message, ...args);
  }

  /**
   * Log warning message
   */
  warn(message, ...args) {
    this.writeLog('warn', message, ...args);
  }

  /**
   * Log info message
   */
  info(message, ...args) {
    this.writeLog('info', message, ...args);
  }

  /**
   * Log debug message
   */
  debug(message, ...args) {
    this.writeLog('debug', message, ...args);
  }

  /**
   * Stop file logging
   */
  stopFileLogging() {
    this.currentLogFile = null;
  }

  /**
   * Log section header
   */
  sectionHeader(message) {
    const separator = '='.repeat(80);
    this.info(separator);
    this.info(message);
    this.info(separator);
  }

  /**
   * Log success message
   */
  success(message, ...args) {
    this.writeLog('info', `✓ ${message}`, ...args);
  }
}

// Create and export a singleton instance
export const logger = new Logger(); 