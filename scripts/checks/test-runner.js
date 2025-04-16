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
 * @returns {Object} - Test suite results including parsed unit test counts and coverage
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
  let coverageResult = null;
  let firstError = null;
  let totalUnitTestsRun = 0;
  let totalUnitTestsPassed = 0;
  
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    logger.info(`  Running sub-check: ${test.name}...`); 
    
    const result = await runTest({ ...test, verbose });
    results.push(result);

    let stepPassed = result.success;
    if (result.validatorResult && result.validatorResult.valid === false) {
        stepPassed = false;
    }

    if (test.name === 'Unit Tests' && result.validatorResult) {
      totalUnitTestsRun = result.validatorResult.unitTestsTotal ?? 0;
      totalUnitTestsPassed = result.validatorResult.unitTestsPassed ?? 0;
      logger.debug(`Captured unit test counts: Passed=${totalUnitTestsPassed}, Total=${totalUnitTestsRun}`);
    }
    
    if (test.name === 'Test Coverage') {
      if (stepPassed && result.validatorResult?.coverage !== undefined && result.validatorResult?.coverage !== null) {
        coverageResult = result.validatorResult.coverage;
        logger.debug(`  Captured test coverage: ${coverageResult.toFixed(2)}%`);
      } else if (stepPassed) {
        logger.warn(`  Test Coverage step completed but did not parse coverage value.`);
        coverageResult = null;
      } else {
        logger.error(`  Test Coverage command failed: ${result.error}`);
        coverageResult = null;
      }
      stepPassed = result.success; 
    } 
    
    if (!stepPassed) {
      allPassed = false; 
      if (!firstError) {
          firstError = result.error || `${test.name} failed without specific error message`;
      }
      logger.error(`  Sub-check failed: ${test.name} - Error: ${result.error || 'N/A'}`); 
      if (stopOnFailure) {
        logger.warn('Stopping test suite execution due to failure');
        break; 
      }
    } else {
        logger.info(`  Sub-check passed: ${test.name}`);
    }
  }
  
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  
  const summary = {
    success: allPassed,
    totalSteps: tests.length,
    passedSteps: results.filter(r => r.success).length,
    failedSteps: results.filter(r => !r.success).length,
    duration,
    results,
    coverage: coverageResult,
    error: allPassed ? null : firstError,
    unitTests: {
        passed: totalUnitTestsPassed,
        total: totalUnitTestsRun,
        files: results.find(r => r.name === 'Unit Tests')?.validatorResult?.testFiles || []
    }
  };
  
  logger.info(`Test suite finished in ${duration.toFixed(1)}s. Overall success: ${allPassed}`);
  logger.debug(`runTests summary: ${JSON.stringify(summary)}`);
  
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
    skipTests = false,
    autoFixTypescript = false,
    fixQueryTypes = false
  } = options;
  
  if (skipLint && skipTypecheck && skipTests) {
    logger.info('All quality checks skipped');
    return {
      success: true,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      duration: 0,
      results: [],
      coverage: null
    };
  }
  
  const tests = [];
  
  if (!skipLint) {
    tests.push({
      name: 'ESLint Check',
      command: 'pnpm run lint'
    });
  }
  
  if (!skipTypecheck) {
    tests.push({
      name: 'TypeScript Type Check',
      command: 'pnpm run typecheck'
    });
  }
  
  if (!skipTests) {
    tests.push({
      name: 'Unit Tests',
      command: 'pnpm run test',
      validator: (output, _result) => {
        let unitTestsPassed = 0;
        let unitTestsTotal = 0;
        let error = null;
        let valid = false;
        let testFiles = [];
        
        if (_result.success) {
          // Extract test files and their test counts
          const testFileMatches = output.matchAll(/✓\s+([\w/.\\-]+)\s+\((\d+)\)/g);
          if (testFileMatches) {
            for (const match of testFileMatches) {
              if (match.length >= 3) {
                const testFile = match[1];
                const testCount = parseInt(match[2], 10);
                if (!isNaN(testCount)) {
                  testFiles.push({ file: testFile, count: testCount });
                  unitTestsTotal += testCount;
                  unitTestsPassed += testCount; // All are passed since they have a ✓
                }
              }
            }
          }
          
          // Fallback to overall count if we couldn't parse individual files
          if (testFiles.length === 0) {
            const match = output.match(/Test Files\s+(\d+).+Tests\s+(\d+)\s+passed/);
            if (match && match.length >= 3) {
              unitTestsPassed = parseInt(match[2], 10);
              unitTestsTotal = parseInt(match[2], 10);
              if (!isNaN(unitTestsPassed) && !isNaN(unitTestsTotal)) {
                  valid = true;
                  logger.debug(`Parsed unit test results: ${unitTestsPassed}/${unitTestsTotal}`);
              } else {
                  error = 'Failed to parse test count numbers from output';
                  logger.warn(`Could not parse numbers from Vitest output: ${match[0]}`);
              }
            } else {
              if (/failed|failure|error/i.test(output)) {
                  error = 'Test failures reported in output despite command success';
                  logger.warn('Command succeeded, but output contains failure indicators.');
              } else {
                   valid = true; 
                   error = 'Could not parse specific test counts from Vitest output';
                   logger.warn(error);
              }
            }
          } else {
            valid = true;
            logger.debug(`Parsed ${testFiles.length} test files with ${unitTestsTotal} total tests`);
          }
        } else {
          error = _result.error || 'Unit test command failed to execute';
          valid = false;
        }

        return {
          valid: valid,
          error: error,
          unitTestsPassed: unitTestsPassed, 
          unitTestsTotal: unitTestsTotal,
          testFiles: testFiles
        };
      }
    });
    
    tests.push({
      name: 'Test Coverage',
      command: 'pnpm run test:coverage',
      validator: (_output, _result) => {
        let coverageValue = null;
        const summaryPath = path.join(process.cwd(), 'coverage', 'coverage-final.json');
        let errorMsg = null;
        let coverageFileFound = false;

        try {
          if (fs.existsSync(summaryPath)) {
            coverageFileFound = true;
            const summaryContent = fs.readFileSync(summaryPath, 'utf8');
            const summaryData = JSON.parse(summaryContent);
            
            // Parse coverage from coverage-final.json format (different structure than summary.json)
            if (summaryData) {
              // Calculate overall statement coverage from all files
              let totalStatements = 0;
              let coveredStatements = 0;
              
              Object.values(summaryData).forEach(fileData => {
                if (fileData.statementMap && fileData.s) {
                  const statementsCount = Object.keys(fileData.statementMap).length;
                  const coveredCount = Object.values(fileData.s).filter(v => v > 0).length;
                  
                  totalStatements += statementsCount;
                  coveredStatements += coveredCount;
                }
              });
              
              // Calculate percentage
              if (totalStatements > 0) {
                coverageValue = (coveredStatements / totalStatements) * 100;
                logger.debug(`Parsed coverage from ${summaryPath}: ${coverageValue.toFixed(2)}%`);
                logger.debug(`Coverage details: ${coveredStatements}/${totalStatements} statements`);
              } else {
                logger.warn(`Found coverage file but no statements to measure`);
                errorMsg = 'No statements to measure coverage';
                coverageValue = 0; // Set to 0 instead of null to indicate empty but valid coverage
              }
            } else {
              logger.warn(`${summaryPath} has unexpected structure.`);
              errorMsg = 'Invalid structure in coverage-final.json';
            }
          } else {
            logger.warn(`Coverage file not found at: ${summaryPath}`);
            errorMsg = 'Coverage file not found';
            if (_result.success) {
                logger.warn('Test coverage command succeeded but coverage file is missing.');
            } else {
                logger.error('Test coverage command failed AND coverage file is missing.');
            }
          }
        } catch (error) {
          logger.error(`Error reading/parsing coverage file ${summaryPath}: ${error.message}`);
          errorMsg = `Error accessing coverage data: ${error.message}`;
          coverageFileFound = false;
        }
        
        const commandSucceeded = _result.success;
        const coverageParsed = coverageFileFound && coverageValue !== null;
        const isValid = commandSucceeded && coverageParsed;

        if (!commandSucceeded) {
           errorMsg = _result.error || 'Test coverage command failed';
        }

        return {
          valid: isValid,
          coverage: coverageValue,
          error: errorMsg
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
      coverage: null
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
      
      const hasVitest = pkgJson.devDependencies?.vitest;
      const hasTestingLibrary = pkgJson.devDependencies?.['@testing-library/react'];
      
      if (!hasVitest) {
        issues.push(`${pkg}: Missing Vitest`);
      }
      if (!hasTestingLibrary) {
        issues.push(`${pkg}: Missing React Testing Library`);
      }

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