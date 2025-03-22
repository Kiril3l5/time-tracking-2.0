#!/usr/bin/env node

/**
 * Error Handler Module
 * 
 * Provides centralized error handling and reporting for the preview deployment workflow.
 * Includes standardized error classes, error aggregation, and formatted error summary reporting.
 * 
 * Features:
 * - Structured error types for different kinds of failures (Auth, Build, Deploy, etc.)
 * - Error aggregation to collect and report on multiple errors
 * - Standardized error formatting with color highlighting
 * - Suggestions for error recovery where applicable
 * 
 * @module core/error-handler
 * @example
 * import { ErrorAggregator, AuthenticationError } from './core/error-handler.js';
 * 
 * // Create a central error tracking instance
 * const errorTracker = new ErrorAggregator();
 * 
 * try {
 *   // Some operation that might fail
 * } catch (error) {
 *   // Create a specialized error with context
 *   const authError = new AuthenticationError(
 *     'Failed to authenticate with Firebase',
 *     'firebase-auth',
 *     error,
 *     'Try running "firebase login" to reauthenticate'
 *   );
 *   
 *   // Add to the error tracker
 *   errorTracker.addError(authError);
 * }
 * 
 * // At the end of the workflow, show error summary if needed
 * if (errorTracker.hasErrors()) {
 *   errorTracker.logErrors();
 * }
 */

import * as logger from './logger.js';

/* global process */

/**
 * Base error class for workflow errors
 * 
 * @class WorkflowError
 * @extends Error
 * @description Specialized error class that captures the context of errors in the workflow,
 * including where they occurred, what caused them, and suggestions for fixing them.
 * @example
 * const error = new WorkflowError(
 *   "Failed to complete step",
 *   "BuildProcess",
 *   originalError,
 *   "Check your build configuration"
 * );
 */
export class WorkflowError extends Error {
  /**
   * Create a new workflow error
   * 
   * @param {string} message - Error message describing what went wrong
   * @param {string} [step=null] - Workflow step where the error occurred (e.g., 'Authentication', 'Build')
   * @param {Error} [cause=null] - Original error that caused this error (for error chaining)
   * @param {string} [suggestion=null] - Suggestion for resolving the error
   */
  constructor(message, step = null, cause = null, suggestion = null) {
    super(message);
    this.name = this.constructor.name;
    this.step = step;
    this.cause = cause;
    this.suggestion = suggestion;
    this.timestamp = new Date();
  }

  /**
   * Get a formatted representation of the error
   * 
   * @returns {string} - Formatted error message with step, cause, and suggestion if available
   * @example
   * const formattedError = error.format();
   * // "[WorkflowError] Failed to complete step
   * // Step: BuildProcess
   * // Cause: Command failed with exit code 1
   * // Suggestion: Check your build configuration"
   */
  format() {
    let result = `[${this.name}] ${this.message}`;
    
    if (this.step) {
      result += `\nStep: ${this.step}`;
    }
    
    if (this.cause) {
      result += `\nCause: ${this.cause.message}`;
    }
    
    if (this.suggestion) {
      result += `\nSuggestion: ${this.suggestion}`;
    }
    
    return result;
  }
}

/**
 * Error in authentication step
 * 
 * @class AuthenticationError
 * @extends WorkflowError
 * @description Specialized error for authentication-related issues, including automatic
 * suggestions based on the specific authentication error pattern.
 * @example
 * const authError = new AuthenticationError(
 *   "Failed to authenticate with firebase", 
 *   new Error("Invalid credentials")
 * );
 */
export class AuthenticationError extends WorkflowError {
  /**
   * Create a new authentication error
   * 
   * @param {string} message - Error message describing the authentication failure
   * @param {Error} [cause=null] - Original error that caused this failure
   */
  constructor(message, cause = null) {
    super(message, 'Authentication', cause);
    
    // Add common suggestions based on error message patterns
    if (message.includes('firebase')) {
      this.suggestion = 'Try running "firebase login" to authenticate with Firebase.';
    } else if (message.includes('git') || message.includes('github')) {
      this.suggestion = 'Ensure your Git credentials are configured correctly with "git config".';
    } else {
      this.suggestion = 'Check your network connection and authentication credentials.';
    }
  }
}

/**
 * Error in quality check step
 * 
 * @class QualityCheckError
 * @extends WorkflowError
 * @description Specialized error for quality check failures (linting, type checking, testing),
 * with specific suggestions based on the type of check that failed.
 * @example
 * const lintError = new QualityCheckError(
 *   "ESLint found 3 errors", 
 *   "lint", 
 *   originalError
 * );
 */
export class QualityCheckError extends WorkflowError {
  /**
   * Create a new quality check error
   * 
   * @param {string} message - Error message describing the quality check failure
   * @param {string} checkType - Type of check that failed (e.g., 'lint', 'typescript', 'test')
   * @param {Error} [cause=null] - Original error that caused this failure
   */
  constructor(message, checkType, cause = null) {
    super(message, `Quality Check (${checkType})`, cause);
    
    // Add suggestions based on check type
    switch(checkType) {
      case 'lint':
        this.suggestion = 'Run "pnpm run lint:fix" to attempt automatic fixes.';
        break;
      case 'typescript':
        this.suggestion = 'Run "pnpm run fix:typescript" to fix TypeScript errors.';
        break;
      case 'test':
        this.suggestion = 'Check test failures and fix failing tests.';
        break;
      default:
        this.suggestion = 'Review errors and fix issues manually.';
    }
  }
}

/**
 * Error in build step
 * 
 * @class BuildError
 * @extends WorkflowError
 * @description Specialized error for build failures during the workflow.
 * @example
 * const buildError = new BuildError(
 *   "Failed to compile project", 
 *   originalError
 * );
 */
export class BuildError extends WorkflowError {
  /**
   * Create a new build error
   * 
   * @param {string} message - Error message describing the build failure
   * @param {Error} [cause=null] - Original error that caused this failure
   */
  constructor(message, cause = null) {
    super(message, 'Build', cause);
    this.suggestion = 'Check build logs for errors and ensure all dependencies are installed.';
  }
}

/**
 * Error in deployment step
 * 
 * @class DeploymentError
 * @extends WorkflowError
 * @description Specialized error for deployment failures, particularly with Firebase.
 * @example
 * const deployError = new DeploymentError(
 *   "Failed to deploy to Firebase hosting", 
 *   originalError
 * );
 */
export class DeploymentError extends WorkflowError {
  /**
   * Create a new deployment error
   * 
   * @param {string} message - Error message describing the deployment failure
   * @param {Error} [cause=null] - Original error that caused this failure
   */
  constructor(message, cause = null) {
    super(message, 'Deployment', cause);
    this.suggestion = 'Verify Firebase configuration and permissions.';
  }
}

/**
 * Error in dependency management
 * 
 * @class DependencyError
 * @extends WorkflowError
 * @description Specialized error for dependency-related issues, such as missing packages.
 * @example
 * const depError = new DependencyError(
 *   "Package 'firebase-tools' is not installed", 
 *   originalError
 * );
 */
export class DependencyError extends WorkflowError {
  /**
   * Create a new dependency error
   * 
   * @param {string} message - Error message describing the dependency issue
   * @param {Error} [cause=null] - Original error that caused this issue
   */
  constructor(message, cause = null) {
    super(message, 'Dependency Management', cause);
    this.suggestion = 'Run "pnpm install" to install missing dependencies.';
  }
}

/**
 * Aggregate multiple errors into a single report
 * 
 * @class ErrorAggregator
 * @description Collects multiple errors that occur during a workflow and provides
 * methods to analyze, format, and report them in a structured way.
 * @example
 * const errorTracker = new ErrorAggregator();
 * 
 * try {
 *   // Do something that might fail
 * } catch (error) {
 *   errorTracker.addError(error);
 * }
 * 
 * if (errorTracker.hasErrors()) {
 *   errorTracker.logErrors();
 * }
 */
export class ErrorAggregator {
  /**
   * Create a new error aggregator
   */
  constructor() {
    this.errors = [];
  }

  /**
   * Add an error to the aggregator
   * 
   * @param {Error|WorkflowError} error - The error to add to the collection
   * @description Adds an error to the aggregator. If the error is not already a WorkflowError,
   * it will be converted to one automatically.
   * @example
   * try {
   *   // Some code that might throw
   * } catch (error) {
   *   errorTracker.addError(error);
   * }
   */
  addError(error) {
    if (error instanceof WorkflowError) {
      this.errors.push(error);
    } else {
      // Convert standard errors to WorkflowError
      this.errors.push(new WorkflowError(error.message, null, error));
    }
  }

  /**
   * Check if there are any errors
   * 
   * @returns {boolean} - True if there are errors, false otherwise
   * @description Determines if any errors have been collected.
   * @example
   * if (errorTracker.hasErrors()) {
   *   // Handle errors
   * } else {
   *   // Continue with workflow
   * }
   */
  hasErrors() {
    return this.errors.length > 0;
  }

  /**
   * Get the number of errors
   * 
   * @returns {number} - Total number of errors collected
   * @description Returns the count of errors collected by the aggregator.
   * @example
   * const errorCount = errorTracker.count();
   * logger.info(`Found ${errorCount} errors`);
   */
  count() {
    return this.errors.length;
  }

  /**
   * Get errors by step
   * 
   * @returns {Object} - Errors grouped by workflow step
   * @description Groups errors by the workflow step where they occurred, making it easier
   * to see which parts of the workflow are failing.
   * @example
   * const errorsByStep = errorTracker.getErrorsByStep();
   * // { 
   * //   "Authentication": [AuthError1, AuthError2],
   * //   "Build": [BuildError1]
   * // }
   */
  getErrorsByStep() {
    const result = {};
    
    for (const error of this.errors) {
      const step = error.step || 'Unknown';
      
      if (!result[step]) {
        result[step] = [];
      }
      
      result[step].push(error);
    }
    
    return result;
  }

  /**
   * Generate a summary of all errors
   * 
   * @returns {string} - Human-readable error summary
   * @description Creates a detailed text summary of all errors, grouped by step,
   * with messages and suggestions included.
   * @example
   * const summary = errorTracker.generateSummary();
   * console.log(summary);
   * // Found 3 error(s):
   * // 
   * // == Errors in Authentication ==
   * // - Failed to authenticate with Firebase
   * //   Suggestion: Try running "firebase login"
   * // ...
   */
  generateSummary() {
    if (!this.hasErrors()) {
      return 'No errors';
    }
    
    const errorsByStep = this.getErrorsByStep();
    let summary = `Found ${this.errors.length} error(s):\n\n`;
    
    for (const [step, errors] of Object.entries(errorsByStep)) {
      summary += `== Errors in ${step} ==\n`;
      
      for (const error of errors) {
        summary += `- ${error.message}\n`;
        if (error.suggestion) {
          summary += `  Suggestion: ${error.suggestion}\n`;
        }
      }
      
      summary += '\n';
    }
    
    return summary;
  }

  /**
   * Log all errors with proper formatting
   * 
   * @description Outputs all collected errors to the logger, formatted in a readable way and
   * grouped by the workflow step where they occurred. Includes suggestions for fixing the errors.
   * @example
   * // At the end of the workflow
   * if (errorTracker.hasErrors()) {
   *   errorTracker.logErrors();
   *   process.exit(1);
   * }
   */
  logErrors() {
    if (!this.hasErrors()) {
      return;
    }
    
    logger.error(`\n===== ERROR SUMMARY =====`);
    logger.error(`Found ${this.errors.length} error(s) during workflow execution:`);
    
    const errorsByStep = this.getErrorsByStep();
    
    for (const [step, errors] of Object.entries(errorsByStep)) {
      logger.error(`\n== Errors in ${step} ==`);
      
      for (const error of errors) {
        logger.error(`- ${error.message}`);
        if (error.cause) {
          logger.error(`  Cause: ${error.cause.message}`);
        }
        if (error.suggestion) {
          logger.info(`  Suggestion: ${error.suggestion}`);
        }
      }
    }
    
    logger.error(`\n==========================`);
  }
}

/**
 * Handle a workflow error with proper logging and diagnostics
 * 
 * @function handleError
 * @param {Error|WorkflowError} error - The error to handle
 * @param {string} [step=null] - The workflow step where the error occurred
 * @param {boolean} [exit=false] - Whether to exit the process after handling the error
 * @returns {WorkflowError} - The processed workflow error
 * @description Processes any type of error into a WorkflowError, logs it appropriately,
 * and optionally terminates the process.
 * @example
 * try {
 *   // Code that might throw
 * } catch (error) {
 *   const workflowError = handleError(error, 'BuildStep', true);
 *   // Process will exit with code 1
 * }
 */
export function handleError(error, step = null, exit = false) {
  let workflowError;
  
  // Convert to WorkflowError if needed
  if (error instanceof WorkflowError) {
    workflowError = error;
  } else {
    workflowError = new WorkflowError(error.message, step, error);
  }
  
  // Log the error
  logger.error(workflowError.format());
  
  // Exit if requested
  if (exit) {
    process.exit(1);
  }
  
  return workflowError;
}

/**
 * Special handling for dependency-related errors
 * 
 * @function handleDependencyError
 * @param {Error} error - The original error
 * @param {string} packageName - The name of the package that caused the error
 * @returns {DependencyError} - A properly formatted dependency error
 * @description Creates a specialized DependencyError with proper formatting and suggestions
 * when a package-related error occurs.
 * @example
 * try {
 *   // Code that uses a package
 * } catch (error) {
 *   const depError = handleDependencyError(error, 'firebase-tools');
 *   errorTracker.addError(depError);
 * }
 */
export function handleDependencyError(error, packageName) {
  const message = `Dependency error with package "${packageName}": ${error.message}`;
  const depError = new DependencyError(message, error);
  
  logger.error(depError.format());
  return depError;
}

/**
 * Central error tracking for the workflow
 * 
 * @constant {ErrorAggregator} errorTracker
 * @description A singleton instance of ErrorAggregator for use throughout the workflow.
 * This should be the primary way of tracking errors in the workflow.
 * @example
 * import { errorTracker } from './error-handler.js';
 * 
 * try {
 *   // Code that might fail
 * } catch (error) {
 *   errorTracker.addError(error);
 * }
 */
export const errorTracker = new ErrorAggregator();

/**
 * Handle unexpected errors and terminate gracefully
 * 
 * @function handleFatalError
 * @param {Error} error - The unexpected error
 * @description Handles unrecoverable errors by logging details and terminating the process
 * in a controlled manner. Ensures logs are saved before exiting.
 * @example
 * try {
 *   // Critical operation
 * } catch (error) {
 *   handleFatalError(error);
 *   // Process will exit with code 1
 * }
 */
export function handleFatalError(error) {
  logger.error('FATAL ERROR: Workflow terminated unexpectedly');
  logger.error(error.message);
  logger.error(error.stack);
  
  // Ensure logs are saved
  if (logger.stopFileLogging) {
    logger.stopFileLogging();
  }
  
  process.exit(1);
}

// Register global error handler for uncaught exceptions
process.on('uncaughtException', (error) => {
  handleFatalError(error);
});

// Register global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  handleFatalError(reason instanceof Error ? reason : new Error(String(reason)));
});

/**
 * Default export for the error-handler module
 * 
 * @export {Object} default
 * @description Exports all error classes and utility functions for easy import in other modules.
 * @example
 * import errorHandler from './error-handler.js';
 * 
 * try {
 *   // Code that might fail
 * } catch (error) {
 *   const workflowError = errorHandler.handleError(error);
 * }
 */
export default {
  WorkflowError,
  AuthenticationError,
  QualityCheckError,
  BuildError,
  DeploymentError,
  DependencyError,
  ErrorAggregator,
  handleError,
  handleDependencyError,
  errorTracker,
  handleFatalError
}; 