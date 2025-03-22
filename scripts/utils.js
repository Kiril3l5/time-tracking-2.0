#!/usr/bin/env node

/**
 * Main Utilities Export Module
 * 
 * Provides a unified entry point for importing all utility functions
 * from the script modules. This simplifies imports in the main scripts
 * and ensures consistent usage across the codebase.
 * 
 * @module utils
 */

// Core utilities
import * as logger from './core/logger.js';
import * as colors from './core/colors.js';
import * as commandRunner from './core/command-runner.js';
import * as progressTracker from './core/progress-tracker.js';
import * as config from './core/config.js';

// Authentication utilities
import * as auth from './auth/auth-manager.js';
import * as firebaseAuth from './auth/firebase-auth.js';
import * as gitAuth from './auth/git-auth.js';

// Firebase utilities
import * as firebaseDeployment from './firebase/deployment.js';

// Environment and validation utilities
import * as environment from './checks/env-validator.js';

// Re-export all modules
export { logger, colors, commandRunner, progressTracker, config };
export { auth, firebaseAuth, gitAuth };
export { firebaseDeployment };
export { environment };

/**
 * Quick check to verify the module is properly loaded
 * @returns {boolean} true if everything is working
 */
export function checkModuleLoaded() {
  return true;
}

export default {
  checkModuleLoaded,
  // Include all submodules as namespaces
  logger,
  colors,
  commandRunner,
  progressTracker,
  config,
  auth,
  firebaseAuth,
  gitAuth,
  firebaseDeployment,
  environment
}; 