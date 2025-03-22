#!/usr/bin/env node

/**
 * Configuration Module
 * 
 * Provides centralized configuration settings for the preview deployment
 * workflow. Includes default settings and environment-specific overrides.
 * 
 * Features:
 * - Firebase project and site configuration
 * - Preview channel settings (prefix, lifetime, cleanup)
 * - Build and deployment options
 * - GitHub integration settings
 * 
 * @module preview/config
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as logger from './logger.js';

/* global process */

// Initialize directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

/**
 * Load configuration from package.json if available
 * @returns {Object} Configuration object from package.json
 */
function loadPackageConfig() {
  try {
    const packagePath = path.join(rootDir, 'package.json');
    if (fs.existsSync(packagePath)) {
      const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      return packageData.preview || {};
    }
  } catch (error) {
    logger.warn(`Could not load configuration from package.json: ${error.message}`);
  }
  
  return {};
}

// Load configuration from package.json
const packageConfig = loadPackageConfig();

/**
 * Firebase configuration 
 */
export const firebaseConfig = {
  // Firebase project ID
  projectId: process.env.FIREBASE_PROJECT_ID || packageConfig.projectId || 'your-firebase-project',
  
  // Firebase hosting site name (defaults to project ID if not specified)
  site: process.env.FIREBASE_SITE || packageConfig.site,
  
  // Build directory to deploy
  buildDir: process.env.BUILD_DIR || packageConfig.buildDir || 'build',
  
  // Additional Firebase options
  options: {
    // Whether to use the Firebase emulator
    useEmulator: process.env.FIREBASE_USE_EMULATOR === 'true' || packageConfig.useEmulator === true || false
  }
};

// If site is not specified, default to project ID
if (!firebaseConfig.site) {
  firebaseConfig.site = firebaseConfig.projectId;
}

/**
 * Preview channel configuration
 */
export const previewConfig = {
  // Prefix for preview channels
  prefix: process.env.PREVIEW_PREFIX || packageConfig.prefix || 'pr-',
  
  // Number of days until preview expires
  expireDays: parseInt(process.env.PREVIEW_EXPIRE_DAYS || packageConfig.expireDays || '7', 10),
  
  // Number of preview channels to keep when cleaning up
  keepCount: parseInt(process.env.PREVIEW_KEEP_COUNT || packageConfig.keepCount || '5', 10),
  
  // Whether to delete older channels automatically
  autoCleanup: process.env.PREVIEW_AUTO_CLEANUP === 'true' || packageConfig.autoCleanup === true || true
};

/**
 * Build configuration
 */
export const buildConfig = {
  // The build script to run (from package.json scripts)
  script: process.env.BUILD_SCRIPT || packageConfig.buildScript || 'build',
  
  // Environment variables to inject during build
  env: {
    NODE_ENV: 'development',
    REACT_APP_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
    ...(packageConfig.buildEnv || {})
  }
};

/**
 * Git/GitHub configuration
 */
export const gitConfig = {
  // Whether to add deployment comments to PRs
  addPrComments: process.env.GIT_ADD_PR_COMMENTS === 'true' || packageConfig.addPrComments === true || true,
  
  // The current PR number (if available)
  prNumber: process.env.PR_NUMBER || null,
  
  // The GitHub repository owner/name
  repo: process.env.GITHUB_REPOSITORY || packageConfig.repo || null
};

/**
 * Get full path to a project file or directory
 * @param {string} relativePath - Path relative to project root
 * @returns {string} Full path
 */
export function getProjectPath(relativePath) {
  return path.join(rootDir, relativePath);
}

/**
 * Get the project root directory
 * @returns {string} Project root directory
 */
export function getProjectRoot() {
  return rootDir;
}

/**
 * Format configuration as string for logging
 * @returns {string} Formatted configuration
 */
export function formatConfig() {
  // Create a sanitized copy of the config without any sensitive data
  const config = {
    firebase: {
      projectId: firebaseConfig.projectId,
      site: firebaseConfig.site,
      buildDir: firebaseConfig.buildDir
    },
    preview: { ...previewConfig },
    build: {
      script: buildConfig.script
    },
    git: {
      addPrComments: gitConfig.addPrComments,
      prNumber: gitConfig.prNumber || 'Not specified'
    }
  };
  
  return JSON.stringify(config, null, 2);
}

/**
 * Log the current configuration
 */
export function logConfig() {
  logger.info('Current configuration:');
  logger.info(formatConfig());
}

export default {
  firebaseConfig,
  previewConfig,
  buildConfig,
  gitConfig,
  getProjectPath,
  getProjectRoot,
  formatConfig,
  logConfig
}; 