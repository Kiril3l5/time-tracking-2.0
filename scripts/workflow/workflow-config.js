/**
 * Workflow Configuration Module
 * 
 * Centralizes configuration for the workflow system, combining
 * environment settings, Firebase settings, and workflow options.
 */

import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import fs from 'fs';
import { logger } from '../core/logger.js';
import config from '../core/config.js';
import environment from '../core/environment.js';

/* global process */

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../..');

// Constants for file paths
const FIREBASE_RC_PATH = join(rootDir, '.firebaserc');

/**
 * Load configuration from .firebaserc
 * @returns {Object} Firebase configuration from .firebaserc
 */
function loadFirebaseConfig() {
  try {
    if (fs.existsSync(FIREBASE_RC_PATH)) {
      const firebaseRcData = JSON.parse(fs.readFileSync(FIREBASE_RC_PATH, 'utf8'));
      const projectId = firebaseRcData.projects?.default;
      
      if (projectId) {
        logger.debug(`Loaded Firebase project ID from .firebaserc: ${projectId}`);
        
        // Get hosting targets if available
        const targets = firebaseRcData.targets?.[projectId]?.hosting || {};
        
        return {
          projectId,
          targets,
          success: true
        };
      }
    }
    
    return {
      success: false,
      error: 'Firebase configuration not found or incomplete'
    };
  } catch (error) {
    logger.warn(`Could not load configuration from .firebaserc: ${error.message}`);
    return {
      success: false,
      error: `Failed to load Firebase configuration: ${error.message}`
    };
  }
}

/**
 * Get fully resolved workflow configuration
 */
export function getWorkflowConfig() {
  // Start with base configuration from core config module
  const baseConfig = config.firebaseConfig || {};
  
  // Get Firebase configuration
  const firebaseConfig = loadFirebaseConfig();
  
  // Get environment configuration
  const envConfig = {
    environment: environment.getCurrentEnvironment(),
    isCI: environment.isCI && environment.isCI()
  };

  // Override with environment variables if present
  const workflowConfig = {
    // Base configuration
    ...baseConfig,
    
    // Firebase configuration
    firebase: {
      projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId,
      site: process.env.FIREBASE_SITE || firebaseConfig.targets,
      buildDir: process.env.BUILD_DIR || 'dist',
      useEmulator: process.env.FIREBASE_USE_EMULATOR === 'true'
    },
    
    // Preview configuration
    preview: {
      prefix: process.env.PREVIEW_PREFIX || 'preview-',
      expireDays: parseInt(process.env.PREVIEW_EXPIRE_DAYS || '7', 10),
      keepCount: parseInt(process.env.PREVIEW_KEEP_COUNT || '5', 10),
      autoCleanup: process.env.PREVIEW_AUTO_CLEANUP === 'true' || true
    },
    
    // Environment configuration
    environment: envConfig.environment,
    isCI: envConfig.isCI,
    
    // Validation thresholds
    validation: {
      maxBundleSizeIncrease: parseInt(process.env.MAX_BUNDLE_SIZE_INCREASE || '10', 10),
      maxDeadCodeCount: parseInt(process.env.MAX_DEAD_CODE_COUNT || '10', 10),
      maxDocsIssues: parseInt(process.env.MAX_DOCS_ISSUES || '5', 10)
    },
    
    // Timestamps for tracking
    timestamp: new Date().toISOString()
  };

  return workflowConfig;
}

/**
 * Validate workflow configuration
 * @param {Object} config - The workflow configuration to validate
 * @returns {Object} Validation result
 */
export function validateWorkflowConfig(config) {
  const errors = [];
  const warnings = [];
  
  // Required fields
  if (!config.firebase.projectId) {
    errors.push('Firebase project ID is not configured');
  }
  
  // Ensure site or targets configuration is available
  if (!config.firebase.site && 
      (!config.firebase.targets || Object.keys(config.firebase.targets).length === 0)) {
    warnings.push('Firebase hosting site not configured - deployment may fail');
  }
  
  // Ensure build directory exists for deployment
  const adminDistPath = join(rootDir, 'packages/admin/dist');
  const hoursDistPath = join(rootDir, 'packages/hours/dist');
  
  if (!fs.existsSync(adminDistPath) && !config.skipBuild) {
    warnings.push('Admin build directory does not exist - build may be required');
  }
  
  if (!fs.existsSync(hoursDistPath) && !config.skipBuild) {
    warnings.push('Hours build directory does not exist - build may be required');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    // Provide with helpful fixes for common issues
    fixes: errors.map(error => {
      if (error.includes('project ID')) {
        return 'Create or configure .firebaserc with your project ID';
      }
      return null;
    }).filter(Boolean)
  };
}

/**
 * Format workflow configuration for logging
 * @returns {string} Formatted configuration
 */
export function formatWorkflowConfig(config) {
  const sanitizedConfig = {
    firebase: {
      projectId: config.firebase.projectId,
      site: config.firebase.site,
      buildDir: config.firebase.buildDir
    },
    preview: { ...config.preview },
    environment: config.environment,
    validation: { ...config.validation },
    timestamp: config.timestamp
  };
  
  return JSON.stringify(sanitizedConfig, null, 2);
}

/**
 * Create a workflow configuration with options
 * @param {Object} options - Command line options
 * @returns {Object} Complete workflow configuration
 */
export function createWorkflowConfig(options = {}) {
  const config = getWorkflowConfig();
  
  // Merge with options
  return {
    ...config,
    options
  };
}

export default {
  getWorkflowConfig,
  validateWorkflowConfig,
  formatWorkflowConfig,
  createWorkflowConfig
}; 