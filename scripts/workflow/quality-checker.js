/**
 * Quality Checker Module
 * 
 * Manages code quality validation including linting, 
 * type checking, and test execution.
 */

import { commandRunner } from '../core/command-runner.js';
import { logger } from '../core/logger.js';

export class QualityChecker {
  constructor() {
    this.commandRunner = commandRunner;
  }

  /**
   * Run linting on the codebase
   * @returns {Promise<Object>} Result of linting
   */
  async runLinting() {
    logger.info('Running linting checks...');
    return this.commandRunner.runCommandAsync('pnpm lint', { 
      stdio: 'inherit',
      ignoreError: true
    });
  }

  /**
   * Run TypeScript type checking
   * @returns {Promise<Object>} Result of type checking
   */
  async runTypeChecking() {
    logger.info('Running type checking...');
    return this.commandRunner.runCommandAsync('pnpm typecheck', { 
      stdio: 'inherit',
      ignoreError: true
    });
  }

  /**
   * Run tests
   * @returns {Promise<Object>} Result of test execution
   */
  async runTests() {
    logger.info('Running tests...');
    return this.commandRunner.runCommandAsync('pnpm test', { 
      stdio: 'inherit',
      ignoreError: true
    });
  }

  /**
   * Run all quality checks
   * @returns {Promise<Object>} Combined results
   */
  async runAllChecks() {
    const lintResult = await this.runLinting();
    const typeResult = await this.runTypeChecking();
    const testResult = await this.runTests();
    
    return {
      success: lintResult.success && typeResult.success && testResult.success,
      results: {
        linting: lintResult,
        typeChecking: typeResult,
        testing: testResult
      }
    };
  }
} 