#!/usr/bin/env node

/**
 * Preview Workflow Script
 * 
 * This script orchestrates the entire workflow for creating preview deployments:
 * 1. Verifies authentication (Firebase CLI, Git)
 * 2. Runs all quality checks (lint, type check, tests)
 * 3. Builds the application
 * 4. Deploys to Firebase preview channels
 * 5. Provides feedback and cleanup
 * 
 * This is a modernized version of the original deploy-test.js and preview-check.js
 * scripts, with a modular architecture for better maintainability.
 * 
 * Usage:
 *   node scripts/preview/preview.js [options]
 * 
 * Options:
 *   --quick             Skip all checks (lint, type check, tests)
 *   --skip-lint         Skip linting checks
 *   --skip-typecheck    Skip TypeScript type checking
 *   --skip-tests        Skip running tests
 *   --skip-build        Skip building the application
 *   --skip-deploy       Skip deployment (only run checks)
 *   --skip-cleanup      Skip cleaning up old preview channels
 *   --save-logs         Save console output to log file
 *   --verbose           Enable verbose logging
 *   --help              Show help information
 * 
 * Examples:
 *   node scripts/preview/preview.js
 *   node scripts/preview/preview.js --quick
 *   node scripts/preview/preview.js --skip-tests --skip-typecheck
 * 
 * @module preview/preview
 */

import { parseArgs } from 'node:util';
import * as core from './core.js';

/* global process, console */

// Parse command line arguments
function parseArguments() {
  const options = {
    'quick': { type: 'boolean', default: false },
    'skip-lint': { type: 'boolean', default: false },
    'skip-typecheck': { type: 'boolean', default: false },
    'skip-tests': { type: 'boolean', default: false },
    'skip-build': { type: 'boolean', default: false },
    'skip-deploy': { type: 'boolean', default: false },
    'skip-cleanup': { type: 'boolean', default: false },
    'save-logs': { type: 'boolean', default: false },
    'verbose': { type: 'boolean', default: false },
    'help': { type: 'boolean', default: false }
  };
  
  const { values } = parseArgs({ options, allowPositionals: false });
  
  // If --quick is specified, skip all checks
  if (values.quick) {
    values['skip-lint'] = true;
    values['skip-typecheck'] = true;
    values['skip-tests'] = true;
  }
  
  return values;
}

/**
 * Display help information
 */
/* eslint-disable no-console */
function showHelp() {
  const { colors } = core;
  
  console.log(`
${colors.cyan.bold}Firebase Preview Deployment Workflow${colors.reset}

This script orchestrates the entire workflow for creating preview deployments.

${colors.bold}Usage:${colors.reset}
  node scripts/preview/preview.js [options]

${colors.bold}Options:${colors.reset}
  ${colors.green}Quality Checks:${colors.reset}
  --quick               Skip all checks (linting, type checking, tests)
  --skip-lint           Skip linting checks
  --skip-typecheck      Skip TypeScript type checking
  --skip-tests          Skip running tests
  --skip-build          Skip building the application
  
  ${colors.green}Deployment Options:${colors.reset}
  --skip-deploy         Skip deployment (only run checks)
  --skip-cleanup        Skip cleaning up old preview channels
  
  ${colors.green}Logging Options:${colors.reset}
  --save-logs           Save console output to log file
  --verbose             Enable verbose logging
  
  ${colors.green}Other Options:${colors.reset}
  --help                Show this help message

${colors.bold}Examples:${colors.reset}
  ${colors.blue}# Full workflow with all checks${colors.reset}
  node scripts/preview/preview.js

  ${colors.blue}# Quick deployment without checks${colors.reset}
  node scripts/preview/preview.js --quick

  ${colors.blue}# Skip tests but run other checks${colors.reset}
  node scripts/preview/preview.js --skip-tests
  
  ${colors.blue}# Skip both tests and TypeScript checks${colors.reset}
  node scripts/preview/preview.js --skip-tests --skip-typecheck
  `);
}
/* eslint-enable no-console */

/**
 * Verify authentication and prerequisites
 * @returns {boolean} - Whether authentication checks passed
 */
async function verifyAuthentication() {
  core.logger.section('Verifying Authentication');
  
  // Check Firebase CLI authentication
  const firebaseAuth = core.firebaseAuth.checkFirebaseAuth();
  if (!firebaseAuth.authenticated) {
    core.logger.error('Firebase authentication failed. Please log in with Firebase CLI.');
    core.logger.info('Run: firebase login');
    return false;
  }
  
  // Check Git configuration
  const gitBranch = core.github.getCurrentBranch();
  if (!gitBranch) {
    core.logger.error('Failed to get current Git branch. Make sure you are in a Git repository.');
    return false;
  }
  
  // Additional Git checks could be added here if needed
  
  core.logger.success('Authentication verified successfully');
  return true;
}

/**
 * Run quality checks (lint, type check, tests)
 * @param {Object} args - Command line arguments
 * @returns {boolean} - Whether all enabled checks passed
 */
async function runQualityChecks(args) {
  core.logger.section('Running Quality Checks');
  
  let allPassed = true;
  
  // Run linting if not skipped
  if (!args['skip-lint']) {
    core.logger.info('Running lint checks...');
    const lintCommand = 'pnpm run lint';
    const lintResult = await core.commandRunner.runCommandAsync(lintCommand, { ignoreError: true });
    
    if (lintResult.success) {
      core.logger.success('Linting passed');
    } else {
      core.logger.error('Linting failed');
      if (lintResult.error) core.logger.error(lintResult.error);
      allPassed = false;
    }
  } else {
    core.logger.info('Skipping lint checks');
  }
  
  // Run TypeScript type checking if not skipped
  if (!args['skip-typecheck']) {
    core.logger.info('Running TypeScript type checks...');
    const typeCheckCommand = 'pnpm exec tsc --noEmit';
    const typeCheckResult = await core.commandRunner.runCommandAsync(typeCheckCommand, { ignoreError: true });
    
    if (typeCheckResult.success) {
      core.logger.success('TypeScript type checking passed');
    } else {
      core.logger.error('TypeScript type checking failed');
      if (typeCheckResult.error) core.logger.error(typeCheckResult.error);
      allPassed = false;
    }
  } else {
    core.logger.info('Skipping TypeScript type checks');
  }
  
  // Run tests if not skipped
  if (!args['skip-tests']) {
    core.logger.info('Running tests...');
    const testCommand = 'pnpm run test';
    const testResult = await core.commandRunner.runCommandAsync(testCommand, { ignoreError: true });
    
    if (testResult.success) {
      core.logger.success('Tests passed');
    } else {
      core.logger.error('Tests failed');
      if (testResult.error) core.logger.error(testResult.error);
      allPassed = false;
    }
  } else {
    core.logger.info('Skipping tests');
  }
  
  if (allPassed) {
    core.logger.success('All quality checks passed!');
  } else {
    core.logger.error('Some quality checks failed');
  }
  
  return allPassed;
}

/**
 * Build the application
 * @param {Object} args - Command line arguments
 * @returns {boolean} - Whether the build succeeded
 */
async function buildApplication(args) {
  if (args['skip-build']) {
    core.logger.info('Skipping build');
    return true;
  }
  
  core.logger.section('Building Application');
  
  // Get build script name from config
  const buildScript = core.config.buildConfig.script || 'build';
  const buildCommand = `pnpm run ${buildScript}`;
  
  core.logger.info(`Running build using '${buildScript}' script...`);
  const buildResult = await core.commandRunner.runCommandAsync(buildCommand, { ignoreError: true });
  
  if (buildResult.success) {
    core.logger.success('Build successful!');
    return true;
  } else {
    core.logger.error('Build failed');
    if (buildResult.error) core.logger.error(buildResult.error);
    return false;
  }
}

/**
 * Deploy to Firebase preview channel
 * @param {Object} args - Command line arguments
 * @returns {boolean} - Whether the deployment succeeded
 */
async function deployPreview(args) {
  if (args['skip-deploy']) {
    core.logger.info('Skipping deployment');
    return true;
  }
  
  core.logger.section('Deploying Preview');
  
  // Generate a channel name based on branch and timestamp
  const branch = core.github.getCurrentBranch();
  const channelId = core.environment.generateEnvironmentName(branch);
  
  // Get Firebase config from core.config
  const { projectId, site, buildDir } = core.config.firebaseConfig;
  
  // Show deployment details
  core.logger.info(`Deploying branch '${branch}' to Firebase preview channel`);
  core.logger.info(`Channel: ${channelId}`);
  core.logger.info(`Project: ${projectId}`);
  core.logger.info(`Site: ${site}`);
  core.logger.info(`Build directory: ${buildDir}`);
  
  // Deploy to Firebase hosting channel
  const deployResult = await core.firebaseDeploy.deployToChannel({
    channelId,
    projectId,
    site,
    buildDir,
    expires: true,
    expireDays: core.config.previewConfig.expireDays
  });
  
  if (deployResult.success) {
    core.logger.success(`Deployment successful!`);
    core.logger.info(`Preview URL: ${deployResult.url}`);
    
    // Add PR comment if we have a PR number
    const prNumber = core.config.gitConfig.prNumber;
    if (prNumber) {
      core.logger.info(`Adding deployment comment to PR #${prNumber}`);
      
      core.github.addDeploymentComment(prNumber, {
        url: deployResult.url,
        environment: 'preview',
        commitSha: core.github.getCurrentCommitSha(),
        branch
      });
    }
    
    return true;
  } else {
    core.logger.error(`Deployment failed: ${deployResult.error}`);
    return false;
  }
}

/**
 * Clean up old preview channels if needed
 * @param {Object} args - Command line arguments
 */
async function cleanupChannels(args) {
  if (args['skip-cleanup']) {
    core.logger.info('Skipping channel cleanup');
    return;
  }
  
  core.logger.section('Cleaning Up Old Channels');
  
  const { projectId, site } = core.config.firebaseConfig;
  const { prefix, keepCount } = core.config.previewConfig;
  
  core.logger.info(`Checking for old preview channels to clean up...`);
  core.logger.info(`Will keep the ${keepCount} most recent channels with prefix '${prefix}'`);
  
  const cleanupResult = await core.firebaseDeploy.cleanupChannels({
    prefix,
    keepCount,
    projectId,
    site
  });
  
  if (cleanupResult.success) {
    if (cleanupResult.deleted.length > 0) {
      core.logger.success(`Cleaned up ${cleanupResult.deleted.length} old channels`);
      cleanupResult.deleted.forEach(channel => {
        core.logger.info(`Deleted channel: ${channel}`);
      });
    } else {
      core.logger.info('No channels needed to be cleaned up');
    }
  } else {
    core.logger.warn(`Channel cleanup failed: ${cleanupResult.error}`);
  }
}

/**
 * Main function that runs the complete workflow
 */
async function main() {
  try {
    // Parse command line arguments
    const args = parseArguments();
    
    // Show help and exit if --help is specified
    if (args.help) {
      showHelp();
      process.exit(0);
    }
    
    // Enable verbose logging if specified
    if (args.verbose) {
      core.logger.setVerbose(true);
    }
    
    // Start log file if requested
    if (args['save-logs']) {
      const logFile = core.logger.startFileLogging();
      core.logger.info(`Saving logs to: ${logFile}`);
    }
    
    // Display workflow header
    core.logger.section('Firebase Preview Deployment Workflow');
    core.logger.info(`Starting preview workflow at ${new Date().toISOString()}`);
    
    // Verify authentication
    const authPassed = await verifyAuthentication();
    if (!authPassed) {
      core.logger.error('Authentication checks failed. Aborting workflow.');
      process.exit(1);
    }
    
    // Run quality checks
    const checksPassed = await runQualityChecks(args);
    
    // Only proceed with build and deploy if checks passed
    if (checksPassed || args.quick) {
      // Build the application
      const buildPassed = await buildApplication(args);
      
      if (buildPassed) {
        // Deploy to preview channel
        const deployPassed = await deployPreview(args);
        
        // Clean up old channels if deployment succeeded
        if (deployPassed) {
          await cleanupChannels(args);
        }
        
        // Final result
        if (deployPassed) {
          core.logger.success('Preview workflow completed successfully!');
          process.exit(0);
        } else {
          core.logger.error('Preview deployment failed.');
          process.exit(1);
        }
      } else {
        core.logger.error('Build failed. Cannot deploy.');
        process.exit(1);
      }
    } else {
      core.logger.error('Quality checks failed. Cannot proceed with deployment.');
      process.exit(1);
    }
    
    // Stop log file if it was started
    if (args['save-logs']) {
      core.logger.stopFileLogging();
    }
  } catch (error) {
    core.logger.error(`Error in preview workflow:`);
    core.logger.error(error.message);
    core.logger.error(error.stack);
    process.exit(1);
  }
}

// Run the main function
main(); 