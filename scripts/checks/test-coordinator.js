/**
 * Test Coordinator Module
 * 
 * Manages test execution and result reporting.
 */

import { commandRunner } from '../core/command-runner.js';
import { logger } from '../core/logger.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { runStandardTests } from './test-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class TestCoordinator {
  constructor() {
    this.commandRunner = commandRunner;
    this.warnings = [];
  }

  /**
   * Run tests and capture coverage
   * @returns {Promise<Object>} Result of test execution including coverage
   */
  async runTests() {
    logger.info('Running tests and coverage...');
    
    // Run the standard test suite with coverage
    const testSummary = await runStandardTests({
      verbose: true,
      stopOnFailure: true,
      skipTests: false
    });
    
    // Parse test output for failures
    this.warnings = [];
    if (!testSummary.success && testSummary.results) {
      testSummary.results.forEach(result => {
        if (!result.success && result.output) {
          this._parseTestOutput(result.output, result.name);
        }
      });
    }
    
    // Add parsed test failure warnings
    testSummary.warnings = this.warnings;
    
    return testSummary;
  }

  /**
   * Runs tests and returns the results structure.
   * @returns {Promise<Object>} Combined results with warnings and coverage
   */
  async runTestsAndReport() {
    this.warnings = [];
    
    const testSummary = await this.runTests();
    
    const overallSuccess = testSummary.success;
    let overallError = null;
    if (!overallSuccess) {
      overallError = testSummary.error || 'Test execution failed without specific error message';
    }
    
    return {
      success: overallSuccess,
      results: {
        linting: { success: true, output: 'Skipped by TestCoordinator' },
        typeChecking: { success: true, output: 'Skipped by TestCoordinator' },
        testing: testSummary
      },
      warnings: testSummary.warnings || [],
      unitTests: testSummary.unitTests || { passed: 0, total: 0 },
      coverage: testSummary.coverage,
      error: overallError
    };
  }
  
  /**
   * Parse test output for failures
   * @private
   * @param {string} output - The output from a single test command
   * @param {string} testName - The name of the test that generated the output
   */
  _parseTestOutput(output, testName = 'Unknown Test') {
    if (!output) return;
    
    const lines = output.split('\n');
    let currentTest = testName;
    
    for (const line of lines) {
      if (line.includes('FAIL')) {
        currentTest = line.replace(/FAIL/g, '').trim();
      } else if (line.includes('Error:') || line.includes('failed')) {
        this.warnings.push({
          message: `Test failure: ${line.trim()}`,
          file: currentTest,
          phase: 'Validation',
          step: 'Testing'
        });
        if (currentTest !== testName) {
          currentTest = testName;
        }
      }
    }
  }
} 