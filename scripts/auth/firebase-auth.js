#!/usr/bin/env node

/**
 * Firebase Authentication Module
 * 
 * Provides utilities for checking and verifying Firebase CLI authentication.
 * This module ensures that the user has valid authentication with Firebase
 * before attempting operations that require authentication, such as deployments.
 * 
 * Features:
 * - Check Firebase CLI login status
 * - Extract account information from Firebase login
 * - Verify project access permissions
 * - Check Firebase CLI version for compatibility
 * - Provide guidance for authentication issues
 * 
 * @module auth/firebase-auth
 * @example
 * // Basic usage example
 * import * as firebaseAuth from './auth/firebase-auth.js';
 * 
 * async function checkFirebaseSetup() {
 *   // Check if user is authenticated with Firebase
 *   const authStatus = firebaseAuth.checkFirebaseAuth();
 *   
 *   if (authStatus.authenticated) {
 *     console.log(`Authenticated as ${authStatus.email}`);
 *     
 *     // Verify access to a specific project
 *     const projectAccess = firebaseAuth.verifyProjectAccess('my-project-id');
 *     if (projectAccess) {
 *       console.log('Project access confirmed');
 *     }
 *   } else {
 *     console.error('Authentication failed:', authStatus.error);
 *     firebaseAuth.showLoginInstructions();
 *   }
 * }
 */

import * as commandRunner from '../core/command-runner.js';
import * as logger from '../core/logger.js';
import { execSync } from 'child_process';

/* global process */

/**
 * Check if the user is authenticated with Firebase CLI
 * 
 * @function checkFirebaseAuth
 * @returns {Object} Authentication status object containing:
 *   - authenticated {boolean}: Whether the user is authenticated
 *   - email {string|undefined}: Email address if authenticated
 *   - error {string|undefined}: Error message if not authenticated
 *   - errorDetails {string|undefined}: Additional error details if available
 * @description Verifies if the user is currently logged in to the Firebase CLI
 * by running the 'firebase login:list' command and analyzing its output.
 * If authentication issues are detected, the function provides detailed error
 * information and suggestions for resolving the issues.
 * @example
 * // Check Firebase authentication
 * const authStatus = checkFirebaseAuth();
 * 
 * if (authStatus.authenticated) {
 *   console.log(`Authenticated with Firebase as ${authStatus.email}`);
 *   // Proceed with Firebase operations
 * } else {
 *   console.error(`Firebase authentication failed: ${authStatus.error}`);
 *   console.error(`Run 'firebase login' to authenticate`);
 * }
 */
export function checkFirebaseAuth() {
  logger.info('Checking Firebase CLI authentication...');
  
  try {
    // Run additional command that requires valid token to double-check authentication
    // This is more reliable than just using login:list which might show logged in even with expired token
    const projectsResult = commandRunner.runCommand('firebase projects:list', {
      stdio: 'pipe',
      ignoreError: true
    });
  
    // If projects:list fails, token is likely expired
    if (!projectsResult.success || projectsResult.output?.includes('Error: Failed to get Firebase projects')) {
      logger.warn('Firebase token may be expired or invalid');
      
      // Immediately run reauth as requested - but use runCommandAsync as it's an interactive command
      logger.info('Initiating Firebase reauthentication...');
      
      // We need to run this synchronously to block until auth is complete
      // But we must make sure to run it in a way that allows terminal interaction
      try {
        // Using execSync directly to ensure proper interactive handling
        execSync('firebase login --reauth', { 
          stdio: 'inherit', // This is critical for interactive commands
          shell: true
        });
        
        logger.success('Firebase reauthentication successful');
        
        // After successful reauth, continue normal flow to get email
        const emailResult = commandRunner.runCommand('firebase login:list', {
          stdio: 'pipe',
          ignoreError: true
        });
        
        if (emailResult.success) {
          const output = emailResult.output || '';
          const emailMatch = output.match(/User: ([^\s]+)/);
          const email = emailMatch ? emailMatch[1] : 'Unknown';
          
          logger.success(`Firebase reauthenticated as: ${email}`);
          return {
            authenticated: true,
            email
          };
        }
      } catch (error) {
        logger.error(`Firebase reauthentication failed: ${error.message}`);
        return {
          authenticated: false,
          error: 'Firebase token expired or invalid',
          errorDetails: `Reauthentication failed: ${error.message}`
        };
      }
    }
    
    // Normal flow continues if projects:list succeeded initially
    const result = commandRunner.runCommand('firebase login:list', {
      stdio: 'pipe',
      ignoreError: true
    });

    if (!result.success) {
      logger.error('Failed to check Firebase authentication status');
      logger.error('Make sure the Firebase CLI is installed:');
      logger.info('npm install -g firebase-tools');
      
      return {
        authenticated: false,
        error: 'Firebase CLI command failed',
        errorDetails: result.error
      };
    }

    const output = result.output || '';
    
    // Check if any users are logged in
    if (output.includes('No users signed in')) {
      logger.error('No Firebase users signed in');
      logger.info('To authenticate, run:');
      logger.info('firebase login');
      
      return {
        authenticated: false,
        error: 'No Firebase users signed in'
      };
    }
    
    // If we get here, there should be a logged in user
    // Extract email using regex
    const emailMatch = output.match(/User: ([^\s]+)/);
    const email = emailMatch ? emailMatch[1] : 'Unknown';
    
    if (email === 'Unknown') {
      logger.warn('Failed to extract user email from Firebase authentication');
      logger.warn('This might indicate an issue with the Firebase CLI or token');
      
      // If email is Unknown but we passed the project list check, still consider it authenticated
      // but with a warning
      logger.success(`Firebase authenticated but unable to identify user email`);
      return {
        authenticated: true,
        email: 'Unknown',
        warning: 'Unable to determine user email'
      };
    }
    
    logger.success(`Firebase authenticated as: ${email}`);
    
    return {
      authenticated: true,
      email
    };
  } catch (error) {
    logger.error(`Unexpected error checking Firebase authentication: ${error.message}`);
    return {
      authenticated: false,
      error: 'Exception while checking Firebase authentication',
      errorDetails: error.message
    };
  }
}

/**
 * Verify Firebase project access
 * 
 * @function verifyProjectAccess
 * @param {string} projectId - Firebase project ID to check access for
 * @returns {boolean} Whether the user has access to the specified project
 * @description Checks if the currently authenticated Firebase user has access to
 * the specified Firebase project by listing all accessible projects and checking
 * if the specified project ID is in the list. This confirms that the user has
 * appropriate permissions before attempting operations on the project.
 * @example
 * // Verify access to a project
 * const projectId = 'my-firebase-project';
 * const hasAccess = verifyProjectAccess(projectId);
 * 
 * if (hasAccess) {
 *   console.log(`Confirmed access to project: ${projectId}`);
 *   // Proceed with project-specific operations
 * } else {
 *   console.error(`No access to project: ${projectId}`);
 *   console.error('Please ensure you are logged in with the correct account');
 * }
 */
export function verifyProjectAccess(projectId) {
  logger.info(`Verifying access to Firebase project: ${projectId}`);
  
  const result = commandRunner.runCommand(`firebase projects:list`, {
    stdio: 'pipe',
    ignoreError: true
  });
  
  if (!result.success) {
    logger.error('Failed to list Firebase projects');
    return false;
  }
  
  const output = result.output || '';
  
  // Check if the project ID is in the list
  if (output.includes(projectId)) {
    logger.success(`Confirmed access to project: ${projectId}`);
    return true;
  } else {
    logger.error(`No access to Firebase project: ${projectId}`);
    logger.info('Check that you are logged in with the correct account');
    logger.info('Or ensure the project exists and you have been granted access');
    return false;
  }
}

/**
 * Check Firebase CLI version
 * 
 * @function checkFirebaseCliVersion
 * @returns {Object} Version information object containing:
 *   - installed {boolean}: Whether Firebase CLI is installed
 *   - version {string|undefined}: Version string if installed
 *   - validFormat {boolean|undefined}: Whether the version format is valid
 *   - major {number|undefined}: Major version number if parsed successfully
 *   - minor {number|undefined}: Minor version number if parsed successfully
 *   - isRecommendedVersion {boolean|undefined}: Whether the version meets minimum recommendations
 *   - error {string|undefined}: Error message if not installed
 * @description Checks if the Firebase CLI is installed and if the installed version
 * meets the recommended minimum version requirements. Firebase CLI version 9.0.0 or
 * higher is recommended for all features to work correctly.
 * @example
 * // Check Firebase CLI version
 * const versionInfo = checkFirebaseCliVersion();
 * 
 * if (!versionInfo.installed) {
 *   console.error('Firebase CLI not installed. Please install with:');
 *   console.error('npm install -g firebase-tools');
 * } else if (!versionInfo.isRecommendedVersion) {
 *   console.warn(`Firebase CLI version ${versionInfo.version} is older than recommended`);
 *   console.warn('Consider upgrading to version 9.0.0 or higher');
 * } else {
 *   console.log(`Firebase CLI version ${versionInfo.version} is installed`);
 * }
 */
export function checkFirebaseCliVersion() {
  const result = commandRunner.runCommand('firebase --version', {
    stdio: 'pipe',
    ignoreError: true
  });
  
  if (!result.success) {
    return {
      installed: false,
      error: 'Firebase CLI not installed or not in PATH'
    };
  }
  
  const version = (result.output || '').trim();
  const versionMatch = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  
  if (!versionMatch) {
    return {
      installed: true,
      version: version,
      validFormat: false
    };
  }
  
  const major = parseInt(versionMatch[1], 10);
  const minor = parseInt(versionMatch[2], 10);
  
  // Firebase CLI 9.0.0+ is recommended
  const isRecommendedVersion = major >= 9;
  
  if (!isRecommendedVersion) {
    logger.warn(`Firebase CLI version ${version} is older than recommended (9.0.0+)`);
    logger.info('Consider upgrading with: npm install -g firebase-tools');
  } else {
    logger.info(`Firebase CLI version: ${version}`);
  }
  
  return {
    installed: true,
    version,
    validFormat: true,
    major,
    minor,
    isRecommendedVersion
  };
}

/**
 * Verify authentication with Firebase token
 * 
 * @async
 * @function verifyTokenAuth
 * @param {string} token - Firebase CI token to verify
 * @returns {Promise<Object>} Authentication status object containing:
 *   - authenticated {boolean}: Whether the token is valid
 *   - error {string|undefined}: Error message if not authenticated
 * @description Verifies if a Firebase token (typically used in CI environments) is valid
 * by attempting a simple Firebase operation. This is useful for non-interactive
 * authentication scenarios like automated deployments.
 * @example
 * // Verify a CI token
 * async function checkCiToken() {
 *   const ciToken = process.env.FIREBASE_TOKEN; 
 *   
 *   if (!ciToken) {
 *     console.error('No Firebase token found in environment');
 *     return false;
 *   }
 *   
 *   const tokenStatus = await verifyTokenAuth(ciToken);
 *   
 *   if (tokenStatus.authenticated) {
 *     console.log('Firebase token is valid');
 *     return true;
 *   } else {
 *     console.error(`Token verification failed: ${tokenStatus.error}`);
 *     return false;
 *   }
 * }
 */
export async function verifyTokenAuth(token) {
  if (!token) {
    return {
      authenticated: false,
      error: 'No token provided'
    };
  }
  
  logger.info('Verifying Firebase token authentication...');
  
  try {
    // Use a non-destructive command to verify the token works
    const result = await commandRunner.runCommandAsync(`firebase projects:list --token "${token}"`, {
      ignoreError: true
    });
    
    if (result.success) {
      logger.success('Firebase token authentication successful');
      return {
        authenticated: true
      };
    } else {
      logger.error('Firebase token authentication failed');
      return {
        authenticated: false,
        error: 'Invalid or expired token'
      };
    }
  } catch (error) {
    logger.error(`Firebase token verification error: ${error.message}`);
    return {
      authenticated: false,
      error: error.message
    };
  }
}

/**
 * Output instructions for logging in to Firebase
 * 
 * @function showLoginInstructions
 * @description Displays formatted instructions for authenticating with the Firebase CLI.
 * This includes step-by-step guidance on running the login command, completing the
 * browser-based authentication flow, and verifying successful login.
 * @example
 * // When authentication fails, show instructions
 * const authStatus = checkFirebaseAuth();
 * 
 * if (!authStatus.authenticated) {
 *   console.error('Firebase authentication is required for deployment');
 *   showLoginInstructions();
 *   process.exit(1);
 * }
 */
export function showLoginInstructions() {
  logger.section('Firebase Authentication Instructions');
  logger.info('To authenticate with Firebase, follow these steps:');
  logger.info('');
  logger.info('1. Run the following command:');
  logger.info('   firebase login');
  logger.info('');
  logger.info('2. A browser window will open. Sign in with your Firebase account');
  logger.info('');
  logger.info('3. After successful login, return to the terminal');
  logger.info('');
  logger.info('4. Verify your login with:');
  logger.info('   firebase login:list');
  logger.info('');
  logger.info('Then run this script again to continue.');
}

/**
 * Verify authentication with Firebase
 * 
 * @async
 * @function verifyAuth
 * @returns {Promise<Object>} Authentication status object containing:
 *   - authenticated {boolean}: Whether the user is authenticated
 *   - email {string|undefined}: Email address if authenticated
 *   - error {string|undefined}: Error message if not authenticated
 *   - cliVersion {Object|undefined}: Firebase CLI version information if available
 * @description Comprehensive authentication verification that combines checking CLI version,
 * user authentication status, and provides a complete authentication status result.
 * This is the primary function to use when you need to verify Firebase authentication
 * before proceeding with operations.
 * @example
 * // Verify Firebase authentication before deployment
 * async function prepareDeployment() {
 *   const authResult = await verifyAuth();
 *   
 *   if (!authResult.authenticated) {
 *     console.error(`Firebase authentication failed: ${authResult.error}`);
 *     showLoginInstructions();
 *     return false;
 *   }
 *   
 *   console.log(`Authenticated as ${authResult.email}`);
 *   
 *   // Continue with deployment...
 *   return true;
 * }
 */
export async function verifyAuth() {
  // First check CLI version to ensure Firebase CLI is installed
  const versionInfo = checkFirebaseCliVersion();
  
  if (!versionInfo.installed) {
    return {
      authenticated: false,
      error: 'Firebase CLI not installed',
      cliVersion: versionInfo
    };
  }
  
  // Then check authentication status
  const authStatus = checkFirebaseAuth();
  
  // Combine the results
  return {
    ...authStatus,
    cliVersion: versionInfo
  };
}

export default {
  checkFirebaseAuth,
  verifyProjectAccess,
  checkFirebaseCliVersion,
  verifyTokenAuth,
  showLoginInstructions,
  verifyAuth
}; 