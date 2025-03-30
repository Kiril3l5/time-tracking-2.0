#!/usr/bin/env node

/* global process */

/**
 * Test Runner Module
 * 
 * Manages test execution with improved output formatting, error handling,
 * and test result validation. Supports various types of tests including
 * linting, type checking, unit tests, etc.
 * 
 * Features:
 * - Run multiple test types
 * - Format test output for readability
 * - Validate test results
 * - Track test execution time
 * 
 * @module checks/test-runner
 */

import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';
import { progressTracker } from '../core/progress-tracker.js';
import { runLintCheck } from './lint-check.js';
import { runTypeScriptCheck } from './typescript-check.js';
import { fixTestDependencies } from '../test-types/test-deps-fixer.js';
import { fixQueryTypes } from '../typescript/query-types-fixer.js';
import { fixTypeScriptIssues } from '../typescript/typescript-fixer.js';
import fs from 'fs';
import path from 'path';

/**
 * Run a test with proper output formatting and error handling
 * 
 * @param {Object} options - Test options
 * @param {string} options.name - Test name/description
 * @param {string} options.command - Command to run
 * @param {boolean} [options.ignoreError=false] - Whether to continue on error
 * @param {boolean} [options.verbose=false] - Whether to show detailed output
 * @param {Function} [options.validator] - Optional function to validate the output
 * @returns {Object} - Test result
 */
export async function runTest(options) {
  const {
    name,
    command,
    ignoreError = false,
    verbose = false,
    validator = null
  } = options;
  
  logger.sectionHeader(`Running test: ${name}`);
  logger.info(`Command: ${command}`);
  
  const startTime = Date.now();
  
  const result = await commandRunner.runCommandAsync(command, {
    ignoreError: true,
    verbose
  });
  
  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
  
  // Run custom validator if provided
  let valid = true;
  let validationError = null;
  
  if (validator && typeof validator === 'function') {
    try {
      const validationResult = validator(result.output, result);
      valid = validationResult.valid !== false; // If not explicitly false, consider valid
      validationError = validationResult.error;
    } catch (error) {
      valid = false;
      validationError = `Validator function threw an error: ${error.message}`;
    }
  } else {
    // Default validation: command success
    valid = result.success;
  }
  
  if (valid) {
    logger.success(`✓ Test passed: ${name} (${elapsedTime}s)`);
    return {
      name,
      success: true,
      elapsed: elapsedTime,
      output: result.output,
      command
    };
  } else {
    const errorMessage = validationError || result.error || 'Test failed';
    logger.error(`✗ Test failed: ${name} (${elapsedTime}s)`);
    logger.error(`Error: ${errorMessage}`);
    
    if (!ignoreError) {
      logger.error('Stopping test execution due to test failure');
    }
    
    return {
      name,
      success: false,
      elapsed: elapsedTime,
      error: errorMessage,
      output: result.output,
      command
    };
  }
}

/**
 * Run a series of tests
 * 
 * @param {Array} tests - Array of test definitions
 * @param {Object} [options] - Run options
 * @param {boolean} [options.stopOnFailure=true] - Whether to stop on first failure
 * @param {boolean} [options.verbose=false] - Whether to show detailed output
 * @returns {Object} - Test suite results
 */
export async function runTests(tests, options = {}) {
  const {
    stopOnFailure = true,
    verbose = false
  } = options;
  
  logger.sectionHeader('Running test suite');
  logger.info(`${tests.length} tests to run` + (stopOnFailure ? ' (stopping on first failure)' : ''));
  
  const results = [];
  // Initialize the progress tracker with the number of tests
  progressTracker.initProgress(tests.length, 'Test Suite Progress');
  
  let allPassed = true;
  const startTime = Date.now();
  
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    progressTracker.startStep(`Running: ${test.name}`);
    
    const result = await runTest({
      ...test,
      verbose
    });
    
    results.push(result);
    
    if (!result.success) {
      allPassed = false;
      logger.error(`Test failed: ${test.name}`);
      progressTracker.completeStep(false, `${test.name} failed`);
      
      // Report detailed error information
      if (result.error) {
        logger.error(`Error: ${result.error}`);
      }
      
      if (stopOnFailure) {
        logger.warn('Stopping test execution due to failure');
        break;
      }
    } else {
      logger.success(`Test passed: ${test.name}`);
      progressTracker.completeStep(true, `${test.name} passed`);
    }
  }
  
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  
  const summary = {
    success: allPassed,
    totalTests: tests.length,
    passedTests: results.filter(r => r.success).length,
    failedTests: results.filter(r => !r.success).length,
    duration,
    results
  };
  
  // Finish progress tracking with the final status
  progressTracker.finishProgress(allPassed, allPassed ? 
    `All tests passed in ${duration.toFixed(1)}s` : 
    `Some tests failed (${summary.failedTests}/${summary.totalTests})`
  );
  
  return summary;
}

/**
 * Run standard pre-deployment tests
 * 
 * @param {Object} [options] - Options
 * @param {boolean} [options.verbose=false] - Whether to show detailed output
 * @param {boolean} [options.stopOnFailure=true] - Whether to stop on first failure
 * @param {boolean} [options.skipLint=false] - Whether to skip linting
 * @param {boolean} [options.skipTypecheck=false] - Whether to skip type checking
 * @param {boolean} [options.skipTests=false] - Whether to skip unit tests
 * @param {boolean} [options.autoFixTypescript=false] - Whether to auto-fix TypeScript errors
 * @param {boolean} [options.fixTestDeps=false] - Whether to fix test dependencies
 * @param {boolean} [options.fixQueryTypes=false] - Whether to fix React Query types
 * @returns {Object} - Test results
 */
export async function runStandardTests(options = {}) {
  const {
    verbose = false,
    stopOnFailure = true,
    skipLint = false,
    skipTypecheck = false,
    skipTests = false,
    autoFixTypescript = false,
    fixTestDeps = false,
    fixQueryTypes = false
  } = options;
  
  // If all tests are skipped, return early
  if (skipLint && skipTypecheck && skipTests) {
    logger.info('All quality checks skipped');
    return {
      success: true,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      duration: 0,
      results: []
    };
  }
  
  // Fix test dependencies if requested
  if (fixTestDeps) {
    logger.info('Attempting to fix test dependencies...');
    const fixResult = await fixTestDependencies();
    if (!fixResult.success) {
      logger.warn('Test dependency fixing failed, continuing with checks');
    }
  }
  
  // Fix React Query types if requested
  if (fixQueryTypes) {
    logger.info('Attempting to fix React Query types...');
    const fixResult = await fixQueryTypes();
    if (!fixResult.success) {
      logger.warn('React Query type fixing failed, continuing with checks');
    }
  }
  
  const tests = [];
  
  if (!skipLint) {
    tests.push({
      name: 'ESLint Check',
      command: 'pnpm run lint',
      validator: runLintCheck.validateLintOutput
    });
  }
  
  if (!skipTypecheck) {
    tests.push({
      name: 'TypeScript Type Check',
      command: 'pnpm run typecheck',
      validator: runTypeScriptCheck.validateTypeCheckOutput,
      onFailure: async (_output) => {
        // If TypeScript check fails and auto-fix is enabled, try to fix
        if (autoFixTypescript) {
          logger.info('TypeScript check failed, attempting to automatically fix errors...');
          const fixResult = await fixTypeScriptIssues({
            targetDirs: ['packages/admin/src', 'packages/common/src', 'packages/hours/src'],
            fix: true,
            verbose: true
          });
          
          if (fixResult.success) {
            logger.success('TypeScript issues fixed automatically!');
            return true;
          } else {
            logger.warn('Automatic TypeScript fixes were only partially successful or unsuccessful');
            logger.info('Consider manually reviewing and fixing remaining TypeScript errors');
          }
        }
        return false;
      }
    });
  }
  
  if (!skipTests) {
    tests.push({
      name: 'Unit Tests',
      command: 'pnpm run test',
      validator: (_output) => {
        // Basic validator for test output - look for failure indicators
        const hasFailures = /failed|failure|error/i.test(_output);
        return {
          valid: !hasFailures,
          error: hasFailures ? 'Test failures detected' : null
        };
      }
    });
  }
  
  if (tests.length === 0) {
    logger.info('No quality checks to run');
    return {
      success: true,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      duration: 0,
      results: []
    };
  }
  
  return runTests(tests, {
    stopOnFailure,
    verbose
  });
}

/**
 * Check test setup across packages
 * @returns {Object} Check result
 */
export async function checkTestSetup() {
  try {
    const packages = ['hours', 'admin', 'common'];
    const issues = [];

    for (const pkg of packages) {
      const pkgJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'packages', pkg, 'package.json'), 'utf8'));
      
      // Check for test dependencies
      const hasVitest = pkgJson.devDependencies?.vitest;
      const hasTestingLibrary = pkgJson.devDependencies?.['@testing-library/react'];
      
      if (!hasVitest) {
        issues.push(`${pkg}: Missing Vitest`);
      }
      if (!hasTestingLibrary) {
        issues.push(`${pkg}: Missing React Testing Library`);
      }

      // Check for test coverage script
      if (!pkgJson.scripts?.['test:coverage']) {
        issues.push(`${pkg}: Missing test coverage script`);
      }
    }

    return {
      name: 'Test Setup',
      status: issues.length === 0 ? 'ok' : 'warning',
      message: issues.length === 0 ? 'Test configuration valid' : issues.join('\n'),
      required: true
    };
  } catch (error) {
    return {
      name: 'Test Setup',
      status: 'error',
      message: 'Failed to check test setup',
      required: false
    };
  }
}

export default {
  runTest,
  runTests,
  runStandardTests,
  checkTestSetup
}; 