#!/usr/bin/env node

/**
 * Preview Check Script
 * 
 * Performs pre-deployment checks and validations before preview deployment.
 * Ensures code quality and build success before deploying to preview environments.
 * 
 * Usage:
 *   node scripts/preview/preview-check.js [options]
 * 
 * Options:
 *   --skip-lint      Skip linting checks
 *   --skip-types     Skip TypeScript type checks
 *   --skip-tests     Skip running tests
 *   --skip-build     Skip building the application
 *   --verbose        Enable verbose logging
 * 
 * Examples:
 *   node scripts/preview/preview-check.js
 *   node scripts/preview/preview-check.js --skip-tests --verbose
 * 
 * @module preview/preview-check
 */

import * as core from './core.js';
import { parseArgs } from 'node:util';
import path from 'path';

/* global process */

// Parse command line arguments
function parseArguments() {
  const options = {
    'skip-lint': { type: 'boolean', default: false },
    'skip-types': { type: 'boolean', default: false },
    'skip-tests': { type: 'boolean', default: false },
    'skip-build': { type: 'boolean', default: false },
    verbose: { type: 'boolean', default: false }
  };
  
  const { values } = parseArgs({ options, allowPositionals: false });
  return values;
}

/**
 * Run linting checks
 * @returns {Promise<boolean>} Whether linting passed
 */
async function runLintChecks() {
  core.logger.info('Running lint checks...');
  core.progressTracker.startStep('Linting');
  
  try {
    const lintCommand = 'pnpm run lint';
    const result = await core.commandRunner.runCommand(lintCommand, { ignoreError: true });
    
    if (result.success) {
      core.logger.success('Lint checks passed!');
      core.progressTracker.completeStep('Linting', true, 'All lint checks passed');
      return true;
    } else {
      core.logger.error('Lint checks failed');
      core.logger.error(result.error || 'See above for errors');
      core.progressTracker.completeStep('Linting', false, 'Lint checks failed');
      return false;
    }
  } catch (error) {
    core.logger.error(`Error running lint checks: ${error.message}`);
    core.progressTracker.completeStep('Linting', false, 'Error running lint checks');
    return false;
  }
}

/**
 * Run TypeScript type checks
 * @returns {Promise<boolean>} Whether type checks passed
 */
async function runTypeChecks() {
  core.logger.info('Running TypeScript type checks...');
  core.progressTracker.startStep('Type Checking');
  
  try {
    const typeCheckCommand = 'pnpm run type-check';
    const result = await core.commandRunner.runCommand(typeCheckCommand, { ignoreError: true });
    
    if (result.success) {
      core.logger.success('Type checks passed!');
      core.progressTracker.completeStep('Type Checking', true, 'All type checks passed');
      return true;
    } else {
      core.logger.error('Type checks failed');
      core.logger.error(result.error || 'See above for errors');
      core.progressTracker.completeStep('Type Checking', false, 'Type checks failed');
      return false;
    }
  } catch (error) {
    core.logger.error(`Error running type checks: ${error.message}`);
    core.progressTracker.completeStep('Type Checking', false, 'Error running type checks');
    return false;
  }
}

/**
 * Run tests
 * @returns {Promise<boolean>} Whether tests passed
 */
async function runTests() {
  core.logger.info('Running tests...');
  core.progressTracker.startStep('Testing');
  
  try {
    const testCommand = 'pnpm run test';
    const result = await core.commandRunner.runCommand(testCommand, { ignoreError: true });
    
    if (result.success) {
      core.logger.success('Tests passed!');
      core.progressTracker.completeStep('Testing', true, 'All tests passed');
      return true;
    } else {
      core.logger.error('Tests failed');
      core.logger.error(result.error || 'See above for errors');
      core.progressTracker.completeStep('Testing', false, 'Tests failed');
      return false;
    }
  } catch (error) {
    core.logger.error(`Error running tests: ${error.message}`);
    core.progressTracker.completeStep('Testing', false, 'Error running tests');
    return false;
  }
}

/**
 * Build the application
 * @returns {Promise<boolean>} Whether build succeeded
 */
async function buildApplication() {
  core.logger.info('Building application...');
  core.progressTracker.startStep('Building');
  
  try {
    const buildScript = core.config.buildConfig.script || 'build';
    const buildCommand = `pnpm run ${buildScript}`;
    const result = await core.commandRunner.runCommand(buildCommand, { ignoreError: true });
    
    if (result.success) {
      core.logger.success('Build successful!');
      core.progressTracker.completeStep('Building', true, 'Build completed successfully');
      return true;
    } else {
      core.logger.error('Build failed');
      core.logger.error(result.error || 'See above for errors');
      core.progressTracker.completeStep('Building', false, 'Build failed');
      return false;
    }
  } catch (error) {
    core.logger.error(`Error building application: ${error.message}`);
    core.progressTracker.completeStep('Building', false, 'Error building application');
    return false;
  }
}

/**
 * Main function to run all checks
 */
async function main() {
  try {
    // Parse command line arguments
    const args = parseArguments();
    
    // Initialize progress tracker
    const steps = [];
    if (!args['skip-lint']) steps.push('Linting');
    if (!args['skip-types']) steps.push('Type Checking');
    if (!args['skip-tests']) steps.push('Testing');
    if (!args['skip-build']) steps.push('Building');
    
    core.progressTracker.initProgress(steps.length, 'Preview Checks');
    
    let success = true;
    
    // Run lint checks if not skipped
    if (!args['skip-lint']) {
      const lintSuccess = await runLintChecks();
      success = success && lintSuccess;
    } else {
      core.logger.info('Skipping lint checks');
    }
    
    // Run type checks if not skipped
    if (!args['skip-types']) {
      const typeSuccess = await runTypeChecks();
      success = success && typeSuccess;
    } else {
      core.logger.info('Skipping type checks');
    }
    
    // Run tests if not skipped
    if (!args['skip-tests']) {
      const testSuccess = await runTests();
      success = success && testSuccess;
    } else {
      core.logger.info('Skipping tests');
    }
    
    // Build application if not skipped
    if (!args['skip-build']) {
      const buildSuccess = await buildApplication();
      success = success && buildSuccess;
    } else {
      core.logger.info('Skipping build');
    }
    
    // Finalize and report results
    core.progressTracker.finishProgress(success);
    
    if (success) {
      core.logger.success('All preview checks passed! Ready for deployment.');
      process.exit(0);
    } else {
      core.logger.error('Preview checks failed. Please fix the issues before deploying.');
      process.exit(1);
    }
  } catch (error) {
    core.logger.error(`Error running preview checks: ${error.message}`);
    core.logger.error(error.stack);
    process.exit(1);
  }
}

// Run the main function
main(); 