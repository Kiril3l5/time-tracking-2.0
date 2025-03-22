#!/usr/bin/env node

/**
 * Configuration Module
 * 
 * Provides centralized configuration settings for the preview deployment
 * workflow. Includes default settings, environment-specific overrides,
 * and utilities for accessing configuration values throughout the application.
 * 
 * Features:
 * - Configuration loading from package.json and environment variables
 * - Firebase project and site configuration
 * - Preview channel settings (prefix, lifetime, cleanup)
 * - Build and deployment options
 * - GitHub integration settings
 * - Path utilities for file and directory resolution
 * - Configuration logging and formatting
 * 
 * @module preview/config
 * @example
 * // Basic usage example
 * import { firebaseConfig, previewConfig, getProjectPath } from './core/config.js';
 * 
 * // Access Firebase configuration
 * console.log(`Deploying to project: ${firebaseConfig.projectId}`);
 * console.log(`Build directory: ${firebaseConfig.buildDir}`);
 * 
 * // Use path utilities
 * const absolutePath = getProjectPath('src/components');
 * console.log(`Absolute path to components: ${absolutePath}`);
 * 
 * // Log the full configuration
 * logConfig();
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
 * 
 * @function loadPackageConfig
 * @returns {Object} Configuration object from package.json or empty object if not found
 * @description Attempts to load the 'preview' section from package.json as a configuration
 * source. This allows developers to store default configuration values in the project's
 * package.json file, which is typically version controlled and easily accessible.
 * @example
 * // Example package.json configuration
 * // {
 * //   "name": "my-project",
 * //   "version": "1.0.0",
 * //   "preview": {
 * //     "projectId": "my-firebase-project",
 * //     "buildDir": "dist",
 * //     "prefix": "preview-"
 * //   }
 * // }
 * 
 * const config = loadPackageConfig();
 * console.log(config.projectId); // "my-firebase-project"
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

/**
 * Load Firebase configuration from .firebaserc
 * 
 * @function loadFirebaseConfig
 * @returns {Object} Firebase configuration from .firebaserc or empty object if not found
 * @description Attempts to load Firebase project configuration from the .firebaserc file.
 * This provides access to the actual project ID and hosting targets configured for Firebase.
 */
function loadFirebaseConfig() {
  try {
    const firebaseRcPath = path.join(rootDir, '.firebaserc');
    if (fs.existsSync(firebaseRcPath)) {
      const firebaseRcData = JSON.parse(fs.readFileSync(firebaseRcPath, 'utf8'));
      const projectId = firebaseRcData.projects?.default;
      
      if (projectId) {
        logger.debug(`Loaded Firebase project ID from .firebaserc: ${projectId}`);
        
        // Get hosting targets if available
        const targets = firebaseRcData.targets?.[projectId]?.hosting || {};
        
        return {
          projectId,
          targets
        };
      }
    }
  } catch (error) {
    logger.warn(`Could not load configuration from .firebaserc: ${error.message}`);
  }
  
  return {};
}

// Load configuration from package.json
const packageConfig = loadPackageConfig();

// Load configuration from .firebaserc
const firebaseRcConfig = loadFirebaseConfig();

/**
 * Firebase configuration 
 * 
 * @const {Object} firebaseConfig
 * @property {string} projectId - Firebase project ID
 * @property {string} site - Firebase hosting site name (defaults to project ID if not specified)
 * @property {string} buildDir - Build directory to deploy
 * @property {Object} options - Additional Firebase options
 * @property {boolean} options.useEmulator - Whether to use the Firebase emulator
 * @description Configuration settings for Firebase deployment. Values are determined from
 * environment variables first, then .firebaserc, then package.json configuration, and finally fallback defaults.
 * This prioritization allows for different values in different environments (local, CI, etc.).
 * @example
 * // Accessing Firebase configuration values
 * import { firebaseConfig } from './core/config.js';
 * 
 * console.log(`Project ID: ${firebaseConfig.projectId}`);
 * console.log(`Site: ${firebaseConfig.site}`);
 * console.log(`Build directory: ${firebaseConfig.buildDir}`);
 * 
 * if (firebaseConfig.options.useEmulator) {
 *   console.log('Using Firebase emulator for local testing');
 * }
 */
export const firebaseConfig = {
  // Firebase project ID - prioritize environment variables, then .firebaserc, then package.json
  projectId: process.env.FIREBASE_PROJECT_ID || firebaseRcConfig.projectId || packageConfig.projectId || 'your-firebase-project',
  
  // Firebase hosting site name (defaults to project ID if not specified)
  site: process.env.FIREBASE_SITE || packageConfig.site,
  
  // Hosting targets from .firebaserc (if available)
  targets: firebaseRcConfig.targets || {},
  
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
 * 
 * @const {Object} previewConfig
 * @property {string} prefix - Prefix for preview channel names
 * @property {number} expireDays - Number of days until preview expires
 * @property {number} keepCount - Number of preview channels to keep when cleaning up
 * @property {boolean} autoCleanup - Whether to delete older channels automatically
 * @description Configuration settings for Firebase preview channels. Defines naming
 * conventions, expiration policies, and cleanup behavior for preview deployments.
 * @example
 * // Accessing preview configuration values
 * import { previewConfig } from './core/config.js';
 * 
 * // Generate a preview channel name with the configured prefix
 * const prNumber = 123;
 * const channelName = `${previewConfig.prefix}${prNumber}`;
 * 
 * console.log(`Creating preview channel: ${channelName}`);
 * console.log(`Channel will expire in ${previewConfig.expireDays} days`);
 * 
 * if (previewConfig.autoCleanup) {
 *   console.log(`Keeping only the most recent ${previewConfig.keepCount} channels`);
 * }
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
 * 
 * @const {Object} buildConfig
 * @property {string} script - The build script to run (from package.json scripts)
 * @property {Object} env - Environment variables to inject during build
 * @description Configuration settings for the build process, including which script
 * to run and what environment variables to set during the build.
 * @example
 * // Using build configuration to execute a build
 * import { buildConfig } from './core/config.js';
 * import { runCommand } from './core/command-runner.js';
 * 
 * // Prepare environment variables for the build
 * const envVars = Object.entries(buildConfig.env)
 *   .map(([key, value]) => `${key}=${value}`)
 *   .join(' ');
 * 
 * // Run the build with the configured script and environment
 * const result = runCommand(`${envVars} npm run ${buildConfig.script}`);
 */
export const buildConfig = {
  // The build script to run (from package.json scripts)
  script: process.env.BUILD_SCRIPT || packageConfig.buildScript || 'build:all',
  
  // Environment variables to inject during build
  env: {
    NODE_ENV: 'development',
    REACT_APP_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
    ...(packageConfig.buildEnv || {})
  }
};

/**
 * Git/GitHub configuration
 * 
 * @const {Object} gitConfig
 * @property {boolean} addPrComments - Whether to add deployment comments to PRs
 * @property {string|null} prNumber - The current PR number (if available)
 * @property {string|null} repo - The GitHub repository owner/name
 * @description Configuration settings for Git and GitHub integrations, including
 * PR comment settings and repository information.
 * @example
 * // Using Git configuration to determine workflow behavior
 * import { gitConfig } from './core/config.js';
 * 
 * // Check if we should add PR comments after deployment
 * if (gitConfig.addPrComments && gitConfig.prNumber && gitConfig.repo) {
 *   console.log(`Will add deployment comments to PR #${gitConfig.prNumber}`);
 *   console.log(`Repository: ${gitConfig.repo}`);
 * } else {
 *   console.log('PR comments are disabled or information is missing');
 * }
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
 * 
 * @function getProjectPath
 * @param {string} relativePath - Path relative to project root
 * @returns {string} Full path to the file or directory
 * @description Resolves a relative path to an absolute path based on the project root.
 * Useful for consistently referencing files and directories regardless of where the
 * script is being executed from.
 * @example
 * // Get the path to the package.json file
 * const packageJsonPath = getProjectPath('package.json');
 * 
 * // Get the path to the build directory
 * const buildPath = getProjectPath(firebaseConfig.buildDir);
 * 
 * // Access a specific source file
 * const configFile = getProjectPath('src/config/firebase.js');
 */
export function getProjectPath(relativePath) {
  return path.join(rootDir, relativePath);
}

/**
 * Get the project root directory
 * 
 * @function getProjectRoot
 * @returns {string} Project root directory absolute path
 * @description Returns the absolute path to the project root directory.
 * This is useful when you need to reference the project root without
 * appending any additional path components.
 * @example
 * // Get the project root directory
 * const rootDirectory = getProjectRoot();
 * console.log(`Project root: ${rootDirectory}`);
 * 
 * // Check if a file exists in the project root
 * const firebaseRcExists = fs.existsSync(path.join(getProjectRoot(), '.firebaserc'));
 */
export function getProjectRoot() {
  return rootDir;
}

/**
 * Format configuration as string for logging
 * 
 * @function formatConfig
 * @returns {string} Formatted configuration as a JSON string
 * @description Creates a sanitized, formatted string representation of the current
 * configuration for logging purposes. Removes any sensitive information and formats
 * the configuration as indented JSON for readability.
 * @example
 * // Get a formatted representation of the current configuration
 * const configStr = formatConfig();
 * console.log('Current configuration:');
 * console.log(configStr);
 * 
 * // Write the configuration to a log file
 * fs.writeFileSync('deploy-config.log', formatConfig());
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
 * 
 * @function logConfig
 * @description Logs the current configuration to the console using the logger module.
 * This is useful at the start of a workflow to show what settings will be used.
 * @example
 * // Log the current configuration at the start of a deployment
 * import { logConfig } from './core/config.js';
 * 
 * console.log('Starting deployment with the following configuration:');
 * logConfig();
 */
export function logConfig() {
  logger.info('Current configuration:');
  logger.info(formatConfig());
}

/**
 * Get the Firebase configuration
 * 
 * @function getFirebaseConfig
 * @returns {Object} Firebase configuration object
 * @description Returns the Firebase configuration object. This is a convenience method
 * that's equivalent to directly accessing the firebaseConfig export.
 * @example
 * // Get Firebase configuration
 * const fbConfig = getFirebaseConfig();
 * console.log(`Project ID: ${fbConfig.projectId}`);
 */
export function getFirebaseConfig() {
  return firebaseConfig;
}

/**
 * Get the Preview configuration
 * 
 * @function getPreviewConfig
 * @returns {Object} Preview configuration object
 * @description Returns the preview configuration object. This is a convenience method
 * that's equivalent to directly accessing the previewConfig export.
 * @example
 * // Get preview configuration
 * const pvConfig = getPreviewConfig();
 * console.log(`Preview prefix: ${pvConfig.prefix}`);
 */
export function getPreviewConfig() {
  return previewConfig;
}

/**
 * Get the Build configuration
 * 
 * @function getBuildConfig
 * @returns {Object} Build configuration object
 * @description Returns the build configuration object. This is a convenience method
 * that's equivalent to directly accessing the buildConfig export.
 * @example
 * // Get build configuration
 * const bldConfig = getBuildConfig();
 * console.log(`Build script: ${bldConfig.script}`);
 */
export function getBuildConfig() {
  return buildConfig;
}

/**
 * Check if the configuration has been loaded
 * 
 * @function isConfigLoaded
 * @returns {boolean} Whether the configuration is loaded
 * @description Checks if the configuration has been loaded. Always returns true
 * because configuration is loaded immediately on import. This function exists
 * primarily for consistency with other modules that may require initialization.
 * @example
 * // Check if configuration is loaded before using it
 * if (isConfigLoaded()) {
 *   // Safe to use configuration values
 *   console.log(`Project ID: ${firebaseConfig.projectId}`);
 * } else {
 *   console.error('Configuration not loaded');
 * }
 */
export function isConfigLoaded() {
  return true; // Configuration is loaded immediately on import
}

export default {
  firebaseConfig,
  previewConfig,
  buildConfig,
  gitConfig,
  getProjectPath,
  getProjectRoot,
  formatConfig,
  logConfig,
  getFirebaseConfig,
  getPreviewConfig,
  getBuildConfig,
  isConfigLoaded
}; 