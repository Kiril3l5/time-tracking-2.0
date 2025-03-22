#!/usr/bin/env node

/**
 * Environment Module
 * 
 * Provides utilities for managing environment-specific functionality,
 * including environment name generation, .env file validation, and
 * environment type detection.
 * 
 * Features:
 * - Generate unique environment names for preview channels
 * - Validate environment variables and .env files
 * - Detect CI/CD environment vs local development
 * - Manage environment type (development, staging, production)
 * 
 * @module preview/environment
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as logger from './logger.js';
import * as commandRunner from './command-runner.js';

/* global process */

// Initialize directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

/**
 * Check if running in CI/CD environment
 * @returns {boolean} Whether running in CI/CD
 */
export function isCI() {
  return !!(
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.GITLAB_CI ||
    process.env.CIRCLECI ||
    process.env.TRAVIS
  );
}

/**
 * Get the current environment type
 * @returns {string} Environment type ('development', 'staging', 'production', 'preview')
 */
export function getEnvironmentType() {
  // First check for explicit environment
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv) {
    if (['development', 'staging', 'production', 'preview'].includes(nodeEnv)) {
      return nodeEnv;
    }
  }
  
  // Check branch name for environment hints
  const branchName = getBranchName();
  if (branchName) {
    if (branchName === 'main' || branchName === 'master') {
      return 'production';
    }
    
    if (branchName === 'staging' || branchName === 'stage') {
      return 'staging';
    }
    
    if (branchName.startsWith('pr-') || branchName.startsWith('preview-')) {
      return 'preview';
    }
  }
  
  // Default to development
  return 'development';
}

/**
 * Get the current branch name
 * @returns {string|null} Branch name or null if not available
 */
export function getBranchName() {
  // First check environment variables (often set in CI)
  if (process.env.GITHUB_REF) {
    const match = process.env.GITHUB_REF.match(/refs\/heads\/(.+)/);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  // Otherwise try to get it from git command
  const result = commandRunner.runCommand('git rev-parse --abbrev-ref HEAD', {
    stdio: 'pipe',
    ignoreError: true
  });
  
  if (result.success) {
    return result.output.trim();
  }
  
  return null;
}

/**
 * Generate a unique environment name for preview channels
 * @param {string} branchName - Branch name to base the environment name on
 * @returns {string} Environment name suitable for preview channels
 */
export function generateEnvironmentName(branchName) {
  if (!branchName) {
    branchName = getBranchName() || 'unknown';
  }
  
  // Clean up branch name to make it suitable for a channel ID
  // - Remove any characters that aren't alphanumeric, dash, or underscore
  // - Ensure it starts with a letter or number
  // - Convert to lowercase
  // - Limit length to avoid issues
  
  let channelName = branchName
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-') // Replace invalid chars with dash
    .replace(/^[^a-z0-9]+/, '')   // Ensure valid first character
    .replace(/-+/g, '-')          // Replace multiple dashes with single dash
    .substring(0, 30);            // Limit length
  
  // Add a timestamp suffix for uniqueness
  const timestamp = new Date().toISOString()
    .replace(/[^0-9]/g, '')      // Remove non-numeric chars
    .substring(0, 8);            // Use just the date part (YYYYMMDD)
  
  // Combine with a prefix for consistent naming
  return `pr-${channelName}-${timestamp}`;
}

/**
 * Verify required environment variables are set
 * @param {string[]} requiredVars - List of required environment variable names
 * @returns {Object} Verification result with missing variables
 */
export function verifyRequiredEnvVars(requiredVars) {
  const missing = [];
  
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }
  
  if (missing.length > 0) {
    logger.warn(`Missing required environment variables: ${missing.join(', ')}`);
    return {
      valid: false,
      missing
    };
  }
  
  return {
    valid: true,
    missing: []
  };
}

/**
 * Check if a .env file exists and contains required variables
 * @param {Object} options - Options for the check
 * @param {string} [options.fileName='.env'] - Name of the env file to check
 * @param {string[]} [options.requiredVars=[]] - List of required variables
 * @returns {Object} Check result with status and details
 */
export function checkEnvFile(options = {}) {
  const { fileName = '.env', requiredVars = [] } = options;
  
  const envPath = path.join(rootDir, fileName);
  
  // Check if file exists
  if (!fs.existsSync(envPath)) {
    logger.warn(`Environment file ${fileName} not found`);
    return {
      exists: false,
      valid: false,
      missing: requiredVars
    };
  }
  
  // File exists, now check content if required vars specified
  if (requiredVars.length === 0) {
    return {
      exists: true,
      valid: true,
      missing: []
    };
  }
  
  try {
    // Read the file
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n');
    
    // Extract variable names
    const definedVars = new Set();
    
    for (const line of lines) {
      // Skip comments and empty lines
      if (line.trim().startsWith('#') || line.trim() === '') {
        continue;
      }
      
      // Look for variable definitions
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.+)/);
      if (match) {
        definedVars.add(match[1]);
      }
    }
    
    // Check for missing required variables
    const missing = requiredVars.filter(varName => !definedVars.has(varName));
    
    if (missing.length > 0) {
      logger.warn(`Environment file ${fileName} is missing required variables: ${missing.join(', ')}`);
      return {
        exists: true,
        valid: false,
        missing
      };
    }
    
    logger.success(`Environment file ${fileName} contains all required variables`);
    return {
      exists: true,
      valid: true,
      missing: []
    };
  } catch (error) {
    logger.error(`Error reading environment file ${fileName}: ${error.message}`);
    return {
      exists: true,
      valid: false,
      error: error.message
    };
  }
}

/**
 * Create a temporary .env file with specified variables
 * @param {Object} variables - Key-value pairs of environment variables
 * @param {string} [fileName='.env.temp'] - Output file name
 * @returns {string|null} Path to created file or null if failed
 */
export function createTempEnvFile(variables, fileName = '.env.temp') {
  const filePath = path.join(rootDir, fileName);
  
  try {
    let content = '';
    
    // Format each variable
    for (const [key, value] of Object.entries(variables)) {
      content += `${key}=${value}\n`;
    }
    
    // Write the file
    fs.writeFileSync(filePath, content, 'utf8');
    logger.info(`Created temporary environment file: ${fileName}`);
    
    return filePath;
  } catch (error) {
    logger.error(`Failed to create temporary environment file: ${error.message}`);
    return null;
  }
}

export default {
  isCI,
  getEnvironmentType,
  getBranchName,
  generateEnvironmentName,
  verifyRequiredEnvVars,
  checkEnvFile,
  createTempEnvFile
}; 