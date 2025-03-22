#!/usr/bin/env node

/**
 * Authentication Manager Module
 * 
 * Provides centralized authentication management for various services
 * used in the deployment workflow.
 * 
 * Features:
 * - Combined Firebase and Git authentication verification
 * - Authentication status reporting
 * - Helper functions for common authentication tasks
 * - Detailed error handling and recovery suggestions
 * - Support for CI environments
 * - Token validation and refresh
 * - Result caching for performance optimization
 * - Integration with central error tracking system
 * 
 * @module auth/auth-manager
 * @example
 * // Basic usage example
 * import { verifyAllAuth } from './auth/auth-manager.js';
 * import { errorTracker } from './core/error-handler.js';
 * 
 * async function checkAuthentication() {
 *   const authResult = await verifyAllAuth({ 
 *     errorTracker 
 *   });
 *   
 *   if (authResult.success) {
 *     console.log('All authentication checks passed');
 *   } else {
 *     console.error('Authentication failed:', authResult.errors);
 *     process.exit(1);
 *   }
 * }
 */

import * as firebaseAuth from './firebase-auth.js';
import * as gitAuth from './git-auth.js';
import * as logger from '../core/logger.js';
import { AuthenticationError } from '../core/error-handler.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

/* global process */

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

// Constants for auth token management
const AUTH_CACHE_TTL = 30 * 60 * 1000; // 30 minutes in milliseconds
const AUTH_TOKEN_FILE = path.join(rootDir, '.auth-tokens.json');

/**
 * Authentication result object with detailed status information
 * 
 * @typedef {Object} AuthResult
 * @property {boolean} success - Overall authentication success status
 * @property {Object} services - Status of individual authentication services
 * @property {Object} services.firebase - Firebase authentication status details
 * @property {boolean} services.firebase.authenticated - Whether Firebase authentication succeeded
 * @property {string} [services.firebase.error] - Error message if Firebase authentication failed
 * @property {boolean} [services.firebase.skipped] - Whether Firebase authentication was skipped
 * @property {Object} services.git - Git authentication status details
 * @property {boolean} services.git.authenticated - Whether Git authentication succeeded
 * @property {string} [services.git.error] - Error message if Git authentication failed
 * @property {boolean} [services.git.skipped] - Whether Git authentication was skipped
 * @property {string[]} errors - List of authentication error messages
 * @property {string[]} warnings - List of authentication warnings
 * @property {string} timestamp - ISO timestamp when authentication was verified
 * @property {boolean} [fromCache] - Whether the result came from cache
 */

/**
 * Authentication cache to prevent repeated checks in the same session
 * @private
 */
const _authCache = {
  firebase: null,
  gitAuth: null,
  timestamp: null,
  verifiedServices: {}
};

/**
 * Checks if the cached authentication is still valid
 * 
 * @private
 * @function _isCacheValid
 * @returns {boolean} True if the cache is valid, false otherwise
 * @description Verifies if the current authentication cache is still valid based on
 * the timestamp and configured time-to-live (TTL). The default TTL is 30 minutes.
 */
function _isCacheValid() {
  if (!_authCache.timestamp) {
    return false;
  }
  
  const now = Date.now();
  const cacheTime = new Date(_authCache.timestamp).getTime();
  
  // Cache is valid for 30 minutes
  return (now - cacheTime) < AUTH_CACHE_TTL;
}

/**
 * Resets the authentication cache, forcing re-authentication
 * 
 * @function resetAuthCache
 * @returns {void}
 * @description Clears all cached authentication information, forcing a complete
 * re-authentication on the next verification attempt. Also removes any saved
 * authentication tokens from the filesystem.
 * @example
 * // After changing credentials or when authentication issues occur
 * import { resetAuthCache } from './auth/auth-manager.js';
 * 
 * // Clear all cached authentication data
 * resetAuthCache();
 * 
 * // Now authentication will be checked from scratch
 * const freshAuthResult = await verifyAllAuth();
 */
export function resetAuthCache() {
  logger.debug('Resetting authentication cache');
  
  _authCache.firebase = null;
  _authCache.gitAuth = null;
  _authCache.timestamp = null;
  _authCache.verifiedServices = {};
  
  // Also remove any cached tokens
  try {
    if (fs.existsSync(AUTH_TOKEN_FILE)) {
      fs.unlinkSync(AUTH_TOKEN_FILE);
      logger.debug('Removed cached authentication tokens');
    }
  } catch (error) {
    logger.debug(`Failed to remove cached tokens: ${error.message}`);
  }
}

/**
 * Verifies all required authentication services
 * 
 * @async
 * @function verifyAllAuth
 * @param {Object} [options={}] - Authentication verification options
 * @param {boolean} [options.useCache=true] - Whether to use cached authentication results
 * @param {boolean} [options.requireFirebase=true] - Whether Firebase authentication is required
 * @param {boolean} [options.requireGit=true] - Whether Git authentication is required
 * @param {Object} [options.errorTracker] - Error tracker instance for recording auth errors
 * @returns {Promise<AuthResult>} - The authentication result with detailed status information
 * @description Performs comprehensive authentication checks for all required services
 * (Firebase and Git by default). This is the main entry point for authentication in the
 * workflow. It caches results to avoid repeated checks, detects CI environments, and
 * provides detailed error information with recovery suggestions.
 * @example
 * // Full example with all options
 * import { verifyAllAuth } from './auth/auth-manager.js';
 * import { errorTracker } from './core/error-handler.js';
 * 
 * async function deployWorkflow() {
 *   const authResult = await verifyAllAuth({
 *     useCache: true,               // Use cached results if available
 *     requireFirebase: true,        // Firebase auth is required 
 *     requireGit: true,             // Git auth is required
 *     errorTracker                  // Track errors in central error system
 *   });
 *   
 *   if (!authResult.success) {
 *     console.error('Authentication failed:');
 *     for (const error of authResult.errors) {
 *       console.error(`- ${error}`);
 *     }
 *     process.exit(1);
 *   }
 *   
 *   // Continue with deployment workflow...
 * }
 */
export async function verifyAllAuth(options = {}) {
  const {
    useCache = true,
    requireFirebase = true,
    requireGit = true,
    errorTracker = null
  } = options;
  
  // Check if we can use cached results
  if (useCache && _isCacheValid()) {
    logger.debug('Using cached authentication results');
    
    // Only return cached results if all required services were previously verified
    const cachedFirebase = _authCache.verifiedServices.firebase || false;
    const cachedGit = _authCache.verifiedServices.gitAuth || false;
    
    if ((!requireFirebase || cachedFirebase) && (!requireGit || cachedGit)) {
      return {
        success: true,
        services: {
          firebase: _authCache.firebase,
          gitAuth: _authCache.gitAuth
        },
        errors: [],
        warnings: [],
        timestamp: _authCache.timestamp,
        fromCache: true
      };
    }
  }
  
  logger.debug('Verifying authentication services');
  
  const result = {
    success: true,
    services: {},
    errors: [],
    warnings: [],
    timestamp: new Date().toISOString(),
    fromCache: false
  };
  
  let firebaseDone = false;
  let gitDone = false;
  
  // Determine if we're running in a CI environment
  const isCI = isRunningInCI();
  if (isCI) {
    logger.debug('Running in CI environment');
    result.warnings.push('Running in CI environment, modified authentication will be used');
  }
  
  // Check Firebase authentication if required
  if (requireFirebase) {
    try {
      // Check for CI-specific Firebase auth first
      let firebaseResult;
      
      if (isCI && process.env.FIREBASE_TOKEN) {
        logger.debug('Using CI Firebase token authentication');
        firebaseResult = await firebaseAuth.verifyTokenAuth(process.env.FIREBASE_TOKEN);
      } else {
        firebaseResult = await firebaseAuth.verifyAuth();
      }
      
      result.services.firebase = firebaseResult;
      _authCache.firebase = firebaseResult;
      _authCache.verifiedServices.firebase = firebaseResult.authenticated;
      
      if (!firebaseResult.authenticated) {
        result.success = false;
        
        // Create a detailed error message with recovery suggestions
        const errorMsg = firebaseResult.error || 'Not authenticated with Firebase';
        const suggestion = isCI
          ? 'Ensure FIREBASE_TOKEN environment variable is set correctly in CI'
          : 'Run "firebase login" to authenticate with Firebase';
        
        const authError = new AuthenticationError(
          errorMsg,
          'firebase',
          null,
          suggestion
        );
        
        if (errorTracker) {
          errorTracker.addError(authError);
        }
        
        result.errors.push(`Firebase: ${errorMsg} - ${suggestion}`);
      }
      
      firebaseDone = true;
    } catch (error) {
      result.success = false;
      
      const authError = new AuthenticationError(
        `Firebase authentication check failed: ${error.message}`,
        'firebase',
        error,
        'Check Firebase CLI installation and network connectivity'
      );
      
      if (errorTracker) {
        errorTracker.addError(authError);
      }
      
      result.errors.push(`Firebase: ${error.message}`);
      
      result.services.firebase = {
        authenticated: false,
        error: error.message
      };
    }
  } else {
    logger.debug('Firebase authentication not required, skipping');
    result.services.firebase = { authenticated: true, skipped: true };
    firebaseDone = true;
  }
  
  // Check Git authentication if required
  if (requireGit) {
    try {
      const gitResult = await gitAuth.checkGitConfig();
      
      result.services.gitAuth = gitResult;
      _authCache.gitAuth = gitResult;
      _authCache.verifiedServices.gitAuth = gitResult.configured;
      
      if (!gitResult.configured) {
        result.success = false;
        
        // Create a detailed error message with recovery suggestions
        const errorMsg = 'Git not properly configured';
        const suggestion = 'Configure Git with: git config --global user.name "Your Name" && git config --global user.email "your.email@example.com"';
        
        const authError = new AuthenticationError(
          errorMsg,
          'git',
          null,
          suggestion
        );
        
        if (errorTracker) {
          errorTracker.addError(authError);
        }
        
        result.errors.push(`Git: ${errorMsg} - ${suggestion}`);
      }
      
      gitDone = true;
    } catch (error) {
      result.success = false;
      
      const authError = new AuthenticationError(
        `Git authentication check failed: ${error.message}`,
        'git',
        error,
        'Ensure Git is installed and properly configured'
      );
      
      if (errorTracker) {
        errorTracker.addError(authError);
      }
      
      result.errors.push(`Git: ${error.message}`);
      
      result.services.gitAuth = {
        authenticated: false,
        error: error.message
      };
    }
  } else {
    logger.debug('Git authentication not required, skipping');
    result.services.gitAuth = { authenticated: true, skipped: true };
    gitDone = true;
  }
  
  // Update the cache if all checks are done
  if (firebaseDone && gitDone) {
    _authCache.timestamp = result.timestamp;
  }
  
  // Log appropriate messages based on the result
  if (result.success) {
    logger.debug('All authentication checks passed');
  } else {
    logger.error('Some authentication checks failed:');
    for (const error of result.errors) {
      logger.error(`- ${error}`);
    }
    
    for (const warning of result.warnings) {
      logger.warning(`- ${warning}`);
    }
  }
  
  return result;
}

/**
 * Determines if the current environment is a CI environment
 * 
 * @function isRunningInCI
 * @returns {boolean} True if running in a CI environment, false otherwise
 * @description Checks for the presence of common environment variables set by
 * CI systems to determine if the code is running in a continuous integration
 * environment. Supports detection of GitHub Actions, Travis CI, CircleCI,
 * Jenkins, GitLab CI, and Bitbucket Pipelines.
 * @example
 * import { isRunningInCI } from './auth/auth-manager.js';
 * 
 * if (isRunningInCI()) {
 *   console.log('Running in a CI environment, adjusting authentication...');
 *   // Use environment variables or tokens instead of interactive login
 * } else {
 *   console.log('Running locally, interactive authentication possible');
 * }
 */
export function isRunningInCI() {
  // Check for common CI environment variables
  const ciEnvironmentVars = [
    'CI',
    'GITHUB_ACTIONS',
    'TRAVIS',
    'CIRCLECI',
    'JENKINS_URL',
    'GITLAB_CI',
    'BITBUCKET_BUILD_NUMBER'
  ];
  
  for (const envVar of ciEnvironmentVars) {
    if (process.env[envVar]) {
      return true;
    }
  }
  
  return false;
}

/**
 * Saves authentication tokens to a secure file
 * 
 * @function _saveAuthTokens
 * @param {Object} tokens - The authentication tokens to save
 * @returns {boolean} True if tokens were successfully saved
 * @description Securely saves authentication tokens to a file with restricted
 * permissions. The file is readable only by the owner to protect sensitive
 * token information. This is primarily used internally for token persistence.
 * @example
 * // Internal usage example
 * const tokens = {
 *   firebase: 'firebase-token-value',
 *   git: 'git-token-value',
 *   expiry: new Date(Date.now() + 3600000).toISOString() // 1 hour from now
 * };
 * 
 * if (_saveAuthTokens(tokens)) {
 *   console.log('Tokens saved successfully');
 * }
 */
export function _saveAuthTokens(tokens) {
  try {
    const tokenData = JSON.stringify(tokens, null, 2);
    
    // Create a file with restricted permissions (only owner can read/write)
    fs.writeFileSync(AUTH_TOKEN_FILE, tokenData, {
      encoding: 'utf8',
      mode: 0o600 // Only owner can read/write
    });
    
    logger.debug('Authentication tokens saved successfully');
    return true;
  } catch (error) {
    logger.debug(`Failed to save authentication tokens: ${error.message}`);
    return false;
  }
}

/**
 * Retrieves saved authentication tokens
 * 
 * @function _getAuthTokens
 * @returns {Object|null} The saved tokens or null if no tokens found or expired
 * @description Loads authentication tokens from the secure token file. Validates
 * the token format and checks for expiration. Returns null if the tokens are
 * invalid, expired, or the file doesn't exist.
 * @example
 * // Internal usage example
 * const tokens = _getAuthTokens();
 * 
 * if (tokens) {
 *   console.log('Using saved tokens from file');
 *   // Use tokens for authentication
 * } else {
 *   console.log('No valid tokens found, need to authenticate');
 *   // Proceed with full authentication
 * }
 */
export function _getAuthTokens() {
  try {
    if (!fs.existsSync(AUTH_TOKEN_FILE)) {
      return null;
    }
    
    const tokenData = fs.readFileSync(AUTH_TOKEN_FILE, 'utf8');
    const tokens = JSON.parse(tokenData);
    
    // Validate token structure
    if (!tokens || typeof tokens !== 'object') {
      logger.debug('Invalid token format in saved file');
      return null;
    }
    
    // Check token expiration if available
    if (tokens.expiry && new Date(tokens.expiry) < new Date()) {
      logger.debug('Saved tokens have expired');
      return null;
    }
    
    logger.debug('Authentication tokens loaded successfully');
    return tokens;
  } catch (error) {
    logger.debug(`Failed to load authentication tokens: ${error.message}`);
    return null;
  }
}

/**
 * Determines which authentication services are required based on config
 * 
 * @function getRequiredAuth
 * @param {Object} config - Configuration object from the workflow
 * @param {Object} [config.firebase] - Firebase configuration settings
 * @param {Object} [config.git] - Git configuration settings
 * @param {boolean} [config.git.addPrComments] - Whether PR comments are enabled
 * @param {boolean} [config.git.branchCheck] - Whether branch validation is enabled
 * @param {boolean} [config.git.commitCheck] - Whether commit validation is enabled
 * @returns {Object} Object indicating which services are required:
 *   - firebase {boolean}: Whether Firebase authentication is required
 *   - git {boolean}: Whether Git authentication is required
 * @description Analyzes the workflow configuration to determine which authentication
 * services are necessary. This helps optimize the authentication process by only
 * checking what's actually needed for the current workflow configuration.
 * @example
 * import { getRequiredAuth } from './auth/auth-manager.js';
 * 
 * const config = {
 *   firebase: { projectId: 'my-project' },
 *   git: { addPrComments: true, branchCheck: false }
 * };
 * 
 * const requiredAuth = getRequiredAuth(config);
 * console.log(requiredAuth);
 * // Output: { firebase: true, git: true }
 * 
 * // Use this to only check required services
 * const authResult = await verifyAllAuth({
 *   requireFirebase: requiredAuth.firebase,
 *   requireGit: requiredAuth.git
 * });
 */
export function getRequiredAuth(config) {
  const required = {
    firebase: false,
    git: false
  };
  
  // Check if Firebase is configured and required
  if (config && config.firebase) {
    required.firebase = true;
  }
  
  // Check if Git features are configured and required
  if (config && config.git) {
    // If any Git features are enabled, require Git auth
    const gitFeatures = ['addPrComments', 'branchCheck', 'commitCheck'];
    for (const feature of gitFeatures) {
      if (config.git[feature]) {
        required.git = true;
        break;
      }
    }
  }
  
  return required;
}

/**
 * Refreshes an existing authentication if it's expired or invalid
 * 
 * @async
 * @function refreshAuth
 * @param {Object} [options={}] - Refresh options
 * @param {string} [options.service] - The service to refresh ('firebase', 'git', or undefined for all)
 * @param {Object} [options.errorTracker] - Error tracker instance
 * @returns {Promise<AuthResult>} Result of the refresh operation
 * @description Forces a refresh of authentication for one or all services. Useful when
 * you encounter authentication errors during workflow execution and need to recover
 * without restarting the entire workflow. Clears the cache for the specified service(s)
 * and performs a new authentication check.
 * @example
 * import { refreshAuth } from './auth/auth-manager.js';
 * import { errorTracker } from './core/error-handler.js';
 * 
 * // When Firebase authentication fails during workflow
 * try {
 *   await deployToFirebase();
 * } catch (error) {
 *   if (error.message.includes('authentication')) {
 *     console.log('Trying to refresh Firebase authentication...');
 *     const refreshResult = await refreshAuth({
 *       service: 'firebase',
 *       errorTracker
 *     });
 *     
 *     if (refreshResult.success) {
 *       console.log('Authentication refreshed, retrying deployment...');
 *       await deployToFirebase();
 *     }
 *   }
 * }
 */
export async function refreshAuth(options = {}) {
  const { service, errorTracker } = options;
  
  // Reset the cache for the specified service or all services
  if (service) {
    if (service === 'firebase' || service === 'git') {
      _authCache[service] = null;
      _authCache.verifiedServices[service] = false;
    }
  } else {
    resetAuthCache();
  }
  
  // Verify auth again
  return verifyAllAuth({
    useCache: false,
    requireFirebase: service ? service === 'firebase' : true,
    requireGit: service ? service === 'git' : true,
    errorTracker
  });
}

/**
 * Default export with all authentication management functions
 * 
 * @export {Object} default
 * @property {Function} verifyAllAuth - Verifies all required authentication services
 * @property {Function} isRunningInCI - Determines if running in a CI environment
 * @property {Function} resetAuthCache - Resets the authentication cache
 * @property {Function} getRequiredAuth - Determines which authentication services are required
 * @property {Function} refreshAuth - Refreshes an existing authentication
 */
export default {
  verifyAllAuth,
  isRunningInCI,
  resetAuthCache,
  getRequiredAuth,
  refreshAuth
}; 