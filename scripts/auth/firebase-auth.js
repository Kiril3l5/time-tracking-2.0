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

import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';
import { spawn } from 'child_process';

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
export async function checkFirebaseAuth() {
  logger.info('Checking Firebase CLI authentication...');
  
  // Check for CI environment and token first
  if (process.env.CI === 'true' || process.env.CI === true) {
    logger.info('CI environment detected, checking for Firebase token...');
    
    const token = process.env.FIREBASE_TOKEN;
    if (token) {
      // Validate the token
      try {
        const projectsResult = commandRunner.runCommand(`firebase projects:list --token "${token}"`, {
          stdio: 'pipe',
          ignoreError: true
        });
        
        if (projectsResult.success) {
          logger.success('Firebase token authentication successful in CI environment');
          return {
            authenticated: true,
            email: 'CI Service Account',
            isCI: true
          };
        } else {
          logger.warn('Firebase token provided but failed validation in CI environment');
          // Continue with regular auth flow as fallback
        }
      } catch (error) {
        logger.warn(`Error validating Firebase token in CI: ${error.message}`);
        // Continue with regular auth flow as fallback
      }
    } else {
      logger.warn('CI environment detected but no FIREBASE_TOKEN environment variable found');
      logger.info('For CI/CD automation, set FIREBASE_TOKEN environment variable');
      logger.info('Generate a token with: firebase login:ci');
    }
  }
  
  try {
    // Start by checking the current auth state with login:list --json
    let email = 'Unknown';
    let isAuthenticated = false;
    let rawLoginOutput = ''; // Variable to store raw output for debugging

    try {
      const loginListResult = commandRunner.runCommand('firebase login:list --json', {
        stdio: 'pipe',
        ignoreError: true // Ignore error initially, we'll check output
      });
      
      rawLoginOutput = loginListResult.output; // Store raw output

      if (loginListResult.success && loginListResult.output) {
        const loginData = JSON.parse(loginListResult.output);
        
        if (loginData.status === 'success' && loginData.result && loginData.result.length > 0) {
          // Assuming the first user is the active one
          email = loginData.result[0].user; 
          isAuthenticated = true;
          logger.debug(`Successfully parsed user from JSON: ${email}`);
        } else if (loginData.status === 'success' && loginData.result && loginData.result.length === 0) {
           logger.info('Firebase login:list --json reported no users signed in.');
           isAuthenticated = false;
        } else {
            logger.warn('Firebase login:list --json executed but status was not success or no users found.');
            isAuthenticated = false;
        }
      } else {
        logger.warn('Failed to execute or parse firebase login:list --json.');
        isAuthenticated = false;
        // Attempt legacy text parsing as a fallback if JSON fails? (Optional - keep simple for now)
        // logger.debug('Attempting legacy text parsing for Firebase auth...');
        // const emailMatch = rawLoginOutput.match(/User: ([^\s\n]+)/); // Example legacy fallback
        // if (emailMatch && emailMatch[1]) { email = emailMatch[1]; isAuthenticated = true; }
      }
    } catch (parseError) {
        logger.error(`Failed to parse JSON output from 'firebase login:list --json'. Error: ${parseError.message}`);
        logger.debug(`Raw output: ${rawLoginOutput}`);
        isAuthenticated = false;
    }

    // If initial check failed, directly proceed to reauth or error
    if (!isAuthenticated) {
         logger.warn('Initial Firebase authentication check failed or user not logged in.');
         // Directly try reauth or report error? For now, let the projects:list check handle the reauth trigger
         // (Alternatively, could trigger reauth immediately here)
    }
    
    // Try a command that requires valid auth to verify token is still valid
    // This also acts as a check even if login:list parsing failed for some reason
    logger.info('Verifying token validity with projects:list...');
    const projectsResult = commandRunner.runCommand('firebase projects:list', {
      stdio: 'pipe',
      ignoreError: true
    });
    
    // If projects:list succeeded, we're definitely good
    if (projectsResult.success) {
      // If email wasn't found via JSON, try to get it again now we know auth works
      if (isAuthenticated && email === 'Unknown') { 
         logger.warn('Auth verified via projects:list, but email parsing failed earlier. Attempting email retrieval again.');
         // Re-run JSON or text parse here if desired, or just return 'Unknown'
      } else if (!isAuthenticated) {
          // This means login:list failed BUT projects:list worked. Odd state.
          // Attempt to get email again.
          logger.warn('login:list indicated no auth, but projects:list succeeded. Attempting email retrieval.');
           try {
              const loginListResult = commandRunner.runCommand('firebase login:list --json', { stdio: 'pipe', ignoreError: true });
              if (loginListResult.success && loginListResult.output) {
                  const loginData = JSON.parse(loginListResult.output);
                  if (loginData.status === 'success' && loginData.result && loginData.result.length > 0) {
                      email = loginData.result[0].user;
                      logger.info(`Retrieved email after successful projects:list: ${email}`);
                  }
              }
           } catch (e) { logger.warn('Failed to retrieve email even after successful projects:list.'); }
      }
      
      logger.success(`Firebase authenticated as: ${email}`);
      return {
        authenticated: true,
        email
      };
    }
    
    // If we get here, projects:list failed, likely needing reauthentication
    logger.warn('Firebase token may be expired or invalid (projects:list failed).');
    logger.info('Initiating Firebase reauthentication via direct process...');
    
    // Reauthentication logic using spawn (remains the same)
    return new Promise((resolve, _reject) => {
      try {
        const proc = spawn('firebase', ['login', '--reauth'], {
          stdio: 'inherit',
          shell: true
        });
        
        proc.on('exit', (code) => {
          if (code === 0) {
            logger.success('Firebase reauthentication successful');
            
            // Verify auth after reauth
            const projectCheckResult = commandRunner.runCommand('firebase projects:list', {
              stdio: 'pipe',
              ignoreError: true
            });
            
            if (projectCheckResult.success) {
              // Get user email using JSON method after successful re-auth
              let reauthEmail = 'Unknown';
              try {
                 const emailCheckResult = commandRunner.runCommand('firebase login:list --json', { stdio: 'pipe', ignoreError: true });
                 if (emailCheckResult.success && emailCheckResult.output) {
                   const loginData = JSON.parse(emailCheckResult.output);
                   if (loginData.status === 'success' && loginData.result && loginData.result.length > 0) {
                     reauthEmail = loginData.result[0].user;
                   }
                 }
              } catch (e) { logger.warn('Failed to parse email via JSON after re-auth.'); }

              resolve({
                authenticated: true,
                email: reauthEmail
              });

            } else {
              // Even after reauth, projects:list failed
              logger.error('Firebase reauthentication completed but still unable to access projects');
              resolve({
                authenticated: false,
                error: 'Firebase authentication issue persists after reauthentication',
                errorDetails: 'Please try running "firebase logout" followed by "firebase login" manually'
              });
            }
          } else {
            logger.error('Firebase reauthentication failed');
            resolve({
              authenticated: false,
              error: 'Firebase token expired or invalid',
              errorDetails: `Reauthentication failed with code ${code}`
            });
          }
        });
        
        proc.on('error', (err) => {
          logger.error(`Firebase reauthentication error: ${err.message}`);
          resolve({
            authenticated: false,
            error: 'Firebase token expired or invalid',
            errorDetails: err.message
          });
        });
      } catch (error) {
        logger.error(`Failed to spawn Firebase reauthentication process: ${error.message}`);
        resolve({
          authenticated: false,
          error: 'Failed to initiate reauthentication',
          errorDetails: error.message
        });
      }
    });
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
  const authStatus = await checkFirebaseAuth();
  
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