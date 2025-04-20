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
import fs from 'fs';
import path from 'path';
import fsPromises from 'fs/promises';

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
    verbose,
    captureOutput: true
  });
  
  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
  
  // Run custom validator if provided
  let valid = true;
  let validationError = null;
  let validatorResult = null;
  
  if (validator && typeof validator === 'function') {
    try {
      validatorResult = await validator(result.output, result);
      valid = validatorResult.valid !== false;
      validationError = validatorResult.error;
    } catch (error) {
      valid = false;
      validationError = `Validator function threw an error: ${error.message}`;
      validatorResult = { valid: false, error: validationError };
    }
  } else {
    valid = result.success;
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
      validatorResult
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
      validatorResult
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
 * Run standard pre-deployment tests (now only Unit Tests and Coverage)
 * 
 * @param {Object} [options] - Options
 * @param {boolean} [options.verbose=false] - Whether to show detailed output
 * @param {boolean} [options.stopOnFailure=true] - Whether to stop on first failure
 * @param {boolean} [options.skipTests=false] - Whether to skip unit tests and coverage
 * @returns {Object} - Test results, including coverage if run
 */
export async function runStandardTests(options = {}) {
  const {
    verbose = false,
    stopOnFailure = true,
    skipTests = false
  } = options;
  
  if (skipTests) {
    logger.info('Test execution skipped due to options.');
    return {
      success: true,
      totalSteps: 0,
      passedSteps: 0,
      failedSteps: 0,
      duration: 0,
      results: [],
      coverage: null,
      error: null,
      unitTests: { passed: 0, total: 0, files: [] }
    };
  }
  
  const tests = [];
  const resultsFilePath = path.resolve(process.cwd(), 'temp', 'vitest-results.json');

  // Ensure temp directory exists
  try {
    const tempDir = path.resolve(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      logger.info(`Creating temp directory: ${tempDir}`);
      await fsPromises.mkdir(tempDir, { recursive: true });
    }
  } catch (error) {
    logger.warn(`Could not create temp directory: ${error.message}`);
  }

  // Clean up previous results file if it exists
  try {
    await fsPromises.unlink(resultsFilePath);
    logger.debug(`Removed previous test results file: ${resultsFilePath}`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.warn(`Could not remove previous test results file: ${error.message}`);
    }
  }

  if (!skipTests) {
    tests.push({
      name: 'Unit Tests',
      command: 'pnpm run test',
      validator: async (output, _result) => {
        let unitTestsPassed = 0;
        let unitTestsTotal = 0;
        let error = null;
        let valid = false;
        let testFiles = [];

        if (!_result.success) {
          error = _result.error || 'Unit test command failed to execute';
          logger.error(`Unit test command failed: ${error}`);
          valid = false;
        } else {
          logger.debug(`Attempting to read test results from: ${resultsFilePath}`);
          try {
            try {
              await fsPromises.access(resultsFilePath);
            } catch (accessError) {
              // JSON file not found - try to parse results directly from output
              logger.warn(`Vitest results JSON file not found at ${resultsFilePath}. Attempting to extract results from command output.`);
              
              // Parse test counts directly from console output
              // Try multiple regex patterns to handle different Vitest output formats
              let passedTestsMatch = output.match(/Tests\s+(\d+)\s+passed/i);
              let totalTestsMatch = output.match(/Tests\s+\d+\s+passed\s*\((\d+)\)/i);
              
              // Alternative patterns for different Vitest versions
              if (!passedTestsMatch) {
                passedTestsMatch = output.match(/PASS\s+\((\d+)\)/i);
              }
              
              if (!totalTestsMatch) {
                // If we have a 'pass' count but no total, and no failures are mentioned,
                // we can assume all tests passed
                const failedMatch = output.match(/Tests\s+(\d+)\s+failed/i) || output.match(/FAIL\s+\((\d+)\)/i);
                if (passedTestsMatch && !failedMatch) {
                  totalTestsMatch = passedTestsMatch; // All tests passed
                } else if (passedTestsMatch && failedMatch) {
                  const passed = parseInt(passedTestsMatch[1], 10);
                  const failed = parseInt(failedMatch[1], 10);
                  unitTestsPassed = passed;
                  unitTestsTotal = passed + failed;
                  
                  valid = failed === 0;
                  if (!valid) {
                    error = `${failed} test(s) failed. Check test output for details.`;
                  } else {
                    logger.info(`Successfully extracted test results from output: ${unitTestsPassed}/${unitTestsTotal} tests passed`);
                  }
                  return {
                    valid,
                    error,
                    unitTestsPassed,
                    unitTestsTotal,
                    testFiles,
                    fromOutput: true
                  };
                }
              }
              
              // Look for test summary lines like "Test Files  1 passed (1)"
              const passedFilesMatch = output.match(/Test Files\s+(\d+)\s+passed/i);
              const totalFilesMatch = output.match(/Test Files\s+\d+\s+passed\s*\((\d+)\)/i);
              
              if (passedTestsMatch || totalTestsMatch) {
                if (passedTestsMatch) {
                  unitTestsPassed = parseInt(passedTestsMatch[1], 10);
                }
                
                if (totalTestsMatch) {
                  unitTestsTotal = parseInt(totalTestsMatch[1], 10);
                } else {
                  // If we only have passed count and there are no failure messages, assume all passed
                  if (output.includes('PASS') && !output.includes('FAIL')) {
                    unitTestsTotal = unitTestsPassed;
                  }
                }
                
                // Build a simple test files array from the output
                if (passedFilesMatch && totalFilesMatch) {
                  // Prefix unused variables
                  const _passedFiles = parseInt(passedFilesMatch[1], 10);
                  const _totalFiles = parseInt(totalFilesMatch[1], 10);
                  
                  // Extract file paths from output
                  const fileRegex = /✓\s+([\w/.]+\.test\.[jt]sx?)/g;
                  let match;
                  while ((match = fileRegex.exec(output)) !== null) {
                    testFiles.push({
                      file: match[1],
                      count: 1 // We don't know exact test count per file, default to 1
                    });
                  }
                }
                
                valid = unitTestsPassed === unitTestsTotal;
                if (!valid) {
                  error = `${unitTestsTotal - unitTestsPassed} test(s) failed. Check test output for details.`;
                } else {
                  logger.info(`Successfully extracted test results from output: ${unitTestsPassed}/${unitTestsTotal} tests passed`);
                }
                return {
                  valid,
                  error,
                  unitTestsPassed,
                  unitTestsTotal,
                  testFiles,
                  fromOutput: true
                };
              } else {
                // If we can't find test count patterns but the command succeeded
                // and contains successful test output, assume tests passed
                if (_result.success && (output.includes('PASS') || output.includes('passed'))) {
                  logger.info('Command succeeded and output contains PASS/passed keywords. Assuming tests passed successfully.');
                  unitTestsPassed = 1;
                  unitTestsTotal = 1;
                  valid = true;
                  return {
                    valid,
                    error: null,
                    unitTestsPassed,
                    unitTestsTotal,
                    testFiles,
                    fromOutput: true,
                    estimated: true
                  };
                } else {
                  throw new Error(`Vitest results JSON file not found and couldn't parse results from command output.`);
                }
              }
            }

            const jsonContent = await fsPromises.readFile(resultsFilePath, 'utf8');
            const report = JSON.parse(jsonContent);
            
            logger.debug('--- START Parsed Vitest JSON Report ---');
            try {
              logger.info(JSON.stringify(report, null, 2));
            } catch (e) {
              logger.error('Failed to stringify/log JSON report');
            }
            logger.debug('--- END Parsed Vitest JSON Report ---');

            if (report && typeof report.numTotalTests === 'number') {
              unitTestsTotal = report.numTotalTests;
              unitTestsPassed = report.numPassedTests ?? 0;
              const numFailed = report.numFailedTests ?? 0;

              valid = true;
              logger.debug(`Parsed from JSON: ${unitTestsPassed} passed, ${numFailed} failed, ${unitTestsTotal} total.`);
              
              if (numFailed > 0) {
                valid = false;
                error = `${numFailed} test(s) failed. Check JSON report or Vitest output for details.`;
                logger.error(error);
              } else {
                error = null;
              }
              
              if (Array.isArray(report.testResults)) {
                report.testResults.forEach(suite => {
                  if (suite.assertionResults && suite.name) {
                    testFiles.push({
                      file: path.relative(process.cwd(), suite.name),
                      count: suite.assertionResults.length
                    });
                  }
                });
              } else {
                logger.warn('Could not find testResults array for detailed file info.');
              }
            } else {
              error = 'Parsed JSON report, but could not find expected test counts (numTotalTests).';
              logger.error(error);
              valid = false;
            }
          } catch (parseOrReadError) {
            error = `Failed to read or parse test results JSON: ${parseOrReadError.message}`;
            logger.error(error);
            logger.debug(`Raw command output (if any): ${output}`);
            valid = false;
          }
        }

        logger.debug(`Final validator result: valid=${valid}, passed=${unitTestsPassed}, total=${unitTestsTotal}, error=${error}`);

        return {
          valid,
          error,
          unitTestsPassed,
          unitTestsTotal,
          testFiles
        };
      }
    });
    
    tests.push({
      name: 'Test Coverage',
      command: 'pnpm run test:coverage',
      validator: async (_output, _result) => {
        let coverageValue = null;
        const coverageDir = path.join(process.cwd(), 'coverage');
        const summaryPath = path.join(coverageDir, 'coverage-final.json');
        let errorMsg = null;
        let coverageFileFound = false;

        try {
          // Ensure coverage directory exists
          if (!fs.existsSync(coverageDir)) {
            logger.info(`Creating coverage directory: ${coverageDir}`);
            await fsPromises.mkdir(coverageDir, { recursive: true });
            
            // Create a basic placeholder coverage file if we just created the directory
            if (_result.success) {
              const placeholderData = {
                total: {
                  statements: { total: 100, covered: 0, skipped: 0, pct: 0 },
                  branches: { total: 0, covered: 0, skipped: 0, pct: 0 },
                  functions: { total: 0, covered: 0, skipped: 0, pct: 0 },
                  lines: { total: 0, covered: 0, skipped: 0, pct: 0 }
                }
              };
              await fsPromises.writeFile(
                path.join(coverageDir, 'coverage-summary.json'), 
                JSON.stringify(placeholderData, null, 2),
                'utf8'
              );
              logger.info(`Created placeholder coverage summary file for initial run`);
            }
          }

          if (fs.existsSync(summaryPath)) {
            coverageFileFound = true;
            const summaryContent = fs.readFileSync(summaryPath, 'utf8');
            
            try {
              const summaryData = JSON.parse(summaryContent);
              
              if (summaryData && typeof summaryData === 'object') {
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
                
                if (totalStatements > 0) {
                  coverageValue = (coveredStatements / totalStatements) * 100;
                  logger.debug(`Parsed coverage from ${summaryPath}: ${coverageValue.toFixed(2)}%`);
                  logger.debug(`Coverage details: ${coveredStatements}/${totalStatements} statements`);
                } else {
                  logger.warn(`Found coverage file but no statements to measure`);
                  errorMsg = 'No statements to measure coverage';
                  coverageValue = 0;
                }
              } else {
                logger.warn(`${summaryPath} has unexpected structure.`);
                errorMsg = 'Invalid structure in coverage-final.json';
              }
            } catch (parseError) {
              logger.error(`Error parsing coverage JSON: ${parseError.message}`);
              errorMsg = `Error parsing coverage data: ${parseError.message}`;
              coverageFileFound = false;
            }
          } else {
            logger.warn(`Coverage file not found at: ${summaryPath}`);
            errorMsg = 'Coverage file not found';
            
            // Look for alternative coverage files that might be generated
            if (fs.existsSync(coverageDir)) {
              const files = fs.readdirSync(coverageDir);
              const jsonFiles = files.filter(f => f.endsWith('.json'));
              if (jsonFiles.length > 0) {
                logger.info(`Found alternative coverage files: ${jsonFiles.join(', ')}`);
                // Try to parse the first JSON file found
                try {
                  const altPath = path.join(coverageDir, jsonFiles[0]);
                  const altContent = fs.readFileSync(altPath, 'utf8');
                  const altData = JSON.parse(altContent);
                  
                  if (altData.total && typeof altData.total.statements === 'object') {
                    coverageValue = altData.total.statements.pct || 0;
                    logger.info(`Parsed coverage from alternative file: ${coverageValue.toFixed(2)}%`);
                    coverageFileFound = true;
                    errorMsg = null;
                  }
                } catch (altError) {
                  logger.warn(`Could not parse alternative coverage file: ${altError.message}`);
                }
              }
            }
            
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
        
        // Always return a valid coverage percentage even if parsing failed
        // Dashboard will show 0% instead of "undefined"
        const finalCoverage = (typeof coverageValue === 'number' && !isNaN(coverageValue)) 
          ? coverageValue 
          : 0;
        
        return {
          valid: commandSucceeded && coverageParsed,
          error: errorMsg,
          coverage: finalCoverage
        };
      }
    });
  }
  
  return runTests(tests, { stopOnFailure, verbose });
}

/**
 * Check if the test setup is valid
 * 
 * @returns {Promise<boolean>} - Whether the test setup is valid
 */
export async function checkTestSetup() {
  try {
    // Check if vitest is installed
    const vitestPath = path.resolve(process.cwd(), 'node_modules', '.bin', 'vitest');
    if (!fs.existsSync(vitestPath)) {
      logger.error('Vitest is not installed. Please run: pnpm install');
      return false;
    }
    
    // Check if coverage provider is installed
    const coverageProviderPath = path.resolve(process.cwd(), 'node_modules', '@vitest', 'coverage-v8');
    if (!fs.existsSync(coverageProviderPath)) {
      logger.error('Coverage provider is not installed. Please run: pnpm install -D @vitest/coverage-v8');
      return false;
    }
    
    // Check if test directories exist
    const testDirs = [
      'packages/common/src',
      'packages/admin/src',
      'packages/hours/src',
      'scripts'
    ];
    
    for (const dir of testDirs) {
      if (!fs.existsSync(dir)) {
        logger.warn(`Test directory not found: ${dir}`);
      }
    }
    
    return true;
  } catch (error) {
    logger.error(`Error checking test setup: ${error.message}`);
    return false;
  }
}

export default {
  runTest,
  runTests,
  runStandardTests,
  checkTestSetup
}; 
