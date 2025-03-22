#!/usr/bin/env node

/**
 * Firebase Authentication Module
 * 
 * Provides utilities for checking and verifying Firebase CLI authentication.
 * 
 * Features:
 * - Check Firebase CLI login status
 * - Extract account information from Firebase login
 * - Provide guidance for authentication issues
 * 
 * @module preview/firebase-auth
 */

import * as commandRunner from './command-runner.js';
import * as logger from './logger.js';

/* global process */

/**
 * Check if the user is authenticated with Firebase CLI
 * @returns {Object} Authentication status with details
 */
export function checkFirebaseAuth() {
  logger.info('Checking Firebase CLI authentication...');
  
  const result = commandRunner.runCommand('firebase login:list', {
    stdio: 'pipe',
    ignoreError: true
  });

  if (!result.success) {
    logger.error('Failed to check Firebase authentication status');
    logger.error('Make sure the Firebase CLI is installed:');
    logger.info('pnpm add -g firebase-tools');
    
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
  
  logger.success(`Firebase authenticated as: ${email}`);
  
  return {
    authenticated: true,
    email
  };
}

/**
 * Verify Firebase project access
 * @param {string} projectId - Firebase project ID to check
 * @returns {boolean} Whether the user has access to the project
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
 * @returns {Object} Version information
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
    logger.info('Consider upgrading with: pnpm add -g firebase-tools');
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
 * Output instructions for logging in to Firebase
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

export default {
  checkFirebaseAuth,
  verifyProjectAccess,
  checkFirebaseCliVersion,
  showLoginInstructions
}; 