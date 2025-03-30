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

import { logger } from './logger.js';
import { performanceMonitor } from './performance-monitor.js';

/* global process, console */

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
   * @param {string} [category=workflow] - Category of the error (e.g., 'authentication', 'validation', 'resource', 'performance')
   * @param {string} [severity=error] - Severity of the error (e.g., 'error', 'warning')
   */
  constructor(message, category = 'workflow', severity = 'error') {
    super(message);
    this.name = 'WorkflowError';
    this.category = category;
    this.severity = severity;
    this.timestamp = new Date().toISOString();
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
    
    if (this.category) {
      result += `\nCategory: ${this.category}`;
    }
    
    if (this.severity) {
      result += `\nSeverity: ${this.severity}`;
    }
    
    return result;
  }
}

/**
 * Error in validation step
 * 
 * @class ValidationError
 * @extends WorkflowError
 * @description Specialized error for validation-related issues, such as
 * invalid configuration, missing required fields, or format violations.
 * @example
 * const validationError = new ValidationError(
 *   "Invalid configuration format", 
 *   "config",
 *   originalError
 * );
 */
export class ValidationError extends WorkflowError {
  /**
   * Create a new validation error
   * 
   * @param {string} message - Error message describing the validation failure
   * @param {string} [field=null] - Field that failed validation
   * @param {Error} [cause=null] - Original error that caused this failure
   */
  constructor(message, field = null, cause = null) {
    super(message, 'validation', 'error');
    this.name = 'ValidationError';
    this.field = field;
    this._cause = cause;
    this.suggestion = 'Check the validation rules and ensure all required fields are present and valid.';
  }

  format() {
    let result = super.format();
    if (this.field) {
      result += `\nField: ${this.field}`;
    }
    if (this._cause) {
      result += `\nCause: ${this._cause.message}`;
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
   */
  constructor(message) {
    super(message, 'authentication', 'error');
    this.name = 'AuthenticationError';
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
    super(message, `Quality Check (${checkType})`, 'error');
    this._cause = cause; // Store cause for potential use in format()
    
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

  format() {
    let result = super.format();
    if (this._cause) {
      result += `\nCause: ${this._cause.message}`;
    }
    if (this.suggestion) {
      result += `\nSuggestion: ${this.suggestion}`;
    }
    return result;
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
    super(message, 'build', 'error');
    this._cause = cause; // Store cause for potential use in format()
    this.suggestion = 'Check build logs for errors and ensure all dependencies are installed.';
  }

  format() {
    let result = super.format();
    if (this._cause) {
      result += `\nCause: ${this._cause.message}`;
    }
    if (this.suggestion) {
      result += `\nSuggestion: ${this.suggestion}`;
    }
    return result;
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
    super(message, 'deployment', 'error');
    this._cause = cause; // Store cause for potential use in format()
    this.suggestion = 'Verify Firebase configuration and permissions.';
  }

  format() {
    let result = super.format();
    if (this._cause) {
      result += `\nCause: ${this._cause.message}`;
    }
    if (this.suggestion) {
      result += `\nSuggestion: ${this.suggestion}`;
    }
    return result;
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
    super(message, 'dependency', 'error');
    this._cause = cause; // Store cause for potential use in format()
    this.suggestion = 'Run "pnpm install" to install missing dependencies.';
  }

  format() {
    let result = super.format();
    if (this._cause) {
      result += `\nCause: ${this._cause.message}`;
    }
    if (this.suggestion) {
      result += `\nSuggestion: ${this.suggestion}`;
    }
    return result;
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
    this.errorCategories = {
      workflow: [],
      authentication: [],
      validation: [],
      resource: [],
      performance: []
    };
    this.maxErrors = 100;
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
      const workflowError = new WorkflowError(error.message, null, null, null);
      this.errors.push(workflowError);
    }

    // Add to category array
    if (error.category && this.errorCategories[error.category]) {
      this.errorCategories[error.category].push(error);
    }

    // Limit total errors
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // Log based on severity
    switch (error.severity) {
      case 'error':
        logger.error(error.message);
        break;
      case 'warning':
        logger.warn(error.message);
        break;
      default:
        logger.info(error.message);
    }

    // Track performance impact
    if (error.category === 'performance') {
      performanceMonitor.trackStepPerformance('error-handling', 0);
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
export function handleError(error, _step = null, exit = false) {
  let workflowError;
  
  // Convert to WorkflowError if needed
  if (error instanceof WorkflowError) {
    workflowError = error;
  } else {
    workflowError = new WorkflowError(error.message, null, null, null);
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
  // Use console.error as fallback for fatal errors to avoid circular dependencies
  console.error('FATAL ERROR: Workflow terminated unexpectedly');
  console.error(error);
  
  // Try to use logger if available, but don't fail if it's not
  try {
    if (logger && typeof logger.error === 'function') {
      logger.error('FATAL ERROR: Workflow terminated unexpectedly');
      logger.error(error);
    }
  } catch (e) {
    // Ignore logger errors in fatal error handler
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
 * Default error handler instance
 */
const errorHandler = {
  WorkflowError,
  ValidationError,
  AuthenticationError,
  QualityCheckError,
  BuildError,
  DeploymentError,
  DependencyError,
  ErrorAggregator,
  handleError(error) {
    if (error instanceof WorkflowError) {
      return error;
    }
    return new WorkflowError(error.message);
  },
  handleDependencyError,
  errorTracker,
  handleFatalError
};

export default errorHandler; 