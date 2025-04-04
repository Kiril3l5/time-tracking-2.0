/**
 * Advanced Checker Module
 * 
 * Handles advanced checks including bundle size analysis, dead code detection,
 * vulnerability scanning, and documentation quality checks.
 * Integrates with existing advanced check modules.
 */

import { logger } from '../core/logger.js';
import { analyzeBundles } from '../checks/bundle-analyzer.js';
import { analyzeDeadCode } from '../checks/dead-code-detector.js';
import { analyzeDocumentation } from '../checks/doc-quality.js';
import { checkDocumentation } from '../checks/doc-freshness.js';
import { validateWorkflows } from '../checks/workflow-validation.js';
import { runTypeCheck } from '../checks/typescript-check.js';
import { runLint } from '../checks/lint-check.js';
import { runChecks as runHealthChecks } from '../checks/health-checker.js';
import { execSync } from 'child_process';
import { setTimeout, clearTimeout } from 'timers';
import getWorkflowState from './workflow-state.js';

/**
 * A wrapper around the logger that respects silent mode
 */
class SilentableLogger {
  constructor(baseLogger, options = {}) {
    this.baseLogger = baseLogger;
    this.silent = options.silent || false;
  }
  
  setSilent(silent) {
    this.silent = silent;
  }
  
  info(message, ...args) {
    if (!this.silent) {
      this.baseLogger.info(message, ...args);
    }
  }
  
  success(message, ...args) {
    if (!this.silent) {
      this.baseLogger.success(message, ...args);
    }
  }
  
  warn(message, ...args) {
    if (!this.silent) {
      this.baseLogger.warn(message, ...args);
    }
  }
  
  error(message, ...args) {
    if (!this.silent) {
      this.baseLogger.error(message, ...args);
    }
  }
  
  debug(message, ...args) {
    if (!this.silent) {
      this.baseLogger.debug(message, ...args);
    }
  }
  
  sectionHeader(message) {
    if (!this.silent) {
      this.baseLogger.sectionHeader(message);
    }
  }
}

// Create a wrapper for the logger
const silentLogger = new SilentableLogger(logger);

/**
 * Create a timeout promise with clean resource management
 * @param {number} ms - Timeout in milliseconds
 * @param {string} operation - Name of the operation for error message
 * @returns {Promise<never>} - A promise that rejects after the timeout
 */
function createTimeout(ms, operation) {
  let timeoutId = null;
  
  const promise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`${operation} timed out after ${ms/1000} seconds`);
      error.isTimeout = true;
      reject(error);
    }, ms);
  });
  
  // Attach cleanup function to the promise
  promise.cleanup = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
  
  return promise;
}

/**
 * Run an operation with a timeout
 * @param {Promise} operation - The operation to run
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operationName - Name of the operation for error reporting
 * @param {Object} fallbackValue - Value to return if operation times out
 * @param {Object} options - Optional settings
 * @returns {Promise<any>} - Result of the operation or fallback value if timeout
 */
async function runWithTimeout(operation, timeoutMs, operationName, fallbackValue, options = {}) {
  // Set silent mode for this operation
  silentLogger.setSilent(options.silentMode || false);
  
  // Allow overriding the timeout from options
  const customTimeout = options.timeout && options.timeout[operationName.toLowerCase().replace(/\s+/g, '')];
  const effectiveTimeout = customTimeout || timeoutMs;
  
  if (options.verbose && !options.silentMode) {
    silentLogger.debug(`Running '${operationName}' with ${effectiveTimeout/1000}s timeout`);
  }
  
  const timeout = createTimeout(effectiveTimeout, operationName);
  
  try {
    // Run the operation with a timeout
    const result = await Promise.race([operation, timeout]);
    timeout.cleanup();
    return result;
  } catch (error) {
    timeout.cleanup();
    
    if (error.isTimeout) {
      // Return fallback value on timeout
      if (!options.silentMode) {
        silentLogger.error(`${operationName} timed out after ${effectiveTimeout/1000} seconds`);
      }
      return {
        ...fallbackValue,
        timedOut: true,
        error: `Operation timed out after ${effectiveTimeout/1000} seconds`
      };
    }
    
    // Re-throw other errors
    throw error;
  }
}

/**
 * Run a bundle size analysis check
 * @param {Object} options - Options for the check
 * @returns {Promise<{success: boolean, error?: string, data?: any}>} - Result
 */
export async function runBundleSizeCheck(options = {}) {
  const { verbose = false, silentMode = false } = options;
  
  // Update silent mode setting
  silentLogger.setSilent(silentMode);
  
  silentLogger.info("Running bundle size analysis...");
  
  try {
    // Try to use the module function
    if (typeof analyzeBundles === 'function') {
      // Set a timeout to prevent hanging
      const result = await runWithTimeout(
        analyzeBundles({
          verbose: options.verbose,
          compareToPrevious: true,
          saveReport: true,
          silent: true // Always silence inner module logging
        }),
        60000,
        "Bundle size analysis",
        { success: true },
        options
      );
      
      if (result.sizeIncrease && result.sizeIncrease > 10) {
        silentLogger.warn(`Bundle size increased by ${result.sizeIncrease}% compared to the previous build.`);
        return { 
          success: false, 
          data: result,
          warning: true,
          message: `Bundle size increased by ${result.sizeIncrease}%` 
        };
      }
      
      silentLogger.success("Bundle size check passed.");
      return { success: true, data: result };
    } else {
      // Fallback to command line
      silentLogger.info("Using command line fallback for bundle size check");
      execSync('pnpm run analyze-bundle', { 
        stdio: silentMode ? 'ignore' : 'inherit', 
        timeout: options.timeout?.bundlesize || 60000 
      });
      return { success: true };
    }
  } catch (error) {
    silentLogger.error("Bundle size check failed:", error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Run dead code detection
 * @param {Object} options - Options for the check
 * @returns {Promise<{success: boolean, error?: string, data?: any}>} - Result
 */
export async function runDeadCodeCheck(options = {}) {
  const { verbose = false, silentMode = false } = options;
  
  // Update silent mode setting
  silentLogger.setSilent(silentMode);
  
  silentLogger.info("Running dead code detection...");
  
  try {
    // Try to use the module function
    if (typeof analyzeDeadCode === 'function') {
      const result = await runWithTimeout(
        analyzeDeadCode({
          verbose: options.verbose,
          saveReport: true,
          silent: true
        }),
        45000,
        "Dead code detection",
        { success: true },
        options
      );
      
      const deadCodeCount = result.totalFiles || 0;
      if (deadCodeCount > 0) {
        silentLogger.warn(`Found ${deadCodeCount} files with potentially unused code.`);
        return { 
          success: false, 
          data: result,
          warning: true,
          message: `Found ${deadCodeCount} files with potentially unused code` 
        };
      }
      
      silentLogger.success("No dead code found.");
      return { success: true, data: result };
    } else {
      // Fallback to command line
      silentLogger.info("Using command line fallback for dead code check");
      execSync('pnpm run detect-deadcode', { 
        stdio: silentMode ? 'ignore' : 'inherit', 
        timeout: options.timeout?.deadcode || 45000 
      });
      return { success: true };
    }
  } catch (error) {
    silentLogger.warn(`Dead code check error: ${error.message}`);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Run documentation quality check
 * @param {Object} options - Options for the check
 * @returns {Promise<{success: boolean, error?: string, data?: any}>} - Result
 */
export async function runDocsQualityCheck(options = {}) {
  const { verbose = false, silentMode = false } = options;
  
  // Update silent mode setting
  silentLogger.setSilent(silentMode);
  
  silentLogger.info("Checking documentation quality...");
  
  try {
    // Try to use the module function
    if (typeof analyzeDocumentation === 'function') {
      const result = await runWithTimeout(
        analyzeDocumentation({
          verbose: options.verbose,
          saveReport: true,
          silent: true
        }),
        30000,
        "Documentation quality check",
        { success: true },
        options
      );
      
      const issuesCount = result.totalIssues || 0;
      if (issuesCount > 0) {
        silentLogger.warn(`Found ${issuesCount} documentation quality issues.`);
        return { 
          success: false, 
          data: result,
          warning: true,
          message: `Found ${issuesCount} documentation quality issues` 
        };
      }
      
      silentLogger.success("Documentation quality check passed.");
      return { success: true, data: result };
    } else {
      // Fallback to command line
      silentLogger.info("Using command line fallback for documentation quality check");
      execSync('pnpm run check-docs', { 
        stdio: silentMode ? 'ignore' : 'inherit', 
        timeout: options.timeout?.docsquality || 30000 
      });
      return { success: true };
    }
  } catch (error) {
    silentLogger.warn(`Documentation quality check error: ${error.message}`);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Run documentation freshness check
 * @param {Object} options - Options for the check
 * @returns {Promise<{success: boolean, error?: string, data?: any}>} - Result
 */
export async function runDocsFreshnessCheck(options = {}) {
  const { verbose = false, silentMode = false } = options;
  
  // Update silent mode setting
  silentLogger.setSilent(silentMode);
  
  silentLogger.info("Checking documentation freshness...");
  
  try {
    // Try to use the module function with timeout
    if (typeof checkDocumentation === 'function') {
      const result = await runWithTimeout(
        checkDocumentation({
          verbose: options.verbose,
          saveReport: true,
          silent: true
        }),
        30000,
        "Documentation freshness check",
        { success: true, staleDocuments: [] },
        options
      );
      
      const staleDocsCount = result.staleDocuments?.length || 0;
      if (staleDocsCount > 0) {
        silentLogger.warn(`Found ${staleDocsCount} stale documentation files.`);
        return { 
          success: false, 
          data: result,
          warning: true,
          message: `Found ${staleDocsCount} stale documentation files` 
        };
      }
      
      silentLogger.success("Documentation freshness check passed.");
      return { success: true, data: result };
    } else {
      // Fallback to command line
      silentLogger.info("Using command line fallback for documentation freshness check");
      execSync('pnpm run docs:freshness', { 
        stdio: silentMode ? 'ignore' : 'inherit', 
        timeout: options.timeout?.docsfreshness || 30000 
      });
      return { success: true };
    }
  } catch (error) {
    silentLogger.warn(`Documentation freshness check error: ${error.message}`);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Run TypeScript check
 * @param {Object} options - Options for the check
 * @returns {Promise<{success: boolean, error?: string, data?: any}>} - Result
 */
export async function runAdvancedTypeScriptCheck(options = {}) {
  const { verbose = false, silentMode = false } = options;
  
  // Update silent mode setting
  silentLogger.setSilent(silentMode);
  
  silentLogger.info("Running advanced TypeScript check...");
  
  try {
    // Try to use the module function
    if (typeof runTypeCheck === 'function') {
      const result = await runWithTimeout(
        runTypeCheck({
          verbose: options.verbose,
          saveReport: true,
          silent: true
        }),
        45000,
        "TypeScript check",
        { success: true },
        options
      );
      
      if (!result.success) {
        silentLogger.warn(`TypeScript check failed with ${result.errors?.length || 0} errors.`);
        return { 
          success: false, 
          data: result,
          warning: false, // TypeScript errors should be considered blocking
          message: `TypeScript check failed with ${result.errors?.length || 0} errors` 
        };
      }
      
      silentLogger.success("TypeScript check passed.");
      return { success: true, data: result };
    } else {
      // Fallback to command line
      silentLogger.info("Using command line fallback for TypeScript check");
      execSync('pnpm run workflow:typecheck', { 
        stdio: silentMode ? 'ignore' : 'inherit', 
        timeout: options.timeout?.typecheck || 45000 
      });
      return { success: true };
    }
  } catch (error) {
    silentLogger.error(`TypeScript check error: ${error.message}`);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Run ESLint check
 * @param {Object} options - Options for the check
 * @returns {Promise<{success: boolean, error?: string, data?: any}>} - Result
 */
export async function runAdvancedLintCheck(options = {}) {
  const { verbose = false, silentMode = false } = options;
  
  // Update silent mode setting
  silentLogger.setSilent(silentMode);
  
  silentLogger.info("Running advanced ESLint check...");
  
  try {
    // Try to use the module function
    if (typeof runLint === 'function') {
      const result = await runWithTimeout(
        runLint({
          verbose: options.verbose,
          saveReport: true,
          silent: true
        }),
        45000,
        "ESLint check",
        { success: true },
        options
      );
      
      if (!result.success) {
        silentLogger.warn(`ESLint check failed with ${result.errorCount || 0} errors.`);
        return { 
          success: false, 
          data: result,
          warning: options.treatLintAsWarning || false,
          message: `ESLint check failed with ${result.errorCount || 0} errors` 
        };
      }
      
      silentLogger.success("ESLint check passed.");
      return { success: true, data: result };
    } else {
      // Fallback to command line
      silentLogger.info("Using command line fallback for ESLint check");
      execSync('pnpm run lint', { 
        stdio: silentMode ? 'ignore' : 'inherit', 
        timeout: options.timeout?.lint || 45000 
      });
      return { success: true };
    }
  } catch (error) {
    silentLogger.warn(`ESLint check error: ${error.message}`);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Run workflow validation check
 * @param {Object} options - Options for the check
 * @returns {Promise<{success: boolean, error?: string, data?: any}>} - Result
 */
export async function runWorkflowValidationCheck(options = {}) {
  const { verbose = false, silentMode = false } = options;
  
  // Update silent mode setting
  silentLogger.setSilent(silentMode);
  
  silentLogger.info("Running workflow validation...");
  
  try {
    // Try to use the module function
    if (typeof validateWorkflows === 'function') {
      const result = await runWithTimeout(
        validateWorkflows({
          verbose: options.verbose,
          saveReport: true,
          silent: true
        }),
        30000,
        "Workflow validation",
        { success: true },
        options
      );
      
      if (!result.success) {
        silentLogger.warn(`Workflow validation failed with ${result.issues?.length || 0} issues.`);
        return { 
          success: false, 
          data: result,
          warning: true,
          message: `Workflow validation failed with ${result.issues?.length || 0} issues` 
        };
      }
      
      silentLogger.success("Workflow validation passed.");
      return { success: true, data: result };
    } else {
      // Fallback to command line
      silentLogger.info("Using command line fallback for workflow validation");
      execSync('pnpm run workflow:validate', { 
        stdio: silentMode ? 'ignore' : 'inherit', 
        timeout: options.timeout?.workflowvalidation || 30000 
      });
      return { success: true };
    }
  } catch (error) {
    silentLogger.warn(`Workflow validation error: ${error.message}`);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Run health checks
 * @param {Object} options - Options for the check
 * @returns {Promise<{success: boolean, error?: string, data?: any}>} - Result
 */
export async function runProjectHealthCheck(options = {}) {
  const { verbose = false, silentMode = false } = options;
  
  // Update silent mode setting
  silentLogger.setSilent(silentMode);
  
  silentLogger.info("Running project health checks...");
  
  try {
    // Try to use the module function
    if (typeof runHealthChecks === 'function') {
      const result = await runWithTimeout(
        runHealthChecks({
          verbose: options.verbose,
          silent: true,
          ...options
        }),
        60000,
        "Health checks",
        { success: true },
        options
      );
      
      if (!result.success) {
        silentLogger.warn(`Health checks found ${result.issues?.length || 0} issues.`);
        return { 
          success: false, 
          data: result,
          warning: options.treatHealthAsWarning || false,
          message: `Health checks found ${result.issues?.length || 0} issues` 
        };
      }
      
      silentLogger.success("Health checks passed.");
      return { success: true, data: result };
    } else {
      // Health checks are critical, so no fallback
      silentLogger.error("Health checker module not available");
      return { 
        success: false, 
        error: "Health checker module not available" 
      };
    }
  } catch (error) {
    silentLogger.error(`Health check error: ${error.message}`);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Run all advanced checks
 * @param {Object} options - Options for checks
 * @param {Function} options.promptFn - Function to prompt the user
 * @returns {Promise<{success: boolean, results: Object}>} - Overall result and individual results
 */
export async function runAllAdvancedChecks(options = {}) {
  const {
    silentMode = false,
    ...restOptions
  } = options;
  
  // Set silent mode for the logger
  silentLogger.setSilent(silentMode);
  
  // Initialize results object with default values
  const results = {
    bundleSize: { success: true, skipped: false },
    deadCode: { success: true, skipped: false },
    docsQuality: { success: true, skipped: false },
    docsFreshness: { success: true, skipped: false },
    typescript: { success: true, skipped: false },
    lint: { success: true, skipped: false },
    workflowValidation: { success: true, skipped: false },
    health: { success: true, skipped: false }
  };
  
  // Skip if requested
  if (options.skipAdvancedChecks) {
    silentLogger.info("Skipping advanced checks as requested.");
    
    // Mark all checks as skipped
    Object.keys(results).forEach(key => {
      results[key].skipped = true;
    });
    
    return { 
      success: true, 
      skipped: true,
      results 
    };
  }
  
  silentLogger.info("Running comprehensive code quality checks...");
  
  // Run health checks first since they're more fundamental
  if (!options.skipHealthCheck) {
    try {
      results.health = await runProjectHealthCheck({
        ...restOptions,
        silentMode, // Pass silentMode to suppress duplicate logging
        quiet: true // Reduce output verbosity from health checks
      });
      // Ensure the result is valid even if the function returns undefined
      if (!results.health) {
        results.health = { success: false, error: "Health check returned no result" };
      }
    } catch (error) {
      silentLogger.error(`Health check error: ${error.message}`);
      results.health = { 
        success: false, 
        error: error.message,
        warning: options.treatHealthAsWarning || false
      };
    }
  } else {
    silentLogger.info("Skipping health checks as requested.");
    results.health = { success: true, skipped: true };
  }
  
  // Run TypeScript check
  if (!options.skipTypeCheck) {
    try {
      results.typescript = await runAdvancedTypeScriptCheck({
        ...restOptions,
        silentMode
      });
      // Ensure the result is valid even if the function returns undefined
      if (!results.typescript) {
        results.typescript = { success: false, error: "TypeScript check returned no result" };
      }
    } catch (error) {
      silentLogger.error(`TypeScript check error: ${error.message}`);
      results.typescript = { success: false, error: error.message };
    }
  } else {
    silentLogger.info("Skipping TypeScript check as requested.");
    results.typescript = { success: true, skipped: true };
  }
  
  // Run ESLint check
  if (!options.skipLintCheck) {
    try {
      results.lint = await runAdvancedLintCheck({
        ...restOptions,
        silentMode
      });
      // Ensure the result is valid even if the function returns undefined
      if (!results.lint) {
        results.lint = { success: false, error: "Lint check returned no result" };
      }
    } catch (error) {
      silentLogger.error(`Lint check error: ${error.message}`);
      results.lint = { 
        success: false, 
        error: error.message,
        warning: options.treatLintAsWarning || false
      };
    }
  } else {
    silentLogger.info("Skipping ESLint check as requested.");
    results.lint = { success: true, skipped: true };
  }
  
  // Run workflow validation
  if (!options.skipWorkflowValidation) {
    try {
      results.workflowValidation = await runWorkflowValidationCheck({
        ...restOptions,
        silentMode
      });
      // Ensure the result is valid even if the function returns undefined
      if (!results.workflowValidation) {
        results.workflowValidation = { success: false, error: "Workflow validation returned no result" };
      }
    } catch (error) {
      silentLogger.error(`Workflow validation error: ${error.message}`);
      results.workflowValidation = { success: false, error: error.message, warning: true };
    }
  } else {
    silentLogger.info("Skipping workflow validation as requested.");
    results.workflowValidation = { success: true, skipped: true };
  }
  
  // Run bundle size check
  if (!options.skipBundleCheck) {
    try {
      results.bundleSize = await runBundleSizeCheck({
        ...restOptions,
        silentMode
      });
      // Ensure the result is valid even if the function returns undefined
      if (!results.bundleSize) {
        results.bundleSize = { success: false, error: "Bundle size check returned no result" };
      }
    } catch (error) {
      silentLogger.error(`Bundle size check error: ${error.message}`);
      results.bundleSize = { success: false, error: error.message, warning: true };
    }
  } else {
    silentLogger.info("Skipping bundle size check as requested.");
    results.bundleSize = { success: true, skipped: true };
  }
  
  // Run dead code check
  if (!options.skipDeadCodeCheck) {
    try {
      results.deadCode = await runDeadCodeCheck({
        ...restOptions,
        silentMode
      });
      // Ensure the result is valid even if the function returns undefined
      if (!results.deadCode) {
        results.deadCode = { success: false, error: "Dead code check returned no result" };
      }
    } catch (error) {
      silentLogger.error(`Dead code check error: ${error.message}`);
      results.deadCode = { success: false, error: error.message, warning: true };
    }
  } else {
    silentLogger.info("Skipping dead code check as requested.");
    results.deadCode = { success: true, skipped: true };
  }
  
  // Run docs quality check
  if (!options.skipDocsCheck) {
    try {
      results.docsQuality = await runDocsQualityCheck({
        ...restOptions,
        silentMode
      });
      // Ensure the result is valid even if the function returns undefined
      if (!results.docsQuality) {
        results.docsQuality = { success: false, error: "Docs quality check returned no result" };
      }
    } catch (error) {
      silentLogger.error(`Docs quality check error: ${error.message}`);
      results.docsQuality = { success: false, error: error.message, warning: true };
    }
  } else {
    silentLogger.info("Skipping documentation quality check as requested.");
    results.docsQuality = { success: true, skipped: true };
  }
  
  // Run docs freshness check
  if (!options.skipDocsFreshnessCheck) {
    try {
      results.docsFreshness = await runDocsFreshnessCheck({
        ...restOptions,
        silentMode
      });
      // Ensure the result is valid even if the function returns undefined
      if (!results.docsFreshness) {
        results.docsFreshness = { success: false, error: "Docs freshness check returned no result" };
      }
    } catch (error) {
      silentLogger.error(`Docs freshness check error: ${error.message}`);
      results.docsFreshness = { success: false, error: error.message, warning: true };
    }
  } else {
    silentLogger.info("Skipping documentation freshness check as requested.");
    results.docsFreshness = { success: true, skipped: true };
  }
  
  // Safely collect warnings
  const warnings = Object.entries(results)
    .filter(([, result]) => result && result.warning === true)
    .map(([key, result]) => ({
      key,
      message: result.message || result.error || `Warning in ${key} check`
    }));
  
  if (warnings.length > 0 && options.promptFn) {
    silentLogger.warn("The following warnings were found in quality checks:");
    warnings.forEach(({key, message}, index) => {
      silentLogger.warn(`${index + 1}. [${key}] ${message}`);
    });
    
    try {
      const shouldContinue = await options.promptFn(
        "Continue despite these warnings? (Y/n)", 
        "Y"
      );
      
      if (shouldContinue.toLowerCase() === 'n') {
        silentLogger.info("Exiting workflow due to quality check warnings.");
        return { 
          success: false, 
          results,
          warnings: warnings.map(w => w.message)
        };
      }
    } catch (error) {
      silentLogger.warn(`Warning prompt failed: ${error.message}. Continuing.`);
    }
  }
  
  // Safely check for critical errors (non-warnings)
  const criticalErrors = Object.entries(results)
    .filter(([, result]) => result && 
                           !result.success && 
                           result.warning !== true && 
                           !result.skipped)
    .map(([key, result]) => ({
      key,
      message: result.message || result.error || `${key} check failed`
    }));
    
  const hasCriticalErrors = criticalErrors.length > 0;
  
  if (hasCriticalErrors && options.promptFn) {
    silentLogger.error("Critical errors found in quality checks:");
    criticalErrors.forEach(({key, message}, index) => {
      silentLogger.error(`${index + 1}. [${key}] ${message}`);
    });
    
    try {
      const shouldContinue = await options.promptFn(
        "Continue despite critical errors? (y/N)", 
        "N"
      );
      
      if (shouldContinue.toLowerCase() !== 'y') {
        silentLogger.info("Exiting workflow due to critical quality check errors.");
        return { 
          success: false, 
          results,
          errors: criticalErrors.map(e => e.message)
        };
      }
    } catch (error) {
      silentLogger.warn(`Error prompt failed: ${error.message}. Continuing.`);
    }
  }
  
  silentLogger.success("Quality checks complete!");
  
  return {
    success: !hasCriticalErrors || options.ignoreAdvancedFailures,
    warnings: warnings.length > 0 ? warnings.map(w => w.message) : null,
    errors: hasCriticalErrors ? criticalErrors.map(e => e.message) : null,
    results
  };
}

/**
 * Run a single advanced check with direct workflow integration
 * 
 * @param {string} checkName - Name of the check to run
 * @param {Object} options - Check options
 * @param {string} [options.phase='Validation'] - Current workflow phase
 * @returns {Promise<Object>} Check result
 */
export async function runSingleCheckWithWorkflowIntegration(checkName, options = {}) {
  const { 
    phase = 'Validation',
    ...checkOptions
  } = options;
  
  // Get workflow state for tracking
  const workflowState = getWorkflowState();
  
  const stepName = `${checkName} Check`;
  const startTime = Date.now();
  
  // Start step tracking
  workflowState.setCurrentStep(stepName);
  
  // Set silent mode based on options - we'll handle our own logging
  const isSilent = checkOptions.silentMode !== false;
  silentLogger.setSilent(isSilent);
  
  try {
    // Select the appropriate check function
    let checkFunction;
    switch(checkName.toLowerCase()) {
      case 'bundle':
      case 'bundlesize':
        checkFunction = runBundleSizeCheck;
        break;
      case 'deadcode':
        checkFunction = runDeadCodeCheck;
        break;
      case 'docs':
      case 'documentation':
        checkFunction = runDocsQualityCheck;
        break;
      case 'docfreshness':
        checkFunction = runDocsFreshnessCheck;
        break;
      case 'typescript':
        checkFunction = runAdvancedTypeScriptCheck;
        break;
      case 'lint':
        checkFunction = runAdvancedLintCheck;
        break;
      case 'workflow':
      case 'workflowvalidation':
        checkFunction = runWorkflowValidationCheck;
        break;
      case 'health':
        checkFunction = runProjectHealthCheck;
        break;
      default: {
        const error = `Unknown advanced check: ${checkName}`;
        workflowState.addWarning(error, stepName, phase);
        workflowState.completeStep(stepName, { success: false, error });
        return { success: false, error };
      }
    }
    
    // Run the check with timeout handling
    const checkResult = await runWithTimeout(
      checkFunction(checkOptions),
      options.timeout?.[checkName.toLowerCase()] || 60000,
      `${checkName} Check`,
      { success: false, error: `${checkName} check timed out` },
      checkOptions
    );
    
    // Record specific warnings based on check type
    if (checkResult.data) {
      if (checkName.toLowerCase() === 'bundle' || checkName.toLowerCase() === 'bundlesize') {
        // Bundle size warnings
        if (checkResult.data.issues) {
          checkResult.data.issues.forEach(issue => {
            workflowState.addWarning(`Bundle size issue: ${issue.message}`, stepName, phase);
          });
        }
        
        if (checkResult.data.sizeIncrease && checkResult.data.sizeIncrease > 10) {
          workflowState.addWarning(`Bundle size increased by ${checkResult.data.sizeIncrease}% compared to the previous build`, stepName, phase);
        }
      } 
      
      else if (checkName.toLowerCase() === 'deadcode') {
        // Dead code warnings
        if (checkResult.data.files) {
          checkResult.data.files.forEach(file => {
            workflowState.addWarning(`Potential dead code: ${file.path} (${file.confidence}% confidence)`, stepName, phase);
          });
        }
      } 
      
      else if (checkName.toLowerCase() === 'docs' || checkName.toLowerCase() === 'documentation') {
        // Documentation quality warnings
        if (checkResult.data.issues) {
          checkResult.data.issues.forEach(issue => {
            workflowState.addWarning(`Documentation issue: ${issue.message} (${issue.file})`, stepName, phase);
          });
        }
      } 
      
      else if (checkName.toLowerCase() === 'docfreshness') {
        // Documentation freshness warnings
        if (checkResult.data.staleDocuments) {
          checkResult.data.staleDocuments.forEach(doc => {
            workflowState.addWarning(`Stale documentation: ${doc.file} (last updated ${doc.lastUpdated})`, stepName, phase);
          });
        }
      } 
      
      else if (checkName.toLowerCase() === 'typescript') {
        // TypeScript warnings
        if (checkResult.data.errors) {
          checkResult.data.errors.forEach(issue => {
            workflowState.addWarning(`TypeScript issue: ${issue.message} (${issue.file}:${issue.line})`, stepName, phase);
          });
        }
      } 
      
      else if (checkName.toLowerCase() === 'lint') {
        // Lint warnings
        if (checkResult.data.issues) {
          checkResult.data.issues.forEach(issue => {
            workflowState.addWarning(`Lint issue: ${issue.message} (${issue.file}:${issue.line})`, stepName, phase);
          });
        }
      } 
      
      else if (checkName.toLowerCase() === 'workflow' || checkName.toLowerCase() === 'workflowvalidation') {
        // Workflow validation warnings
        if (checkResult.data.issues) {
          checkResult.data.issues.forEach(issue => {
            workflowState.addWarning(`Workflow validation issue: ${issue.message}`, stepName, phase);
          });
        }
      } 
      
      else if (checkName.toLowerCase() === 'health') {
        // Health check warnings
        if (checkResult.data.stats && checkResult.data.stats.security) {
          const security = checkResult.data.stats.security;
          
          // Security vulnerabilities
          if (security.vulnerabilities && security.vulnerabilities.details) {
            security.vulnerabilities.details.forEach(vuln => {
              workflowState.addWarning(`Security vulnerability: ${vuln.package} (${vuln.severity}) - ${vuln.description}`, stepName, phase);
            });
          }
          
          // Security issues
          if (security.issues) {
            security.issues.forEach(issue => {
              workflowState.addWarning(`Security issue: ${issue.message}`, stepName, phase);
            });
          }
        }
        
        // Performance issues
        if (checkResult.data.stats && checkResult.data.stats.performance && checkResult.data.stats.performance.issues) {
          checkResult.data.stats.performance.issues.forEach(issue => {
            workflowState.addWarning(`Performance issue: ${issue.message}`, stepName, phase);
          });
        }
      }
    }
    
    // Record warnings for timeouts
    if (checkResult.timedOut) {
      workflowState.addWarning(`${checkName} check timed out after ${options.timeout?.[checkName.toLowerCase()] || 60000}ms`, stepName, phase);
    }
    
    // Update metrics with check data
    if (checkResult.data) {
      workflowState.updateMetrics({
        advancedChecks: {
          ...(workflowState.state.metrics.advancedChecks || {}),
          [checkName.toLowerCase()]: checkResult.data
        }
      });
    }
    
    // Complete step tracking
    workflowState.completeStep(stepName, { 
      success: checkResult.success,
      data: checkResult.data,
      duration: Date.now() - startTime
    });
    
    return checkResult;
  } catch (error) {
    // Record error as a warning
    workflowState.addWarning(`${checkName} check error: ${error.message}`, stepName, phase);
    workflowState.trackError(error, stepName);
    
    // Complete step with failure
    workflowState.completeStep(stepName, { 
      success: false, 
      error: error.message,
      duration: Date.now() - startTime
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

export default {
  runBundleSizeCheck,
  runDeadCodeCheck,
  runDocsQualityCheck,
  runDocsFreshnessCheck,
  runAdvancedTypeScriptCheck,
  runAdvancedLintCheck,
  runWorkflowValidationCheck,
  runProjectHealthCheck,
  runAllAdvancedChecks,
  runSingleCheckWithWorkflowIntegration
}; 