#!/usr/bin/env node

/**
 * Production Deployment Workflow Script
 * 
 * This script orchestrates the entire workflow for production deployments:
 * 1. Verifies authentication (Firebase CLI, Git)
 * 2. Runs all quality checks (lint, type check, tests)
 * 3. Builds the application for production
 * 4. Deploys to Firebase production hosting
 * 5. Tags the release in Git
 * 
 * This is a modernized version using our modular architecture
 * for better maintainability and separation of concerns.
 * 
 * Usage:
 *   node scripts/deploy.js [options] "Commit message"
 * 
 * Options:
 *   --quick             Skip all checks (lint, type check, tests)
 *   --skip-lint         Skip linting checks
 *   --skip-typecheck    Skip TypeScript type checking
 *   --skip-tests        Skip running tests
 *   --skip-build        Skip building the application
 *   --skip-git          Skip Git operations (commit, push, tag)
 *   --save-logs         Save console output to log file
 *   --verbose           Enable verbose logging
 *   --help              Show help information
 * 
 * Examples:
 *   node scripts/deploy.js "Fix navigation bug"
 *   node scripts/deploy.js --quick "Hotfix for login issue"
 *   node scripts/deploy.js --skip-tests "Minor UI adjustments"
 * 
 * @module deploy
 */

import { parseArgs } from 'node:util';

// Import core modules
import { logger } from './core/logger.js';
import { commandRunner } from './core/command-runner.js';
import { config } from './core/config.js';
import { environment } from './core/environment.js';
import { progressTracker } from './core/progress-tracker.js';
import { performanceMonitor } from './core/performance-monitor.js';
import { errorHandler } from './core/error-handler.js';

// Import authentication modules
import { verifyFirebaseAuth } from './auth/firebase-auth.js';
import { verifyGitAuth } from './auth/git-auth.js';
import { verifyAuth } from './auth/auth-manager.js';

// Import test and check modules
import { runTests } from './checks/test-runner.js';
import { runLintCheck } from './checks/lint-check.js';
import { runTypeScriptCheck } from './checks/typescript-check.js';
import { validateTypes } from './typescript/type-validator.js';

// Import Firebase modules
import { deployToFirebase } from './firebase/deployment.js';

// Import build modules
import { buildPackages } from './build/build-manager.js';

// Import workflow state
import { workflowState } from './workflow/workflow-state.js';

/* global process */

// Parse command line arguments
function parseArguments() {
  const options = {
    'quick': { type: 'boolean', default: false },
    'skip-lint': { type: 'boolean', default: false },
    'skip-typecheck': { type: 'boolean', default: false },
    'skip-tests': { type: 'boolean', default: false },
    'skip-build': { type: 'boolean', default: false },
    'skip-git': { type: 'boolean', default: false },
    'save-logs': { type: 'boolean', default: false },
    'verbose': { type: 'boolean', default: false },
    'help': { type: 'boolean', default: false }
  };
  
  const { values, positionals } = parseArgs({
    options,
    allowPositionals: true,
    strict: false
  });
  
  // Extract commit message from positional arguments
  const commitMessage = positionals.join(' ');
  
  // If --quick is specified, skip all checks
  if (values.quick) {
    values['skip-lint'] = true;
    values['skip-typecheck'] = true;
    values['skip-tests'] = true;
  }
  
  return { ...values, commitMessage };
}

/**
 * Display help information
 */
function showHelp() {
  const colors = logger.getColors();
  
  logger.info(`
${colors.cyan.bold}Firebase Production Deployment Workflow${colors.reset}

This script orchestrates the entire workflow for production deployments.

${colors.bold}Usage:${colors.reset}
  node scripts/deploy.js [options] "Commit message"

${colors.bold}Options:${colors.reset}
  ${colors.green}Quality Checks:${colors.reset}
  --quick               Skip all checks (linting, type checking, tests)
  --skip-lint           Skip linting checks
  --skip-typecheck      Skip TypeScript type checking
  --skip-tests          Skip running tests
  --skip-build          Skip building the application
  
  ${colors.green}Deployment Options:${colors.reset}
  --skip-git            Skip Git operations (commit, push, tag)
  
  ${colors.green}Logging Options:${colors.reset}
  --save-logs           Save console output to log file
  --verbose             Enable verbose logging
  
  ${colors.green}Other Options:${colors.reset}
  --help                Show this help message

${colors.bold}Examples:${colors.reset}
  ${colors.blue}# Full workflow with all checks${colors.reset}
  node scripts/deploy.js "Fix navigation bug"

  ${colors.blue}# Quick deployment without checks${colors.reset}
  node scripts/deploy.js --quick "Hotfix for login issue"

  ${colors.blue}# Skip tests but run other checks${colors.reset}
  node scripts/deploy.js --skip-tests "Minor UI adjustments"
  `);
}

/**
 * Verify authentication and prerequisites
 * @returns {Promise<boolean>} - Whether authentication checks passed
 */
async function verifyAuthentication() {
  logger.sectionHeader('Verifying Authentication');
  
  // Check for authentication using the auth manager
  const authResult = await verifyAuth();
  
  if (authResult.success) {
    logger.success('Authentication verified successfully');
    return true;
  } else {
    logger.error('Authentication failed:');
    for (const [service, result] of Object.entries(authResult.services)) {
      if (!result.authenticated) {
        logger.error(`- ${service}: ${result.error || 'Not authenticated'}`);
      }
    }
    
    // Provide help for fixing auth issues
    if (!authResult.services.firebase?.authenticated) {
      logger.info('To authenticate with Firebase, run: firebase login');
    }
    
    if (!authResult.services.github?.authenticated) {
      logger.info('To configure Git, ensure your name and email are set:');
      logger.info('  git config --global user.name "Your Name"');
      logger.info('  git config --global user.email "your.email@example.com"');
    }
    
    return false;
  }
}

/**
 * Run quality checks (lint, type check, tests)
 * @param {Object} args - Command line arguments
 * @returns {Promise<boolean>} - Whether all enabled checks passed
 */
async function runQualityChecks(args) {
  logger.sectionHeader('Running Quality Checks');
  
  // Define which tests to run based on args
  const tests = [
    {
      name: 'Linting',
      command: 'pnpm run lint',
      help: 'This makes sure your code follows good practices and style guidelines.'
    },
    {
      name: 'Type Checking',
      command: 'pnpm run typecheck',
      help: 'This verifies that your TypeScript types are correct.'
    },
    {
      name: 'Unit Tests',
      command: 'pnpm run test',
      help: 'This runs automated tests to verify your code works as expected.'
    }
  ];
  
  // If no tests to run, return success
  if (tests.length === 0) {
    logger.info('All quality checks skipped');
    return true;
  }
  
  // Run the tests
  const testResults = await runTests(tests, {
    stopOnFailure: true,
    verbose: args.verbose
  });
  
  if (testResults.success) {
    logger.success('All quality checks passed!');
  } else {
    logger.error('Some quality checks failed');
  }
  
  return testResults.success;
}

/**
 * Build the application for production
 * @param {Object} args - Command line arguments
 * @returns {Promise<boolean>} - Whether the build succeeded
 */
async function buildApplication(args) {
  if (args['skip-build']) {
    logger.info('Skipping build');
    return true;
  }
  
  logger.sectionHeader('Building Application for Production');
  
  // Get config options
  const buildConfig = config.getBuildConfig();
  const buildScript = buildConfig.productionScript || 'build:all';
  const buildEnv = environment.generateDeploymentEnv({
    envType: 'production',
    additionalVars: buildConfig.productionEnv || {}
  });
  
  // Run the build
  const buildResult = await buildPackages.runBuild({
    buildScript,
    envType: 'production',
    clean: true,
    buildDir: config.getFirebaseConfig().buildDir || 'build',
    env: buildEnv,
    verbose: args.verbose
  });
  
  if (buildResult.success) {
    // Get build size info
    const sizeInfo = buildPackages.getBuildSize({
      buildDir: config.getFirebaseConfig().buildDir || 'build'
    });
    
    if (sizeInfo.success) {
      logger.info(`Build size: ${sizeInfo.formattedSize}`);
    }
    
    logger.success('Production build successful!');
    return true;
  } else {
    logger.error(`Build failed: ${buildResult.error}`);
    return false;
  }
}

/**
 * Perform Git operations (add, commit, push, tag)
 * @param {Object} args - Command line arguments
 * @returns {Promise<boolean>} - Whether Git operations succeeded
 */
async function performGitOperations(args) {
  if (args['skip-git']) {
    logger.info('Skipping Git operations');
    return true;
  }
  
  if (!args.commitMessage) {
    logger.error('No commit message provided. Git operations require a commit message.');
    logger.info('Usage: node scripts/deploy.js "Your commit message"');
    return false;
  }
  
  logger.sectionHeader('Performing Git Operations');
  
  try {
    // Add all changed files
    logger.info('Adding files to Git');
    await commandRunner.runCommand('git add .', { 
      captureOutput: false, 
      logOutput: args.verbose 
    });
    
    // Commit changes
    logger.info(`Committing changes: "${args.commitMessage}"`);
    const commitResult = await commandRunner.runCommand(
      `git commit -m "${args.commitMessage.replace(/"/g, '\\"')}"`, 
      { captureOutput: true }
    );
    
    // Check if anything was committed
    if (commitResult.output.includes('nothing to commit')) {
      logger.warn('No changes to commit');
    } else {
      // Push to remote
      logger.info('Pushing changes to remote repository');
      await commandRunner.runCommand('git push', { 
        captureOutput: false, 
        logOutput: args.verbose 
      });
      
      // Create a version tag based on package.json version
      try {
        // Use fs instead of dynamic import to read package.json
        const fs = await import('fs');
        const path = await import('path');
        const packageJsonPath = path.resolve(process.cwd(), 'package.json');
        
        if (fs.existsSync(packageJsonPath)) {
          const packageJsonContent = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          const version = packageJsonContent.version;
          
          if (version) {
            const tagName = `v${version}`;
            logger.info(`Creating Git tag: ${tagName}`);
            
            // Check if tag already exists
            const tagExists = await commandRunner.runCommand(`git tag -l "${tagName}"`, { 
              captureOutput: true 
            });
            
            if (tagExists.output.trim() === tagName) {
              logger.warn(`Tag ${tagName} already exists - skipping tag creation`);
            } else {
              // Create and push tag
              await commandRunner.runCommand(`git tag -a "${tagName}" -m "Version ${version}"`, { 
                captureOutput: false, 
                logOutput: args.verbose 
              });
              
              await commandRunner.runCommand(`git push origin "${tagName}"`, { 
                captureOutput: false, 
                logOutput: args.verbose 
              });
              
              logger.success(`Created and pushed tag: ${tagName}`);
            }
          }
        } else {
          logger.warn(`Could not find package.json at ${packageJsonPath}`);
        }
      } catch (error) {
        logger.warn(`Could not create version tag: ${error.message}`);
      }
    }
    
    logger.success('Git operations completed successfully');
    return true;
  } catch (error) {
    logger.error(`Git operations failed: ${error.message}`);
    return false;
  }
}

/**
 * Deploy to Firebase production
 * @param {Object} args - Command line arguments
 * @returns {Promise<boolean>} - Whether the deployment succeeded
 */
async function deployProduction(args) {
  logger.sectionHeader('Deploying to Production');
  
  // Get Firebase config
  const firebaseConfig = config.getFirebaseConfig();
  const { projectId, site, buildDir = 'build' } = firebaseConfig;
  
  // Show deployment details
  logger.info(`Deploying to Firebase production`);
  logger.info(`Project: ${projectId}`);
  logger.info(`Site: ${site}`);
  logger.info(`Build directory: ${buildDir}`);
  
  // Create deployment message
  let message = 'Production deployment';
  if (args.commitMessage) {
    message = `Production deployment: ${args.commitMessage}`;
  }
  
  // Deploy to Firebase hosting
  const deployResult = await deployToFirebase({
    projectId,
    site,
    buildDir,
    message,
    skipBuild: true,  // Always skip build in the deployment function since we already built
  });
  
  if (deployResult.success) {
    logger.success(`Production deployment successful!`);
    
    // Log live URL
    if (deployResult.url) {
      logger.info(`Live URL: ${deployResult.url}`);
    }
    
    return true;
  } else {
    logger.error(`Deployment failed: ${deployResult.error}`);
    return false;
  }
}

/**
 * Main deployment function
 */
async function deploy(args) {
  const state = workflowState.getInstance();
  const startTime = Date.now();
  
  try {
    // Initialize state and monitoring
    state.startOperation('deploy');
    performanceMonitor.startOperation('deploy');
    progressTracker.initProgress(5, 'Production Deployment');
    
    // Show help and exit if requested
    if (args.help) {
      showHelp();
      return 0;
    }

    // Verify authentication
    progressTracker.startStep('Authentication');
    const authResult = await verifyAuthentication();
    if (!authResult) {
      throw new Error('Authentication failed');
    }
    progressTracker.completeStep(true, 'Authentication verified');
    
    // Run quality checks if not skipped
    if (!args.quick) {
      progressTracker.startStep('Quality Checks');
      const checksResult = await runQualityChecks(args);
      if (!checksResult) {
        throw new Error('Quality checks failed');
      }
      progressTracker.completeStep(true, 'Quality checks passed');
    } else {
      progressTracker.startStep('Quality Checks (Skipped)');
      progressTracker.completeStep(true, 'Quality checks skipped (quick mode)');
    }

    // Build application if not skipped
    if (!args['skip-build']) {
      progressTracker.startStep('Build');
      const buildResult = await buildApplication(args);
      if (!buildResult) {
        throw new Error('Build failed');
      }
      progressTracker.completeStep(true, 'Build completed');
    } else {
      progressTracker.startStep('Build (Skipped)');
      progressTracker.completeStep(true, 'Build skipped');
    }

    // Deploy to Firebase
    progressTracker.startStep('Firebase Deployment');
    const deployResult = await deployProduction(args);
    if (!deployResult) {
      throw new Error('Firebase deployment failed');
    }
    progressTracker.completeStep(true, 'Deployed to Firebase');

    // Handle Git operations if not skipped
    if (!args['skip-git']) {
      progressTracker.startStep('Git Operations');
      const gitResult = await performGitOperations(args);
      if (!gitResult) {
        throw new Error('Git operations failed');
      }
      progressTracker.completeStep(true, 'Git operations completed');
    } else {
      progressTracker.startStep('Git Operations (Skipped)');
      progressTracker.completeStep(true, 'Git operations skipped');
    }

    // Complete deployment
    const duration = Date.now() - startTime;
    state.completeOperation('deploy', {
      success: true,
      duration,
      metrics: performanceMonitor.getPerformanceSummary()
    });
    
    progressTracker.finishProgress(true, 'Deployment completed successfully');
    logger.success(`Deployment completed in ${formatDuration(duration)}`);
    return 0;

  } catch (error) {
    const duration = Date.now() - startTime;
    state.completeOperation('deploy', {
      success: false,
      duration,
      error: error.message
    });
    
    progressTracker.finishProgress(false, `Deployment failed: ${error.message}`);
    logger.error('Deployment failed:', error.message);
    
    // Handle different error types
    if (error instanceof errorHandler.ValidationError) {
      logger.error('Validation error:', error.message);
    } else if (error instanceof errorHandler.DeploymentError) {
      logger.error('Deployment error:', error.message);
    }
    
    return 1;
  }
}

/**
 * Format duration in milliseconds to human readable string
 * @param {number} milliseconds - Duration in milliseconds
 * @returns {string} - Formatted duration
 */
function formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes === 0) {
    return `${seconds} seconds`;
  }
  
  return `${minutes} minute${minutes !== 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
}

/**
 * Main function that runs the complete workflow
 */
async function main() {
  // Parse command line arguments
  const args = parseArguments();
  
  // Check for commit message when not skipping Git
  if (!args['skip-git'] && !args.commitMessage) {
    logger.error('No commit message provided');
    logger.info('Usage: node scripts/deploy.js "Your commit message"');
    showHelp();
    return 1;
  }
  
  // Enable verbose logging if specified
  if (args.verbose) {
    logger.setLevel('debug');
  }
  
  // Start log file if requested
  if (args['save-logs']) {
    const logFile = logger.startFileLogging('deploy');
    logger.info(`Saving logs to: ${logFile}`);
  }
  
  try {
    // Run the deployment
    const result = await deploy(args);
    
    // Stop log file if it was started
    if (args['save-logs']) {
      logger.stopFileLogging();
    }
    
    process.exit(result);
  } catch (error) {
    logger.error(`Error in deployment workflow:`);
    logger.error(error.message);
    logger.error(error.stack);
    process.exit(1);
  }
}

// Execute main function
main(); 