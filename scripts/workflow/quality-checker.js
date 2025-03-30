/**
 * Quality Checker Module
 * 
 * Manages quality checks including linting, testing, and type checking.
 */

// Core Dependencies
import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';
import { performanceMonitor } from '../core/performance-monitor.js';
import errorHandler from '../core/error-handler.js';

// Workflow Components
import getWorkflowState from './workflow-state.js';

/**
 * Quality Checker Class
 */
export class QualityChecker {
  constructor() {
    this.logger = logger;
    this.commandRunner = commandRunner;
    this.performanceMonitor = performanceMonitor;
    this.errorHandler = errorHandler;
    this.workflowState = getWorkflowState();
  }

  /**
   * Run quality checks on packages
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Quality check results
   */
  async runQualityChecks(context) {
    const { buildOrder, packages } = context;
    this.logger.info('Running quality checks...');
    const startTime = Date.now();
    
    try {
      const results = {
        success: true,
        duration: 0,
        packages: new Map(),
        errors: [],
        warnings: []
      };
      
      // Run checks in build order
      for (const packageName of buildOrder) {
        const packageInfo = packages.get(packageName);
        if (!packageInfo) {
          throw new this.errorHandler.WorkflowError(`Package ${packageName} not found`);
        }
        
        this.logger.info(`Running quality checks for ${packageName}...`);
        const packageStartTime = Date.now();
        
        try {
          // Run linting
          const lintResult = await this.runLinting(packageInfo);
          if (!lintResult.success) {
            results.errors.push({
              package: packageName,
              type: 'linting',
              errors: lintResult.errors
            });
          }
          
          // Run type checking
          const typeResult = await this.runTypeChecking(packageInfo);
          if (!typeResult.success) {
            results.errors.push({
              package: packageName,
              type: 'type-checking',
              errors: typeResult.errors
            });
          }
          
          // Run tests
          const testResult = await this.runTests(packageInfo);
          if (!testResult.success) {
            results.errors.push({
              package: packageName,
              type: 'testing',
              errors: testResult.errors
            });
          }
          
          // Add warnings
          results.warnings.push(...lintResult.warnings, ...typeResult.warnings, ...testResult.warnings);
          
          // Store package results
          results.packages.set(packageName, {
            success: lintResult.success && typeResult.success && testResult.success,
            duration: Date.now() - packageStartTime,
            linting: lintResult,
            typeChecking: typeResult,
            testing: testResult
          });
          
        } catch (error) {
          this.logger.error(`Quality checks failed for ${packageName}: ${error.message}`);
          results.errors.push({
            package: packageName,
            type: 'general',
            error: error.message
          });
          
          results.packages.set(packageName, {
            success: false,
            duration: Date.now() - packageStartTime,
            error: error.message
          });
        }
      }
      
      // Calculate overall success
      results.success = results.errors.length === 0;
      results.duration = Date.now() - startTime;
      
      // Add results to workflow state
      this.workflowState.updateMetrics({
        qualityChecks: {
          totalPackages: buildOrder.length,
          successfulPackages: Array.from(results.packages.values()).filter(p => p.success).length,
          failedPackages: Array.from(results.packages.values()).filter(p => !p.success).length,
          totalErrors: results.errors.length,
          totalWarnings: results.warnings.length
        }
      });
      
      if (results.success) {
        this.logger.success(`Quality checks completed successfully (Duration: ${results.duration}ms)`);
      } else {
        this.logger.warn(`Quality checks completed with errors (Duration: ${results.duration}ms)`);
      }
      
      return results;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Quality checks failed: ${error.message}`);
      
      return {
        success: false,
        duration,
        error: error.message
      };
    }
  }

  /**
   * Run linting checks
   * @private
   * @param {Object} packageInfo - Package information
   * @returns {Promise<Object>} Linting results
   */
  async runLinting(packageInfo) {
    const startTime = Date.now();
    
    try {
      const result = await this.commandRunner.runCommand(
        `cd ${packageInfo.path} && pnpm lint`
      );
      
      return {
        success: result.success,
        duration: Date.now() - startTime,
        errors: result.success ? [] : [result.error],
        warnings: []
      };
    } catch (error) {
      return {
        success: false,
        duration: Date.now() - startTime,
        errors: [error.message],
        warnings: []
      };
    }
  }

  /**
   * Run type checking
   * @private
   * @param {Object} packageInfo - Package information
   * @returns {Promise<Object>} Type checking results
   */
  async runTypeChecking(packageInfo) {
    const startTime = Date.now();
    
    try {
      const result = await this.commandRunner.runCommand(
        `cd ${packageInfo.path} && pnpm type-check`
      );
      
      return {
        success: result.success,
        duration: Date.now() - startTime,
        errors: result.success ? [] : [result.error],
        warnings: []
      };
    } catch (error) {
      return {
        success: false,
        duration: Date.now() - startTime,
        errors: [error.message],
        warnings: []
      };
    }
  }

  /**
   * Run tests
   * @private
   * @param {Object} packageInfo - Package information
   * @returns {Promise<Object>} Test results
   */
  async runTests(packageInfo) {
    const startTime = Date.now();
    
    try {
      const result = await this.commandRunner.runCommand(
        `cd ${packageInfo.path} && pnpm test`
      );
      
      return {
        success: result.success,
        duration: Date.now() - startTime,
        errors: result.success ? [] : [result.error],
        warnings: []
      };
    } catch (error) {
      return {
        success: false,
        duration: Date.now() - startTime,
        errors: [error.message],
        warnings: []
      };
    }
  }
}

// Export quality checker instance
export const qualityChecker = new QualityChecker();

// Export runQualityChecks function for direct use
export const runQualityChecks = (context) => qualityChecker.runQualityChecks(context); 