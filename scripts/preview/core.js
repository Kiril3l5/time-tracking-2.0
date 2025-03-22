#!/usr/bin/env node

/**
 * Core Module Exports
 * 
 * Exports all core functionality from the preview modules for easy importing.
 * Acts as a central entry point to all preview workflow utilities.
 * 
 * Usage examples:
 * - Import everything: import * as core from './preview/core.js';
 * - Import specific modules: import { colors, logger } from './preview/core.js';
 * 
 * @module preview/core
 */

export * as colors from './colors.js';
export * as config from './config.js';
export * as logger from './logger.js';
export * as commandRunner from './command-runner.js';
export * as progressTracker from './progress-tracker.js';
export * as firebaseAuth from './firebase-auth.js';
export * as firebaseDeploy from './firebase-deploy.js';
export * as github from './github.js';
export * as environment from './environment.js';

/**
 * Default export with all modules
 */
import * as colors from './colors.js';
import * as config from './config.js';
import * as logger from './logger.js';
import * as commandRunner from './command-runner.js';
import * as progressTracker from './progress-tracker.js';
import * as firebaseAuth from './firebase-auth.js';
import * as firebaseDeploy from './firebase-deploy.js';
import * as github from './github.js';
import * as environment from './environment.js';

export default {
  colors,
  config,
  logger,
  commandRunner,
  progressTracker,
  firebaseAuth,
  firebaseDeploy,
  github,
  environment
}; 