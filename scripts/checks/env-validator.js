#!/usr/bin/env node

/**
 * Environment Module
 * 
 * Provides utilities for managing environment-specific functionality,
 * including environment name generation, .env file validation, and
 * environment type detection. This module helps ensure that the application
 * has all necessary environment variables and configurations for proper operation.
 * 
 * Features:
 * - Generate unique environment names for preview channels
 * - Validate environment variables and .env files
 * - Detect CI/CD environment vs local development
 * - Manage environment type (development, staging, production)
 * - Create temporary environment files for deployment
 * - Verify required variables are present
 * 
 * @module preview/environment
 * @example
 * // Basic usage example
 * import * as environment from './checks/env-validator.js';
 * 
 * // Check if running in CI environment
 * if (environment.isCI()) {
 *   console.log('Running in CI/CD environment');
 * }
 * 
 * // Get the current environment type
 * const envType = environment.getEnvironmentType();
 * console.log(`Current environment: ${envType}`);
 * 
 * // Verify required environment variables
 * const checkResult = environment.verifyRequiredEnvVars([
 *   'API_KEY', 'DATABASE_URL', 'AUTH_DOMAIN'
 * ]);
 * 
 * if (!checkResult.valid) {
 *   console.error('Missing required variables:', checkResult.missing);
 * }
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as logger from '../core/logger.js';
import * as commandRunner from '../core/command-runner.js';

/* global process */

// Initialize directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

/**
 * Check if running in CI/CD environment
 * 
 * @function isCI
 * @returns {boolean} Whether running in CI/CD environment
 * @description Determines if the current process is running in a CI/CD environment
 * by checking common environment variables set by various CI platforms. This is useful
 * for conditionally enabling CI-specific behavior or disabling interactive prompts.
 * @example
 * // Adjust behavior based on environment
 * if (isCI()) {
 *   // Use non-interactive mode, read from env vars
 *   console.log('Running in CI environment, using automated mode');
 *   process.env.CI_MODE = 'true';
 * } else {
 *   // Can use interactive prompts
 *   console.log('Running in development environment, interactive mode enabled');
 * }
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
 * 
 * @function getEnvironmentType
 * @returns {string} Environment type ('development', 'staging', 'production', 'preview')
 * @description Determines the current environment type based on environment variables
 * and Git branch name. This helps configure the application appropriately for different
 * environments and deployment targets.
 * @example
 * // Configure API endpoints based on environment type
 * const envType = getEnvironmentType();
 * 
 * let apiBaseUrl;
 * switch (envType) {
 *   case 'production':
 *     apiBaseUrl = 'https://api.example.com';
 *     break;
 *   case 'staging':
 *     apiBaseUrl = 'https://staging-api.example.com';
 *     break;
 *   case 'preview':
 *     apiBaseUrl = 'https://preview-api.example.com';
 *     break;
 *   default:
 *     apiBaseUrl = 'http://localhost:3000';
 * }
 * 
 * console.log(`Using API URL: ${apiBaseUrl} for environment: ${envType}`);
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
 * 
 * @function getBranchName
 * @returns {string|null} Branch name or null if not available
 * @description Retrieves the current Git branch name using environment variables
 * (in CI environments) or Git commands (in local development). This is useful for
 * dynamically naming preview environments or determining the deployment target.
 * @example
 * // Get branch name for logging or naming
 * const branch = getBranchName();
 * 
 * if (branch) {
 *   console.log(`Working on branch: ${branch}`);
 *   
 *   // Use branch name in preview deployment
 *   if (branch !== 'main' && branch !== 'master') {
 *     const previewName = `preview-${branch.replace(/[^a-z0-9]/gi, '-')}`;
 *     console.log(`Preview environment name: ${previewName}`);
 *   }
 * } else {
 *   console.warn('Could not determine branch name');
 * }
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
 * 
 * @function generateEnvironmentName
 * @param {string} branchName - Branch name to base the environment name on
 * @returns {string} Environment name suitable for preview channels
 * @description Creates a unique environment name based on the Git branch name,
 * making it suitable for use as a preview channel identifier. The name is
 * cleaned to remove invalid characters and includes a timestamp for uniqueness.
 * @example
 * // Generate environment name from current branch
 * const currentBranch = getBranchName() || 'unknown';
 * const envName = generateEnvironmentName(currentBranch);
 * 
 * console.log(`Generated environment name: ${envName}`);
 * 
 * // Use in Firebase preview channel deployment
 * const deployCommand = `firebase hosting:channel:deploy ${envName}`;
 * console.log(`Deployment command: ${deployCommand}`);
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
 * 
 * @function verifyRequiredEnvVars
 * @param {string[]} requiredVars - List of required environment variable names
 * @returns {Object} Verification result object containing:
 *   - valid {boolean}: Whether all required variables are present
 *   - missing {string[]}: Array of missing variable names
 * @description Checks if all specified environment variables are defined in the
 * current process environment. Logs warnings for any missing variables and returns
 * a result object with validation status and details.
 * @example
 * // Check for required API credentials
 * const apiCredentials = ['API_KEY', 'API_SECRET', 'API_URL'];
 * const result = verifyRequiredEnvVars(apiCredentials);
 * 
 * if (result.valid) {
 *   console.log('All API credentials are properly configured');
 *   
 *   // Safe to initialize API client
 *   const apiClient = new ApiClient({
 *     key: process.env.API_KEY,
 *     secret: process.env.API_SECRET,
 *     url: process.env.API_URL
 *   });
 * } else {
 *   console.error('Missing required API credentials:', result.missing);
 *   console.error('API initialization will fail, aborting');
 *   process.exit(1);
 * }
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
 * 
 * @function checkEnvFile
 * @param {Object} [options={}] - Options for the check
 * @param {string} [options.fileName='.env'] - Name of the env file to check
 * @param {string[]} [options.requiredVars=[]] - List of required variables
 * @returns {Object} Check result object containing:
 *   - exists {boolean}: Whether the file exists
 *   - valid {boolean}: Whether all required variables are defined in the file
 *   - missing {string[]}: Array of missing variable names
 *   - error {string}: Error message if file read failed
 * @description Validates a .env file by checking if it exists and contains all the
 * specified required variables. This is useful during application startup to verify 
 * that the environment is properly configured before attempting operations that
 * depend on those variables.
 * @example
 * // Check if .env.production file has all required database settings
 * const dbVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_PORT'];
 * const checkResult = checkEnvFile({
 *   fileName: '.env.production',
 *   requiredVars: dbVars
 * });
 * 
 * if (!checkResult.exists) {
 *   console.error('Production environment file not found');
 *   console.error('Create .env.production before deploying');
 *   process.exit(1);
 * } else if (!checkResult.valid) {
 *   console.error('Production environment file is missing variables:', checkResult.missing);
 *   console.error('Please add these variables to .env.production');
 *   process.exit(1);
 * } else {
 *   console.log('Production environment properly configured');
 * }
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
 * 
 * @function createTempEnvFile
 * @param {Object} variables - Key-value pairs of environment variables
 * @param {string} [fileName='.env.temp'] - Output file name
 * @returns {string|null} Path to created file or null if failed
 * @description Creates a temporary environment file with the specified variables.
 * This is useful for deployment scripts that need to inject environment-specific
 * configurations without modifying the main .env file. The created file contains
 * one variable per line in KEY=VALUE format.
 * @example
 * // Create a temporary environment file for testing
 * const testEnv = {
 *   NODE_ENV: 'test',
 *   API_URL: 'https://test-api.example.com',
 *   LOG_LEVEL: 'debug',
 *   DISABLE_ANALYTICS: 'true'
 * };
 * 
 * const envFilePath = createTempEnvFile(testEnv, '.env.test');
 * 
 * if (envFilePath) {
 *   console.log(`Created test environment file at: ${envFilePath}`);
 *   
 *   // Use the file in a test command
 *   const testCommand = `dotenv -e ${envFilePath} jest`;
 *   console.log(`Running tests with custom environment: ${testCommand}`);
 *   
 *   // Clean up when done
 *   process.on('exit', () => {
 *     try {
 *       fs.unlinkSync(envFilePath);
 *       console.log('Removed temporary environment file');
 *     } catch (err) {
 *       console.error('Failed to remove temp env file:', err);
 *     }
 *   });
 * } else {
 *   console.error('Failed to create test environment file');
 * }
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