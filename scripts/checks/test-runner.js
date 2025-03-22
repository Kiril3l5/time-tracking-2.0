#!/usr/bin/env node

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

import * as commandRunner from '../core/command-runner.js';
import * as logger from '../core/logger.js';
import * as progressTracker from '../core/progress-tracker.js';
import * as lintCheck from './lint-check.js';
import * as typescriptCheck from './typescript-check.js';

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
 * @returns {Object} - Test results
 */
export async function runStandardTests(options = {}) {
  const tests = [
    {
      name: 'ESLint Check',
      command: 'pnpm run lint',
      validator: lintCheck.validateLintOutput
    },
    {
      name: 'TypeScript Type Check',
      command: 'pnpm run typecheck',
      validator: typescriptCheck.validateTypeCheckOutput
    },
    {
      name: 'Unit Tests',
      command: 'pnpm run test',
      validator: (output) => {
        // Basic validator for test output - look for failure indicators
        const hasFailures = /failed|failure|error/i.test(output);
        return {
          valid: !hasFailures,
          error: hasFailures ? 'Test failures detected' : null
        };
      }
    }
  ];
  
  return runTests(tests, options);
}

export default {
  runTest,
  runTests,
  runStandardTests
}; 