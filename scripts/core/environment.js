#!/usr/bin/env node

/**
 * Environment Module
 * 
 * Handles environment variable management, validation, and configuration
 * for different deployment environments (dev, test, production).
 * 
 * Features:
 * - Load environment variables from .env files
 * - Validate required environment variables
 * - Generate environment-specific configurations
 * - Normalize environment names
 * 
 * @module core/environment
 */

import fs from 'fs';
import { logger } from './logger.js';

/* global process */

// Environment types
export const ENV_TYPES = {
  DEVELOPMENT: 'development',
  TEST: 'test',
  PREVIEW: 'preview',
  PRODUCTION: 'production'
};

// Mapping of environment names to standardized types
const ENV_NAME_MAPPING = {
  'dev': ENV_TYPES.DEVELOPMENT,
  'development': ENV_TYPES.DEVELOPMENT,
  'local': ENV_TYPES.DEVELOPMENT,
  'test': ENV_TYPES.TEST,
  'testing': ENV_TYPES.TEST,
  'preview': ENV_TYPES.PREVIEW,
  'staging': ENV_TYPES.PREVIEW,
  'prod': ENV_TYPES.PRODUCTION,
  'production': ENV_TYPES.PRODUCTION
};

/**
 * Normalize environment name to a standard type
 * 
 * @param {string} envName - Environment name to normalize
 * @returns {string} - Normalized environment type
 */
export function normalizeEnvironmentName(envName) {
  const normalized = (envName || '').toLowerCase().trim();
  return ENV_NAME_MAPPING[normalized] || ENV_TYPES.DEVELOPMENT;
}

/**
 * Get current environment type from NODE_ENV
 * 
 * @returns {string} - Current environment type
 */
export function getCurrentEnvironment() {
  return normalizeEnvironmentName(process.env.NODE_ENV || 'development');
}

/**
 * Check if a required environment variable exists
 * 
 * @param {string} name - Environment variable name
 * @param {boolean} [throwError=false] - Whether to throw an error if missing
 * @returns {boolean} - Whether the environment variable exists
 */
export function hasEnvVar(name, throwError = false) {
  const exists = typeof process.env[name] !== 'undefined' && process.env[name] !== '';
  
  if (!exists && throwError) {
    throw new Error(`Required environment variable ${name} is missing`);
  }
  
  return exists;
}

/**
 * Validate that required environment variables exist
 * 
 * @param {string[]} requiredVars - Array of required variable names
 * @param {Object} [options] - Validation options
 * @param {boolean} [options.silent=false] - Whether to suppress logging
 * @returns {Object} - Validation result
 */
export function validateEnvVars(requiredVars, options = {}) {
  const { silent = false } = options;
  
  if (!silent) {
    logger.info(`Validating environment variables...`);
  }
  
  const missing = [];
  const present = [];
  
  for (const varName of requiredVars) {
    if (hasEnvVar(varName)) {
      present.push(varName);
    } else {
      missing.push(varName);
    }
  }
  
  const valid = missing.length === 0;
  
  if (!silent) {
    if (valid) {
      logger.success(`All required environment variables are present`);
    } else {
      logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }
  
  return {
    valid,
    missing,
    present
  };
}

/**
 * Check if .env file exists
 * 
 * @param {string} [envFile='.env'] - Env file path
 * @returns {boolean} - Whether the file exists
 */
export function checkEnvFileExists(envFile = '.env') {
  return fs.existsSync(envFile);
}

/**
 * Create a basic .env file if it doesn't exist
 * 
 * @param {string} [envFile='.env'] - Env file path
 * @param {Object} [initialVars={}] - Initial variables to set
 * @returns {boolean} - Whether the file was created
 */
export function ensureEnvFile(envFile = '.env', initialVars = {}) {
  if (checkEnvFileExists(envFile)) {
    logger.info(`Environment file ${envFile} already exists`);
    return false;
  }
  
  logger.info(`Creating environment file ${envFile}`);
  
  let content = '# Environment Variables\n\n';
  
  for (const [key, value] of Object.entries(initialVars)) {
    content += `${key}=${value}\n`;
  }
  
  try {
    fs.writeFileSync(envFile, content, 'utf8');
    logger.success(`Created ${envFile} file`);
    return true;
  } catch (error) {
    logger.error(`Failed to create ${envFile}: ${error.message}`);
    return false;
  }
}

/**
 * Load environment variables from a .env file
 * 
 * @param {string} [envFile='.env'] - Path to .env file
 * @param {boolean} [silent=false] - Whether to suppress logging
 * @returns {boolean} - Whether loading was successful
 */
export function loadEnvFile(envFile = '.env', silent = false) {
  if (!checkEnvFileExists(envFile)) {
    if (!silent) {
      logger.warn(`Environment file ${envFile} not found`);
    }
    return false;
  }
  
  try {
    if (!silent) {
      logger.info(`Loading environment from ${envFile}`);
    }
    
    const content = fs.readFileSync(envFile, 'utf8');
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip comments and empty lines
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }
      
      // Parse KEY=VALUE format
      const match = trimmedLine.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.substring(1, value.length - 1);
        }
        
        // Only set if not already defined in process.env
        if (typeof process.env[key] === 'undefined') {
          process.env[key] = value;
        }
      }
    }
    
    if (!silent) {
      logger.success(`Loaded environment variables from ${envFile}`);
    }
    
    return true;
  } catch (error) {
    if (!silent) {
      logger.error(`Error loading environment file: ${error.message}`);
    }
    return false;
  }
}

/**
 * Load environment variables for a specific environment
 * 
 * @param {string} [envType] - Environment type to load
 * @returns {boolean} - Whether loading was successful
 */
export function loadEnvironment(envType) {
  const env = envType || getCurrentEnvironment();
  
  // Base .env file (always loaded first)
  loadEnvFile('.env', true);
  
  // Environment-specific file
  const envFile = `.env.${env}`;
  const exists = loadEnvFile(envFile);
  
  if (!exists) {
    logger.warn(`No specific environment file found for '${env}', using base environment`);
  }
  
  return true;
}

/**
 * Generate environment variables for deployment
 * 
 * @param {Object} options - Options for environment generation
 * @param {string} [options.envType] - Environment type
 * @param {Object} [options.additionalVars={}] - Additional variables to include
 * @returns {Object} - Generated environment variables
 */
export function generateDeploymentEnv(options = {}) {
  const { envType, additionalVars = {} } = options;
  
  // Start with current env variables
  const env = {
    ...process.env,
    NODE_ENV: normalizeEnvironmentName(envType || getCurrentEnvironment())
  };
  
  // Add additional variables
  Object.assign(env, additionalVars);
  
  return env;
}

/**
 * Write environment variables to a file
 * 
 * @param {Object} env - Environment variables to write
 * @param {Object} options - Options for writing
 * @param {string} [options.path='.env.build'] - Path to write the file
 * @param {boolean} [options.keepExisting=false] - Whether to keep existing variables
 * @returns {string} - Path to the written file
 */
export function writeEnvFile(env, options = {}) {
  const { path = '.env.build', keepExisting = false } = options;
  
  let content = '# Generated Environment Variables\n\n';
  let existingVars = {};
  
  // Read existing file if it exists and keepExisting is true
  if (keepExisting && fs.existsSync(path)) {
    try {
      const existingContent = fs.readFileSync(path, 'utf8');
      const lines = existingContent.split('\n');
      
      for (const line of lines) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          existingVars[match[1].trim()] = match[2].trim();
        }
      }
    } catch (error) {
      logger.warn(`Error reading existing env file: ${error.message}`);
    }
  }
  
  // Combine existing and new variables
  const finalVars = keepExisting ? { ...existingVars, ...env } : env;
  
  // Write variables to file
  for (const [key, value] of Object.entries(finalVars)) {
    // Skip functions, objects, etc.
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      continue;
    }
    
    content += `${key}=${value}\n`;
  }
  
  try {
    fs.writeFileSync(path, content, 'utf8');
    logger.debug(`Written environment variables to ${path}`);
    return path;
  } catch (error) {
    logger.error(`Failed to write environment file: ${error.message}`);
    throw error;
  }
}

/**
 * Check if running in CI environment
 * @returns {boolean} Whether running in CI
 */
export function isCI() {
  const ciEnvironmentVars = [
    'CI',
    'GITHUB_ACTIONS',
    'TRAVIS',
    'CIRCLECI',
    'JENKINS_URL',
    'GITLAB_CI',
    'BITBUCKET_BUILD_NUMBER'
  ];
  
  return ciEnvironmentVars.some(envVar => process.env[envVar]);
}

/**
 * Get the current environment type
 * @returns {string} Current environment type
 */
export function getEnvironmentType() {
  return getCurrentEnvironment();
}

export default {
  ENV_TYPES,
  normalizeEnvironmentName,
  getCurrentEnvironment,
  hasEnvVar,
  validateEnvVars,
  checkEnvFileExists,
  ensureEnvFile,
  loadEnvFile,
  loadEnvironment,
  generateDeploymentEnv,
  writeEnvFile
}; 