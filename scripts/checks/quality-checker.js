/**
 * Quality Checker Module
 * 
 * Manages code quality validation including linting, 
 * type checking, and test execution.
 */

import { commandRunner } from '../core/command-runner.js';
import { logger } from '../core/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { runStandardTests } from './test-runner.js'; // Import the improved test runner

/* global process */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class QualityChecker {
  constructor() {
    this.commandRunner = commandRunner;
    this.warnings = [];
  }

  /**
   * Run linting on the codebase
   * @returns {Promise<Object>} Result of linting
   */
  async runLinting() {
    logger.info('Running linting checks...');
    const result = await this.commandRunner.runCommandAsync('pnpm lint', { 
      stdio: 'pipe',
      ignoreError: true
    });
    
    // Parse lint output for warnings
    if (!result.success && result.output) {
      this._parseLintOutput(result.output);
    }
    
    return result;
  }

  /**
   * Run TypeScript type checking
   * @returns {Promise<Object>} Result of type checking
   */
  async runTypeChecking() {
    logger.info('Running type checking...');
    const result = await this.commandRunner.runCommandAsync('pnpm typecheck', { 
      stdio: 'pipe',
      ignoreError: true
    });
    
    // Parse typescript errors
    if (!result.success && result.output) {
      this._parseTypeCheckOutput(result.output);
    }
    
    return result;
  }

  /**
   * Run tests and capture coverage
   * @returns {Promise<Object>} Result of test execution including coverage
   */
  async runTests() {
    logger.info('Running tests and coverage...');
    // Use the improved runStandardTests which handles coverage
    const testSummary = await runStandardTests({
      // Pass any relevant options if needed, e.g., verbose
    });
    
    // Parse test output for failures
    if (!testSummary.success && testSummary.results) {
      testSummary.results.forEach(result => {
        if (!result.success && result.output) {
          this._parseTestOutput(result.output, result.name);
        }
      });
    }
    
    // Return the complete summary, including coverage
    return testSummary; 
  }

  /**
   * Run all quality checks
   * @returns {Promise<Object>} Combined results with warnings and coverage
   */
  async runAllChecks() {
    // Clear previous warnings
    this.warnings = [];
    
    const lintResult = await this.runLinting();
    const typeResult = await this.runTypeChecking();
    // Run tests and get the summary including coverage
    const testSummary = await this.runTests(); 
    
    // Add warnings from package.json dependencies check
    this._checkDependencies();
    
    // Add warnings from common configuration files
    this._checkConfigFiles();
    
    // ---> Determine overall success and extract specific error message <-----
    const overallSuccess = lintResult.success && typeResult.success && testSummary.success;
    let overallError = null;
    if (!overallSuccess) {
      // Prioritize the first specific error found
      if (!testSummary.success && testSummary.error) {
        overallError = testSummary.error; // Specific error from test runner
      } else if (!typeResult.success && typeResult.error) {
        overallError = typeResult.error; // Error from type checker
      } else if (!lintResult.success && lintResult.error) {
        overallError = lintResult.error; // Error from linter
      } else {
        overallError = 'Quality checks failed without specific error message'; // Fallback
      }
    }
    // ---> End error extraction <-----
    
    return {
      success: overallSuccess,
      results: {
        linting: lintResult,
        typeChecking: typeResult,
        testing: testSummary // Store the full test summary (contains steps, coverage, unitTests, error)
      },
      warnings: this.warnings,
      // Explicitly pass unit test details and coverage up
      unitTests: testSummary.unitTests || { passed: 0, total: 0 }, // Use parsed unit tests or default
      coverage: testSummary.coverage, // Parsed coverage or null
      error: overallError 
    };
  }
  
  /**
   * Parse linting output for warnings
   * @private
   */
  _parseLintOutput(output) {
    if (!output) return;
    
    const lines = output.split('\n');
    for (const line of lines) {
      // Look for eslint warnings and errors
      if (line.includes('warning') || line.includes('error')) {
        // Extract file path and message
        const match = line.match(/([^:]+):(\d+):(\d+):\s+(warning|error)\s+-\s+(.+)/);
        if (match) {
          this.warnings.push({
            message: `ESLint ${match[4]}: ${match[5]}`,
            file: match[1],
            line: match[2],
            phase: 'Validation',
            step: 'Linting'
          });
        } else {
          // Fallback for other lint formats
          this.warnings.push({
            message: line.trim(),
            phase: 'Validation',
            step: 'Linting'
          });
        }
      }
    }
  }
  
  /**
   * Parse TypeScript output for errors
   * @private
   */
  _parseTypeCheckOutput(output) {
    if (!output) return;
    
    const lines = output.split('\n');
    for (const line of lines) {
      // Look for TS errors
      if (line.includes('.ts') || line.includes('.tsx')) {
        const match = line.match(/([^(]+)\((\d+),(\d+)\):\s+(.+)/);
        if (match) {
          this.warnings.push({
            message: `TypeScript error: ${match[4]}`,
            file: match[1].trim(),
            line: match[2],
            phase: 'Validation',
            step: 'TypeScript'
          });
        }
      }
    }
  }
  
  /**
   * Parse test output for failures
   * @private
   * @param {string} output - The output from a single test command
   * @param {string} testName - The name of the test that generated the output
   */
  _parseTestOutput(output, testName = 'Unknown Test') {
    if (!output) return;
    
    // Check for "FAIL" lines or common error patterns
    const lines = output.split('\n');
    let currentTest = testName;
    
    for (const line of lines) {
      // Vitest failure format
      if (line.includes('FAIL')) {
        currentTest = line.replace(/FAIL/g, '').trim();
      } else if (line.includes('Error:') || line.includes('failed')) {
        // Capture the error line associated with the FAIL line
        this.warnings.push({
          message: `Test failure: ${line.trim()}`,
          file: currentTest, // Use the file/test name from the FAIL line
          phase: 'Validation',
          step: 'Testing'
        });
        // Reset currentTest after logging the error line for it
        if (currentTest !== testName) {
          currentTest = testName;
        }
      }
    }
  }
  
  /**
   * Check package dependencies for issues
   * @private
   */
  _checkDependencies() {
    try {
      const pkgPath = path.join(process.cwd(), 'package.json');
      
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        
        // Check for deprecated dependencies
        const deprecatedPackages = [
          'tslint', // deprecated in favor of eslint
          'moment', // large package size, deprecated in favor of date-fns or Luxon
          'request', // deprecated
          'react-addons-*', // deprecated
          'node-sass' // deprecated in favor of sass
        ];
        
        // Check dependencies and devDependencies
        const allDeps = {
          ...pkg.dependencies,
          ...pkg.devDependencies
        };
        
        for (const [name, version] of Object.entries(allDeps)) {
          // Check for deprecated packages
          for (const deprecated of deprecatedPackages) {
            if (deprecated.endsWith('*')) {
              const prefix = deprecated.slice(0, -1);
              if (name.startsWith(prefix)) {
                this.warnings.push({
                  message: `Package "${name}" is deprecated. Consider replacing it.`,
                  phase: 'Setup',
                  step: 'Dependencies'
                });
              }
            } else if (name === deprecated) {
              this.warnings.push({
                message: `Package "${name}" is deprecated. Consider replacing it.`,
                phase: 'Setup',
                step: 'Dependencies'
              });
            }
          }
          
          // Check for using "latest" or "*" versions (not pinned)
          if (version === 'latest' || version === '*') {
            this.warnings.push({
              message: `Package "${name}" uses unpinned version "${version}". Consider pinning for stability.`,
              phase: 'Setup',
              step: 'Dependencies'
            });
          }
        }
      }
    } catch (error) {
      // Ignore dependency check errors
    }
  }
  
  /**
   * Check for common configuration issues
   * @private
   */
  _checkConfigFiles() {
    // Check for missing common config files
    const configFiles = [
      { path: '.eslintrc.js', desc: 'ESLint configuration' },
      { path: '.prettierrc.json', desc: 'Prettier configuration' },
      { path: 'tsconfig.json', desc: 'TypeScript configuration' },
      { path: '.gitignore', desc: 'Git ignore file' }
    ];
    
    for (const file of configFiles) {
      if (!fs.existsSync(path.join(process.cwd(), file.path))) {
        this.warnings.push({
          message: `Missing ${file.desc} file (${file.path})`,
          phase: 'Setup',
          step: 'Configuration'
        });
      }
    }
  }
} 