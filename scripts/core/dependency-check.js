#!/usr/bin/env node

/**
 * Dependency Check Module
 * 
 * Utilities for checking that required dependencies are properly installed
 * before running the workflow. This helps prevent runtime errors caused
 * by missing modules.
 * 
 * Features:
 * - Check for required npm packages
 * - Verify external tool availability (e.g., Firebase CLI)
 * - Suggest installation commands when dependencies are missing
 * - Optionally auto-install missing dependencies
 * 
 * @module core/dependency-check
 * @example
 * // Example of basic usage in a workflow
 * import { verifyDependencies } from './core/dependency-check.js';
 * import { errorTracker } from './core/error-handler.js';
 * 
 * const result = await verifyDependencies({
 *   requiredPackages: ['firebase-tools', 'chalk'],
 *   requiredCommands: ['git', 'firebase'],
 *   errorTracker
 * });
 * 
 * if (!result.success) {
 *   console.error('Missing dependencies detected');
 *   process.exit(1);
 * }
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { execSync } from 'node:child_process';
import * as logger from './logger.js';
import { DependencyError } from './error-handler.js';

/* global process */

// Initialize directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

/**
 * Check if a package is installed by checking its existence in node_modules
 * 
 * @function isPackageInstalled
 * @param {string} packageName - The name of the package to check
 * @returns {boolean} - Whether the package is installed
 * @description Verifies if a npm package is installed in the project's node_modules directory.
 * This is a more reliable method than trying to require the package, as it works even
 * for packages that are only used by CLI tools or for TypeScript types.
 * @example
 * if (isPackageInstalled('firebase-tools')) {
 *   // Firebase tools are available
 * } else {
 *   console.warn('Firebase tools not found in node_modules');
 * }
 */
export function isPackageInstalled(packageName) {
  const packagePath = path.join(rootDir, 'node_modules', packageName);
  return fs.existsSync(packagePath);
}

/**
 * Check if an external CLI tool is installed
 * 
 * @function isCommandAvailable
 * @param {string} command - The command to check (e.g., 'firebase', 'git')
 * @returns {boolean} - Whether the command is available in the system PATH
 * @description Tests if a command-line tool is available in the system by using the
 * 'which' command (Unix) or 'where' command (Windows). Returns true if the command
 * is found in the PATH, false otherwise.
 * @example
 * if (isCommandAvailable('firebase')) {
 *   // Firebase CLI is installed
 * } else {
 *   console.warn('Firebase CLI not found, please install it');
 * }
 */
export function isCommandAvailable(command) {
  try {
    // Different check command based on platform
    const checkCommand = process.platform === 'win32'
      ? `where ${command}`
      : `which ${command}`;
    
    execSync(checkCommand, { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Detect the package manager used in the project
 * 
 * @function detectPackageManager
 * @returns {string} - The package manager name: 'npm', 'yarn', or 'pnpm'
 * @description Determines which package manager is being used in the project
 * by checking for the existence of lock files (pnpm-lock.yaml, yarn.lock, or 
 * defaulting to npm). This helps ensure that the correct package manager commands
 * are used when installing dependencies.
 * @example
 * const pkgManager = detectPackageManager();
 * console.log(`This project uses ${pkgManager}`);
 * // Could output: "This project uses pnpm"
 */
export function detectPackageManager() {
  // Check for lockfiles to determine the package manager
  if (fs.existsSync(path.join(rootDir, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  } else if (fs.existsSync(path.join(rootDir, 'yarn.lock'))) {
    return 'yarn';
  } else {
    return 'npm';
  }
}

/**
 * Validate that the preferred package manager is being used
 * 
 * @function validatePreferredPackageManager
 * @param {string} [preferredManager='pnpm'] - The preferred package manager to use
 * @returns {Object} - Validation result
 * @description Checks if the project is using the preferred package manager.
 * Returns information about the detected package manager and whether it matches
 * the preferred one. If not, it logs a warning with instructions on how to switch.
 * @example
 * const result = validatePreferredPackageManager();
 * if (!result.isPreferred) {
 *   // Take action or provide guidance on switching package managers
 * }
 */
export function validatePreferredPackageManager(preferredManager = 'pnpm') {
  const detected = detectPackageManager();
  const isPreferred = detected === preferredManager;
  
  if (!isPreferred) {
    logger.warn(`Project is using ${detected} but ${preferredManager} is preferred.`);
    logger.info(`To switch to ${preferredManager}:`);
    
    if (preferredManager === 'pnpm') {
      logger.info('1. Install pnpm globally: npm install -g pnpm');
      logger.info('2. Remove node_modules directory and package-lock.json/yarn.lock');
      logger.info('3. Run: pnpm install');
    } else if (preferredManager === 'yarn') {
      logger.info('1. Install yarn globally: npm install -g yarn');
      logger.info('2. Remove node_modules directory and package-lock.json/pnpm-lock.yaml');
      logger.info('3. Run: yarn install');
    } else {
      logger.info('1. Remove node_modules directory and yarn.lock/pnpm-lock.yaml');
      logger.info('2. Run: npm install');
    }
  }
  
  return {
    detected,
    isPreferred,
    preferredManager
  };
}

/**
 * Attempts to install a missing package
 * 
 * @function installPackage
 * @param {string} packageName - Name of the package to install
 * @param {string} [packageManager='npm'] - The package manager to use ('npm', 'yarn', or 'pnpm')
 * @returns {boolean} True if installation was successful, false otherwise
 * @description Tries to install a missing npm package using the specified package manager.
 * Returns true if the installation succeeds (verified by checking if the package is
 * available after installation), or false if it fails.
 * @example
 * // Try to install firebase-tools using the detected package manager
 * const pkgManager = detectPackageManager();
 * if (installPackage('firebase-tools', pkgManager)) {
 *   console.log('Successfully installed firebase-tools');
 * } else {
 *   console.error('Failed to install firebase-tools');
 * }
 */
export function installPackage(packageName, packageManager = 'npm') {
  try {
    logger.info(`Installing missing package: ${packageName}`);
    
    const installCommand = {
      'npm': `npm install ${packageName}`,
      'yarn': `yarn add ${packageName}`,
      'pnpm': `pnpm add ${packageName}`
    }[packageManager];
    
    execSync(installCommand, { stdio: 'inherit' });
    return isPackageInstalled(packageName);
  } catch (err) {
    logger.error(`Failed to install ${packageName}: ${err.message}`);
    return false;
  }
}

/**
 * Verifies that all required dependencies are available
 * 
 * @function verifyDependencies
 * @param {Object} options - Configuration options
 * @param {string[]} [options.requiredPackages=[]] - Array of required npm package names
 * @param {string[]} [options.requiredCommands=[]] - Array of required external commands
 * @param {boolean} [options.autoInstall=false] - Whether to attempt auto-installation of missing packages
 * @param {Object} [options.errorTracker] - Error tracking instance from error-handler.js
 * @returns {Promise<Object>} Result object with properties:
 *   - success {boolean}: Whether all dependencies are available
 *   - missingPackages {string[]}: List of packages that are missing
 *   - missingCommands {string[]}: List of commands that are missing
 * @description Comprehensively checks for all required dependencies, both npm packages
 * and CLI commands. Can optionally attempt to auto-install missing npm packages.
 * If an error tracker is provided, it logs dependency errors there for centralized
 * error reporting. Returns a Promise that resolves with the verification status and details
 * about any missing dependencies.
 * @example
 * // Check for required dependencies
 * const result = await verifyDependencies({
 *   requiredPackages: ['firebase-tools', 'chalk'],
 *   requiredCommands: ['git', 'firebase'],
 *   autoInstall: true,
 *   errorTracker
 * });
 * 
 * if (result.success) {
 *   console.log('All dependencies are available');
 * } else {
 *   console.error('Missing dependencies:');
 *   if (result.missingPackages.length > 0) {
 *     console.error('Packages:', result.missingPackages.join(', '));
 *   }
 *   if (result.missingCommands.length > 0) {
 *     console.error('Commands:', result.missingCommands.join(', '));
 *   }
 * }
 */
export function verifyDependencies({ 
  requiredPackages = [], 
  requiredCommands = [], 
  autoInstall = false,
  errorTracker
}) {
  return new Promise((resolve, reject) => {
    const missingPackages = [];
    const missingCommands = [];
    
    // Check required packages
    for (const pkg of requiredPackages) {
      if (!isPackageInstalled(pkg)) {
        missingPackages.push(pkg);
      }
    }
    
    // Check required commands
    for (const cmd of requiredCommands) {
      if (!isCommandAvailable(cmd)) {
        missingCommands.push(cmd);
      }
    }
    
    // Return early if everything is available
    if (missingPackages.length === 0 && missingCommands.length === 0) {
      logger.info('All required dependencies are available.');
      resolve({
        success: true,
        missingPackages: [],
        missingCommands: []
      });
      return;
    }
    
    // Report missing dependencies
    if (missingPackages.length > 0) {
      logger.warn(`Missing required packages: ${missingPackages.join(', ')}`);
      
      if (autoInstall) {
        const packageManager = detectPackageManager();
        logger.info(`Using ${packageManager} to install missing packages...`);
        
        const failedInstalls = [];
        
        for (const pkg of missingPackages) {
          if (!installPackage(pkg, packageManager)) {
            failedInstalls.push(pkg);
          }
        }
        
        if (failedInstalls.length > 0) {
          const error = new DependencyError(
            `Failed to install packages: ${failedInstalls.join(', ')}`,
            'dependency-verification',
            null,
            `Run "${packageManager} install" to install all dependencies manually.`
          );
          
          if (errorTracker) {
            errorTracker.addError(error);
          }
          
          resolve({
            success: false,
            missingPackages: failedInstalls,
            missingCommands
          });
          return;
        }
        
        logger.success('Successfully installed all missing packages.');
        // Re-call the function without async/await and use a then() promise chain
        verifyDependencies({ 
          requiredPackages, 
          requiredCommands, 
          autoInstall: false,
          errorTracker
        }).then(retryResult => {
          resolve(retryResult);
        });
        return;
      } else {
        const packageManager = detectPackageManager();
        const installCommand = {
          'npm': `npm install`,
          'yarn': `yarn install`,
          'pnpm': `pnpm install`
        }[packageManager];
        
        const error = new DependencyError(
          `Missing required packages: ${missingPackages.join(', ')}`,
          'dependency-verification',
          null,
          `Run "${installCommand}" to install all dependencies.`
        );
        
        if (errorTracker) {
          errorTracker.addError(error);
        }
      }
    }
    
    // Report missing commands
    if (missingCommands.length > 0) {
      const commandSuggestions = missingCommands.map(cmd => {
        if (cmd === 'firebase') return 'npm install -g firebase-tools';
        if (cmd === 'git') return 'Install Git from https://git-scm.com/downloads';
        if (cmd === 'node') return 'Install Node.js from https://nodejs.org/';
        return `Install ${cmd} for your operating system`;
      });
      
      const error = new DependencyError(
        `Missing required commands: ${missingCommands.join(', ')}`,
        'dependency-verification',
        null,
        commandSuggestions.join('\n')
      );
      
      if (errorTracker) {
        errorTracker.addError(error);
      }
    }
    
    // Resolve with the final result
    resolve({
      success: false,
      missingPackages,
      missingCommands
    });
  });
}

/**
 * Creates a dependency checker with pre-configured options
 * 
 * @function createDependencyChecker
 * @param {Object} defaultOptions - Default configuration options for verifyDependencies
 * @returns {Function} Configured dependency checker function that accepts additional options
 * @description Factory function that creates a specialized dependency checker with pre-configured
 * default options. This is useful when you need to check similar dependencies in multiple places
 * but with slight variations.
 * @example
 * // Create a checker for Firebase-related dependencies
 * const checkFirebaseDeps = createDependencyChecker({
 *   requiredPackages: ['firebase-tools', 'firebase-admin'],
 *   requiredCommands: ['firebase'],
 *   errorTracker
 * });
 * 
 * // Later in the code, use the checker with additional options
 * const result = checkFirebaseDeps({
 *   // These options will be merged with the defaults
 *   autoInstall: true
 * });
 * 
 * if (!result.success) {
 *   console.error('Firebase dependencies not satisfied');
 * }
 */
export function createDependencyChecker(defaultOptions = {}) {
  return function(options = {}) {
    return verifyDependencies({
      ...defaultOptions,
      ...options
    });
  };
}

/**
 * Alias for verifyDependencies for backward compatibility
 * 
 * @function checkDependencies
 * @type {function}
 * @description Alias of the verifyDependencies function to maintain backward compatibility
 * with older code that might still use the checkDependencies function name.
 * New code should use verifyDependencies instead.
 */
export const checkDependencies = verifyDependencies; 