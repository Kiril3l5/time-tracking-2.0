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
  let validatorResult = null; // Store the full validator result
  
  if (validator && typeof validator === 'function') {
    try {
      validatorResult = validator(result.output, result); // Capture the validator result
      valid = validatorResult.valid !== false; // If not explicitly false, consider valid
      validationError = validatorResult.error;
    } catch (error) {
      valid = false;
      validationError = `Validator function threw an error: ${error.message}`;
      // Store the error in validatorResult as well for consistency
      validatorResult = { valid: false, error: validationError }; 
    }
  } else {
    // Default validation: command success
    valid = result.success;
    // Set a default validatorResult for steps without a custom validator
    validatorResult = { valid }; 
  }
  
  if (valid) {
    logger.success(`✓ Test passed: ${name} (${elapsedTime}s)`);
    return {
      name,
      success: true,
      elapsed: elapsedTime,
      output: result.output,
      command,
      validatorResult // Include the validator result
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
      command,
      validatorResult // Include the validator result even on failure
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
  let allPassed = true;
  const startTime = Date.now();
  let coverageResult = null; // Variable to store coverage result
  
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    // Use simple logging instead of progressTracker steps for sub-tasks
    logger.info(`  Running sub-check: ${test.name}...`); 
    
    const result = await runTest({
      ...test,
      verbose
    });
    
    results.push(result);

    // Determine success: Use command success primarily. Validator success is secondary.
    let stepPassed = result.success;
    let stepMessage = `${test.name} ${stepPassed ? 'passed' : 'failed'}`;

    // Special handling for Test Coverage step
    if (test.name === 'Test Coverage') {
      if (result.success && result.validatorResult?.coverage !== undefined && result.validatorResult?.coverage !== null) {
        // Command succeeded AND coverage was parsed
        coverageResult = result.validatorResult.coverage;
        stepPassed = true; // Ensure it's marked as passed
        stepMessage = `${test.name} passed (Coverage: ${coverageResult.toFixed(2)}%)`;
        logger.debug(`  Captured test coverage: ${coverageResult.toFixed(2)}%`);
      } else if (result.success) {
        // Command succeeded BUT coverage wasn't parsed by validator
        stepPassed = true; // Mark as passed but log a warning
        stepMessage = `${test.name} passed (Coverage value not parsed)`;
        logger.warn(`  Test Coverage step completed but did not parse coverage value.`);
      } else {
        // Command itself failed (e.g., the Vitest crash)
        stepPassed = false;
        stepMessage = `${test.name} failed (Command execution error)`;
        logger.error(`  Test Coverage command failed: ${result.error}`);
      }
    } else if (!result.success) {
        // Standard handling for other failed tests
        stepPassed = false; 
        // Error details are logged within runTest, just update summary message
        stepMessage = `${test.name} failed`; 
        logger.error(`  Sub-check failed: ${test.name}`); // Log failure
    } else {
        // Log success for other steps
        logger.info(`  Sub-check passed: ${test.name}`);
    }

    // Update overall status but DO NOT use progressTracker.completeStep here
    if (!stepPassed) {
      allPassed = false; 
      // Only stop if stopOnFailure is true
      if (stopOnFailure) {
        logger.warn('Stopping test suite execution due to failure');
        break; // Exit loop
      }
    }
    // Removed progressTracker.completeStep calls
  }
  
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  
  const summary = {
    success: allPassed,
    totalTests: tests.length,
    passedTests: results.filter(r => r.success).length,
    failedTests: results.filter(r => !r.success).length,
    duration,
    results,
    coverage: coverageResult // Add coverage to the summary
  };
  
  // Finish progress tracking with the final status
  // This should be handled by the calling function (e.g., qualityChecker)
  // progressTracker.finishProgress(allPassed, allPassed ? 
  //  `All tests passed in ${duration.toFixed(1)}s` : 
  //  `Some tests failed (${summary.failedTests}/${summary.totalTests})`
  // );
  
  // Log the overall test suite result
  logger.info(`Test suite finished in ${duration.toFixed(1)}s. Overall success: ${allPassed}`);
  
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
 * @param {boolean} [options.skipTests=false] - Whether to skip unit tests and coverage
 * @param {boolean} [options.autoFixTypescript=false] - Whether to auto-fix TypeScript errors
 * @param {boolean} [options.fixQueryTypes=false] - Whether to fix React Query types
 * @returns {Object} - Test results, including coverage if run
 */
export async function runStandardTests(options = {}) {
  const {
    verbose = false,
    stopOnFailure = true,
    skipLint = false,
    skipTypecheck = false,
    skipTests = false, // This flag now skips both unit tests and coverage
    autoFixTypescript = false, // Keep the option but remove the call
    fixQueryTypes = false // Keep the option but remove the call
  } = options;
  
  // If all checks are skipped, return early
  if (skipLint && skipTypecheck && skipTests) {
    logger.info('All quality checks skipped');
    return {
      success: true,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      duration: 0,
      results: [],
      coverage: null // Ensure coverage is null when skipped
    };
  }
  
  const tests = [];
  
  if (!skipLint) {
    tests.push({
      name: 'ESLint Check',
      command: 'pnpm run lint'
      // No validator needed, runTest uses command success status
    });
  }
  
  if (!skipTypecheck) {
    tests.push({
      name: 'TypeScript Type Check',
      command: 'pnpm run typecheck'
      // No validator needed, runTest uses command success status
    });
  }
  
  // Only add Unit Tests and Coverage if skipTests is false
  if (!skipTests) {
    tests.push({
      name: 'Unit Tests',
      command: 'pnpm run test', // Keep running unit tests separately
      validator: (_output) => {
        // Basic validator for test output - look for failure indicators
        const hasFailures = /failed|failure|error/i.test(_output);
        return {
          valid: !hasFailures,
          error: hasFailures ? 'Test failures detected' : null
        };
      }
    });
    
    // Add coverage test that will capture coverage metrics
    tests.push({
      name: 'Test Coverage',
      command: 'pnpm run test:coverage',
      validator: (output) => {
        let coverageRan = false;
        let coverageValue = null;
        const finalCoveragePath = path.join(process.cwd(), 'coverage', 'coverage-final.json');
        let errorMsg = 'Coverage output file not found or empty';

        try {
          if (fs.existsSync(finalCoveragePath)) {
            const stats = fs.statSync(finalCoveragePath);
            if (stats.size > 10) {
              coverageRan = true;
              logger.debug('Coverage ran: Found coverage-final.json with content.');

              // Updated Regex for Vitest v1.6.1 output (allowing leading spaces)
              // Looks for the line starting with potentially spaces then "All files" and captures the first number after the pipe
              const coverageSummaryRegex = /^\s*All files\s*\|\s*([\d.]+)/m;
              const match = output.match(coverageSummaryRegex);
              if (match && match[1]) {
                coverageValue = parseFloat(match[1]);
                logger.debug(`Parsed coverage value: ${coverageValue}%`);
                errorMsg = null; // Clear error if value is parsed
              } else {
                logger.warn('Coverage file found, but could not parse percentage from output summary (regex mismatch).');
                logger.debug(`Coverage Output Snippet:\n${output.substring(0, 500)}`); // Log beginning of output
                errorMsg = 'Could not parse coverage percentage from output';
              }
            } else {
               logger.warn('Coverage ran: Found coverage-final.json but it seems empty.');
               errorMsg = 'Coverage output file is empty';
            }
          } else {
            logger.warn(`Coverage did not run or output file not found at: ${finalCoveragePath}`);
            errorMsg = 'Coverage output file not found';
          }
        } catch (error) {
          logger.error(`Error checking/parsing coverage: ${error.message}`);
          errorMsg = `Error accessing coverage data: ${error.message}`;
          coverageRan = false; // Mark as not run if there was an access error
        }
        
        return {
          valid: coverageRan && coverageValue !== null, // Valid only if ran AND value was parsed
          coverage: coverageValue, // Parsed coverage percentage or null
          error: errorMsg // Detailed error message
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
      results: [],
      coverage: null // Ensure coverage is null when no tests run
    };
  }
  
  // This now returns the summary object which includes the 'coverage' field
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