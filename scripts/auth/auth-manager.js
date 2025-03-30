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

import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';
import { progressTracker } from '../core/progress-tracker.js';
import { checkFirebaseAuth } from './firebase-auth.js';
import gitAuth from './git-auth.js';
import { join, dirname, resolve } from 'path';
import { AuthenticationError } from '../core/error-handler.js';
import { fileURLToPath } from 'url';
import { utils } from '../core/utils.js';
import { performanceMonitor } from '../core/performance-monitor.js';

/* global process */

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../..');

// Constants for auth token management
const AUTH_CACHE_TTL = 30 * 60 * 1000; // 30 minutes in milliseconds
const AUTH_TOKEN_FILE = join(rootDir, '.auth-tokens.json');
const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes before expiry
const MAX_REFRESH_ATTEMPTS = 3;
const REFRESH_COOLDOWN = 60 * 1000; // 1 minute

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
    if (utils.fileExists(AUTH_TOKEN_FILE)) {
      utils.writeJsonFile(AUTH_TOKEN_FILE, {});
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
 * @param {Object} [options.progressTracker] - Progress tracker instance for step tracking
 * @param {boolean} [options.isCI=false] - Whether running in CI environment
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
    errorTracker = null,
    progressTracker = null,
    isCI = false
  } = options;
  
  // Start progress tracking if available
  if (progressTracker) {
    progressTracker.startStep('Verifying Authentication');
  }
  
  // Check if we can use cached results
  if (useCache && _isCacheValid()) {
    logger.debug('Using cached authentication results');
    
    // Only return cached results if all required services were previously verified
    const cachedFirebase = _authCache.verifiedServices.firebase || false;
    const cachedGit = _authCache.verifiedServices.gitAuth || false;
    
    if ((!requireFirebase || cachedFirebase) && (!requireGit || cachedGit)) {
      if (progressTracker) {
        progressTracker.completeStep(true, 'Using cached authentication');
      }
      return _authCache;
    }
  }
  
  const result = {
    success: true,
    services: {},
    errors: [],
    warnings: [],
    timestamp: new Date().toISOString()
  };
  
  try {
    // Verify Firebase authentication if required
    if (requireFirebase) {
      const firebaseResult = await _verifyFirebaseAuth(isCI);
      result.services.firebase = firebaseResult;
      
      if (!firebaseResult.authenticated) {
        result.success = false;
        result.errors.push(`Firebase: ${firebaseResult.error || 'Not authenticated'}`);
        
        // Add helpful recovery message
        if (!isCI) {
          result.warnings.push('To authenticate with Firebase, run: firebase login');
        }
      }
    }
    
    // Verify Git authentication if required
    if (requireGit) {
      const gitResult = await _verifyGitAuth(isCI);
      result.services.gitAuth = gitResult;
      
      if (!gitResult.authenticated) {
        result.success = false;
        result.errors.push(`Git: ${gitResult.error || 'Not authenticated'}`);
        
        // Add helpful recovery message
        if (!isCI) {
          result.warnings.push('To configure Git, ensure your name and email are set:');
          result.warnings.push('  git config --global user.name "Your Name"');
          result.warnings.push('  git config --global user.email "your.email@example.com"');
        }
      }
    }
    
    // Update cache if successful
    if (result.success) {
      _authCache.firebase = result.services.firebase;
      _authCache.gitAuth = result.services.gitAuth;
      _authCache.timestamp = result.timestamp;
      _authCache.verifiedServices = {
        firebase: result.services.firebase?.authenticated || false,
        gitAuth: result.services.gitAuth?.authenticated || false
      };
    }
    
    // Update progress tracker
    if (progressTracker) {
      if (result.success) {
        progressTracker.completeStep(true, 'Authentication verified successfully');
      } else {
        progressTracker.completeStep(false, 'Authentication checks failed');
      }
    }
    
    // Track errors if error tracker is provided
    if (errorTracker && !result.success) {
      result.errors.forEach(error => {
        errorTracker.addError(new AuthenticationError(error));
      });
    }
    
    return result;
    
  } catch (error) {
    const errorMessage = `Authentication verification failed: ${error.message}`;
    logger.error(errorMessage);
    
    if (progressTracker) {
      progressTracker.completeStep(false, 'Authentication verification failed');
    }
    
    if (errorTracker) {
      errorTracker.addError(new AuthenticationError(errorMessage));
    }
    
    throw error;
  }
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
 * Loads authentication tokens from the cache file
 * 
 * @private
 * @function _loadAuthTokens
 * @returns {Object|null} The cached authentication tokens or null if not found
 */
function _loadAuthTokens() {
  try {
    if (utils.fileExists(AUTH_TOKEN_FILE)) {
      const tokens = utils.readJsonFile(AUTH_TOKEN_FILE);
      return tokens;
    }
  } catch (error) {
    logger.debug(`Failed to load auth tokens: ${error.message}`);
  }
  return null;
}

/**
 * Saves authentication tokens to the cache file
 * 
 * @private
 * @function _saveAuthTokens
 * @param {Object} tokens - The authentication tokens to save
 */
function _saveAuthTokens(tokens) {
  try {
    utils.writeJsonFile(AUTH_TOKEN_FILE, tokens);
  } catch (error) {
    logger.debug(`Failed to save auth tokens: ${error.message}`);
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
    if (!utils.fileExists(AUTH_TOKEN_FILE)) {
      return null;
    }
    
    const tokenData = utils.readJsonFile(AUTH_TOKEN_FILE);
    
    // Validate token structure
    if (!tokenData || typeof tokenData !== 'object') {
      logger.debug('Invalid token format in saved file');
      return null;
    }
    
    // Check token expiration if available
    if (tokenData.expiry && new Date(tokenData.expiry) < new Date()) {
      logger.debug('Saved tokens have expired');
      return null;
    }
    
    logger.debug('Authentication tokens loaded successfully');
    return tokenData;
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
 * Verify Firebase authentication
 * @private
 * @async
 * @function _verifyFirebaseAuth
 * @param {boolean} isCI - Whether running in CI environment
 * @returns {Promise<Object>} Firebase authentication result
 */
async function _verifyFirebaseAuth(isCI) {
  try {
    // Check for CI-specific Firebase auth first
    if (isCI && process.env.FIREBASE_TOKEN) {
      logger.debug('Using CI Firebase token authentication');
      return await checkFirebaseAuth();
    }
    
    // Regular Firebase auth check
    return await checkFirebaseAuth();
  } catch (error) {
    return {
      authenticated: false,
      error: error.message
    };
  }
}

/**
 * Verify Git authentication
 * @private
 * @async
 * @function _verifyGitAuth
 * @param {boolean} isCI - Whether running in CI environment
 * @returns {Promise<Object>} Git authentication result
 */
async function _verifyGitAuth(isCI) {
  try {
    const gitResult = await gitAuth.checkGitConfig();
    
    if (!gitResult.configured) {
      if (isCI) {
        // In CI, try to use environment variables
        const gitToken = process.env.GIT_TOKEN;
        if (!gitToken) {
          return {
            authenticated: false,
            error: 'Git token not found in CI environment'
          };
        }
        return {
          authenticated: true,
          configured: true,
          usingCI: true
        };
      }
      
      return {
        authenticated: false,
        error: 'Git not properly configured'
      };
    }
    
    return {
      authenticated: true,
      ...gitResult
    };
  } catch (error) {
    return {
      authenticated: false,
      error: error.message
    };
  }
}

export class AuthManager {
  constructor() {
    // Token management
    this.tokenRefreshTimes = new Map();
    this.tokenExpiryTimes = new Map();
    this.refreshAttempts = new Map();
    this.lastRefreshAttempt = new Map();
    
    // Service state
    this.verifiedServices = new Map();
    this.authCache = new Map();
    this.cacheTimestamp = null;
    
    // Environment
    this.isCI = this.detectCIEnvironment();
    
    // Initialize
    this.initialize();
  }

  /**
   * Initialize the auth manager
   * @private
   */
  async initialize() {
    try {
      // Load cached tokens if available
      const tokens = this.loadAuthTokens();
      if (tokens) {
        this.restoreFromTokens(tokens);
      }
      
      // Verify initial state
      await this.verifyInitialState();
    } catch (error) {
      logger.warn(`Auth manager initialization warning: ${error.message}`);
    }
  }

  /**
   * Detect if running in CI environment
   * @private
   * @returns {boolean} Whether running in CI
   */
  detectCIEnvironment() {
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
   * Verify initial authentication state
   * @private
   * @returns {Promise<void>}
   */
  async verifyInitialState() {
    if (this.isCI) {
      await this.handleCIAuth();
    } else {
      // Check for existing Firebase and Git auth
      await this.verifyAuth({ service: 'firebase', requireAuth: false });
      await this.verifyAuth({ service: 'git', requireAuth: false });
    }
  }

  /**
   * Check if token needs refresh
   * @param {string} service - Service name
   * @returns {boolean} Whether token needs refresh
   */
  needsTokenRefresh(service) {
    const expiryTime = this.tokenExpiryTimes.get(service);
    if (!expiryTime) return true;
    
    // Check if we're within the refresh threshold
    const needsRefresh = Date.now() > (expiryTime - TOKEN_REFRESH_THRESHOLD);
    
    // Check if we've exceeded max refresh attempts
    const attempts = this.refreshAttempts.get(service) || 0;
    if (attempts >= MAX_REFRESH_ATTEMPTS) {
      const lastAttempt = this.lastRefreshAttempt.get(service) || 0;
      if (Date.now() - lastAttempt < REFRESH_COOLDOWN) {
        return false;
      }
    }
    
    return needsRefresh;
  }

  /**
   * Refresh authentication token
   * @param {string} service - Service name
   * @returns {Promise<boolean>} Success status
   */
  async refreshToken(service) {
    const startTime = Date.now();
    
    try {
      // Track refresh attempt
      const attempts = (this.refreshAttempts.get(service) || 0) + 1;
      this.refreshAttempts.set(service, attempts);
      this.lastRefreshAttempt.set(service, startTime);

      if (this.isCI) {
        return await this.handleCITokenRefresh(service);
      }

      // For local development, use CLI refresh
      const success = await this.handleLocalTokenRefresh(service);
      
      // Track performance
      const duration = Date.now() - startTime;
      performanceMonitor.trackStepPerformance(`auth-refresh-${service}`, duration);
      
      return success;
    } catch (error) {
      logger.error(`Failed to refresh ${service} token:`, error);
      return false;
    }
  }

  /**
   * Handle CI environment token refresh
   * @private
   * @param {string} service - Service name
   * @returns {Promise<boolean>} Success status
   */
  async handleCITokenRefresh(service) {
    const token = process.env[`${service.toUpperCase()}_TOKEN`];
    if (!token) {
      throw new Error(`No ${service} token found in CI environment`);
    }
    
    // Validate token format
    if (!this.validateTokenFormat(token, service)) {
      throw new Error(`Invalid ${service} token format`);
    }
    
    this.tokenRefreshTimes.set(service, Date.now());
    this.tokenExpiryTimes.set(service, Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    return true;
  }

  /**
   * Handle local development token refresh
   * @private
   * @param {string} service - Service name
   * @returns {Promise<boolean>} Success status
   */
  async handleLocalTokenRefresh(service) {
    if (service === 'firebase') {
      await commandRunner.runCommand('firebase login:reauth');
    } else if (service === 'git') {
      await commandRunner.runCommand('git config --global credential.helper store');
    }

    this.tokenRefreshTimes.set(service, Date.now());
    this.tokenExpiryTimes.set(service, Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    return true;
  }

  /**
   * Validate token format
   * @private
   * @param {string} token - Token to validate
   * @param {string} service - Service name
   * @returns {boolean} Whether token format is valid
   */
  validateTokenFormat(token, service) {
    if (!token || typeof token !== 'string') return false;
    
    switch (service) {
      case 'firebase':
        // Firebase tokens are typically JWT format
        return /^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/.test(token);
      case 'git':
        // Git tokens are typically alphanumeric with possible hyphens
        return /^[A-Za-z0-9-]+$/.test(token);
      default:
        return false;
    }
  }

  /**
   * Verify authentication with automatic refresh
   * @param {Object} options - Verification options
   * @param {string} options.service - Service to verify
   * @param {boolean} [options.requireAuth=true] - Whether to throw on failure
   * @returns {Promise<boolean>} Success status
   */
  async verifyAuth(options = {}) {
    const { service, requireAuth = true } = options;
    const startTime = Date.now();
    
    try {
      // Check if token needs refresh
      if (this.needsTokenRefresh(service)) {
        logger.info(`Refreshing ${service} authentication...`);
        const refreshSuccess = await this.refreshToken(service);
        if (!refreshSuccess) {
          throw new Error(`Failed to refresh ${service} token`);
        }
      }

      // Verify authentication
      const result = await this.verifyServiceAuth(service);
      
      // Track performance
      const duration = Date.now() - startTime;
      performanceMonitor.trackStepPerformance(`auth-verify-${service}`, duration);
      
      return result;
    } catch (error) {
      if (requireAuth) {
        throw new AuthenticationError(`Authentication failed for ${service}`, error);
      }
      return false;
    }
  }

  /**
   * Verify service-specific authentication
   * @private
   * @param {string} service - Service name
   * @returns {Promise<boolean>} Success status
   */
  async verifyServiceAuth(service) {
    switch (service) {
      case 'firebase':
        return await this.verifyFirebaseAuth();
      case 'git':
        return await this.verifyGitAuth();
      default:
        throw new Error(`Unsupported service: ${service}`);
    }
  }

  /**
   * Handle CI environment authentication
   * @returns {Promise<boolean>} Success status
   */
  async handleCIAuth() {
    if (!this.isCI) return true;

    const requiredTokens = ['FIREBASE_TOKEN', 'GITHUB_TOKEN'];
    const missingTokens = requiredTokens.filter(token => !process.env[token]);

    if (missingTokens.length > 0) {
      throw new AuthenticationError(
        `Missing required tokens in CI environment: ${missingTokens.join(', ')}`
      );
    }

    // Validate all required tokens
    for (const token of requiredTokens) {
      const service = token.split('_')[0].toLowerCase();
      if (!this.validateTokenFormat(process.env[token], service)) {
        throw new AuthenticationError(`Invalid ${service} token format in CI environment`);
      }
    }

    return true;
  }

  /**
   * Save authentication tokens
   * @private
   * @returns {boolean} Success status
   */
  saveAuthTokens() {
    try {
      const tokens = {
        refreshTimes: Object.fromEntries(this.tokenRefreshTimes),
        expiryTimes: Object.fromEntries(this.tokenExpiryTimes),
        verifiedServices: Object.fromEntries(this.verifiedServices),
        timestamp: Date.now()
      };
      
      utils.writeJsonFile(AUTH_TOKEN_FILE, tokens);
      return true;
    } catch (error) {
      logger.error(`Failed to save auth tokens: ${error.message}`);
      return false;
    }
  }

  /**
   * Load authentication tokens
   * @private
   * @returns {Object|null} Saved tokens or null
   */
  loadAuthTokens() {
    try {
      if (!utils.fileExists(AUTH_TOKEN_FILE)) {
        return null;
      }
      
      return utils.readJsonFile(AUTH_TOKEN_FILE);
    } catch (error) {
      logger.warn(`Failed to load auth tokens: ${error.message}`);
      return null;
    }
  }

  /**
   * Restore state from saved tokens
   * @private
   * @param {Object} tokens - Saved tokens
   */
  restoreFromTokens(tokens) {
    if (!tokens || !tokens.timestamp) return;
    
    // Check if tokens are expired
    if (Date.now() - tokens.timestamp > AUTH_CACHE_TTL) {
      return;
    }
    
    // Restore state
    this.tokenRefreshTimes = new Map(Object.entries(tokens.refreshTimes || {}));
    this.tokenExpiryTimes = new Map(Object.entries(tokens.expiryTimes || {}));
    this.verifiedServices = new Map(Object.entries(tokens.verifiedServices || {}));
    this.cacheTimestamp = tokens.timestamp;
  }

  /**
   * Clear authentication state
   */
  clearAuth() {
    this.tokenRefreshTimes.clear();
    this.tokenExpiryTimes.clear();
    this.refreshAttempts.clear();
    this.lastRefreshAttempt.clear();
    this.verifiedServices.clear();
    this.authCache.clear();
    this.cacheTimestamp = null;
    
    // Remove token file if it exists
    if (utils.fileExists(AUTH_TOKEN_FILE)) {
      utils.writeJsonFile(AUTH_TOKEN_FILE, {});
    }
  }

  /**
   * Get authentication status
   * @returns {Object} Authentication status
   */
  getStatus() {
    return {
      isCI: this.isCI,
      verifiedServices: Object.fromEntries(this.verifiedServices),
      tokenStatus: {
        firebase: {
          needsRefresh: this.needsTokenRefresh('firebase'),
          lastRefresh: this.tokenRefreshTimes.get('firebase'),
          expiry: this.tokenExpiryTimes.get('firebase')
        },
        git: {
          needsRefresh: this.needsTokenRefresh('git'),
          lastRefresh: this.tokenRefreshTimes.get('git'),
          expiry: this.tokenExpiryTimes.get('git')
        }
      }
    };
  }
}

export const authManager = new AuthManager(); 