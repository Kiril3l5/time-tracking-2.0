/* global process, console, setTimeout */

/**
 * Core Utilities Module
 * 
 * Provides essential utility functions for the workflow system.
 */

import { logger } from './logger.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname, basename } from 'path';
import { homedir, platform, cpus, totalmem, freemem } from 'os';
import { errorTracker } from './error-handler.js';
import { performanceMonitor } from './performance-monitor.js';

export class Utils {
  constructor() {
    this.tempDir = join(homedir(), 'workflow-temp');
    this.ensureTempDir();
  }

  /**
   * Ensure temporary directory exists
   * @private
   */
  ensureTempDir() {
    try {
      if (!existsSync(this.tempDir)) {
        mkdirSync(this.tempDir, { recursive: true });
      }
    } catch (error) {
      logger.error(`Failed to create temp directory: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a temporary file
   * @param {string} prefix - File prefix
   * @param {string} suffix - File suffix
   * @returns {string} Path to created file
   */
  createTempFile(prefix = 'temp', suffix = '.tmp') {
    try {
      const tempPath = join(this.tempDir, `${prefix}-${Date.now()}${suffix}`);
      writeFileSync(tempPath, '');
      return tempPath;
    } catch (error) {
      logger.error(`Failed to create temp file: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clean up temporary files
   * @param {number} maxAge - Maximum age in milliseconds
   */
  cleanupTempFiles(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    try {
      const files = readdirSync(this.tempDir);
      
      for (const file of files) {
        const filePath = join(this.tempDir, file);
        const stats = statSync(filePath);
        
        if (stats.isFile()) {
          unlinkSync(filePath);
        }
      }
    } catch (error) {
      logger.error(`Failed to cleanup temp files: ${error.message}`);
      throw error;
    }
  }

  /**
   * Read JSON file safely
   * @param {string} filePath - Path to JSON file
   * @returns {Object|null} Parsed JSON or null if error
   */
  readJsonFile(filePath) {
    try {
      const content = readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      logger.error(`Failed to read JSON file ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Write JSON file safely
   * @param {string} filePath - Path to JSON file
   * @param {Object} data - Data to write
   * @param {number} [indent=2] - Indentation spaces
   * @returns {boolean} Success status
   */
  writeJsonFile(filePath, data, indent = 2) {
    try {
      const content = JSON.stringify(data, null, indent);
      writeFileSync(filePath, content, 'utf8');
      return true;
    } catch (error) {
      logger.error(`Failed to write JSON file ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if file exists
   * @param {string} filePath - Path to check
   * @returns {boolean} Whether file exists
   */
  fileExists(filePath) {
    try {
      return existsSync(filePath);
    } catch (error) {
      logger.warn(`Failed to check file existence ${filePath}: ${error.message}`);
      return false;
    }
  }

  /**
   * Get file size
   * @param {string} filePath - Path to file
   * @returns {number|null} File size in bytes or null if error
   */
  getFileSize(filePath) {
    try {
      const stats = statSync(filePath);
      return stats.size;
    } catch (error) {
      logger.warn(`Failed to get file size ${filePath}: ${error.message}`);
      return null;
    }
  }

  /**
   * Format bytes to human readable string
   * @param {number} bytes - Number of bytes
   * @returns {string} Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Get system information
   * @returns {Object} System information
   */
  getSystemInfo() {
    return {
      platform: platform(),
      arch: process.arch,
      nodeVersion: process.version,
      cpus: cpus(),
      memory: {
        total: totalmem(),
        free: freemem()
      }
    };
  }

  /**
   * Measure execution time of a function
   * @param {Function} fn - Function to measure
   * @param {string} name - Name for performance tracking
   * @returns {Promise<any>} Function result
   */
  async measureExecution(fn, name) {
    const startTime = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      performanceMonitor.trackStepPerformance(name, duration);
      return result;
    } catch (error) {
      errorTracker.addError(error);
      throw error;
    }
  }

  /**
   * Retry a function with exponential backoff
   * @param {Function} fn - Function to retry
   * @param {Object} options - Retry options
   * @param {number} [options.maxAttempts=3] - Maximum retry attempts
   * @param {number} [options.initialDelay=1000] - Initial delay in ms
   * @returns {Promise<any>} Function result
   */
  async retry(fn, { maxAttempts = 3, initialDelay = 1000 } = {}) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt === maxAttempts) break;
        
        const delay = initialDelay * Math.pow(2, attempt - 1);
        logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
}

export const utils = new Utils(); 