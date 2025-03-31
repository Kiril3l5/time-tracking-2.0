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
  // Allow overriding the timeout from options
  const customTimeout = options.timeout && options.timeout[operationName.toLowerCase().replace(/\s+/g, '')];
  const effectiveTimeout = customTimeout || timeoutMs;
  
  if (options.verbose && !options.silentMode) {
    logger.debug(`Running '${operationName}' with ${effectiveTimeout/1000}s timeout`);
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
        logger.error(`${operationName} timed out after ${effectiveTimeout/1000} seconds`);
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
  
  if (!silentMode) {
    logger.info("Running bundle size analysis...");
  }
  
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
        if (!silentMode) {
          logger.warn(`Bundle size increased by ${result.sizeIncrease}% compared to the previous build.`);
        }
        return { 
          success: false, 
          data: result,
          warning: true,
          message: `Bundle size increased by ${result.sizeIncrease}%` 
        };
      }
      
      if (!silentMode) {
        logger.success("Bundle size check passed.");
      }
      return { success: true, data: result };
    } else {
      // Fallback to command line
      if (!silentMode) {
        logger.info("Using command line fallback for bundle size check");
      }
      execSync('pnpm run analyze-bundle', { 
        stdio: silentMode ? 'ignore' : 'inherit', 
        timeout: options.timeout?.bundlesize || 60000 
      });
      return { success: true };
    }
  } catch (error) {
    if (!silentMode) {
      logger.error("Bundle size check failed:", error);
    }
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
  
  if (!silentMode) {
    logger.info("Running dead code detection...");
  }
  
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
        if (!silentMode) {
          logger.warn(`Found ${deadCodeCount} files with potentially unused code.`);
        }
        return { 
          success: false, 
          data: result,
          warning: true,
          message: `Found ${deadCodeCount} files with potentially unused code` 
        };
      }
      
      if (!silentMode) {
        logger.success("No dead code found.");
      }
      return { success: true, data: result };
    } else {
      // Fallback to command line
      if (!silentMode) {
        logger.info("Using command line fallback for dead code check");
      }
      execSync('pnpm run detect-deadcode', { 
        stdio: silentMode ? 'ignore' : 'inherit', 
        timeout: options.timeout?.deadcode || 45000 
      });
      return { success: true };
    }
  } catch (error) {
    if (!silentMode) {
      logger.warn(`Dead code check error: ${error.message}`);
    }
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
  
  if (!silentMode) {
    logger.info("Checking documentation quality...");
  }
  
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
        if (!silentMode) {
          logger.warn(`Found ${issuesCount} documentation quality issues.`);
        }
        return { 
          success: false, 
          data: result,
          warning: true,
          message: `Found ${issuesCount} documentation quality issues` 
        };
      }
      
      if (!silentMode) {
        logger.success("Documentation quality check passed.");
      }
      return { success: true, data: result };
    } else {
      // Fallback to command line
      if (!silentMode) {
        logger.info("Using command line fallback for documentation quality check");
      }
      execSync('pnpm run check-docs', { 
        stdio: silentMode ? 'ignore' : 'inherit', 
        timeout: options.timeout?.docsquality || 30000 
      });
      return { success: true };
    }
  } catch (error) {
    if (!silentMode) {
      logger.warn(`Documentation quality check error: ${error.message}`);
    }
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
  
  if (!silentMode) {
    logger.info("Checking documentation freshness...");
  }
  
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
        if (!silentMode) {
          logger.warn(`Found ${staleDocsCount} stale documentation files.`);
        }
        return { 
          success: false, 
          data: result,
          warning: true,
          message: `Found ${staleDocsCount} stale documentation files` 
        };
      }
      
      if (!silentMode) {
        logger.success("Documentation freshness check passed.");
      }
      return { success: true, data: result };
    } else {
      // Fallback to command line
      if (!silentMode) {
        logger.info("Using command line fallback for documentation freshness check");
      }
      execSync('pnpm run docs:freshness', { 
        stdio: silentMode ? 'ignore' : 'inherit', 
        timeout: options.timeout?.docsfreshness || 30000 
      });
      return { success: true };
    }
  } catch (error) {
    if (!silentMode) {
      logger.warn(`Documentation freshness check error: ${error.message}`);
    }
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
  
  if (!silentMode) {
    logger.info("Running advanced TypeScript check...");
  }
  
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
        if (!silentMode) {
          logger.warn(`TypeScript check failed with ${result.errors?.length || 0} errors.`);
        }
        return { 
          success: false, 
          data: result,
          warning: false, // TypeScript errors should be considered blocking
          message: `TypeScript check failed with ${result.errors?.length || 0} errors` 
        };
      }
      
      if (!silentMode) {
        logger.success("TypeScript check passed.");
      }
      return { success: true, data: result };
    } else {
      // Fallback to command line
      if (!silentMode) {
        logger.info("Using command line fallback for TypeScript check");
      }
      execSync('pnpm run workflow:typecheck', { 
        stdio: silentMode ? 'ignore' : 'inherit', 
        timeout: options.timeout?.typecheck || 45000 
      });
      return { success: true };
    }
  } catch (error) {
    if (!silentMode) {
      logger.error(`TypeScript check error: ${error.message}`);
    }
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
  
  if (!silentMode) {
    logger.info("Running advanced ESLint check...");
  }
  
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
        if (!silentMode) {
          logger.warn(`ESLint check failed with ${result.errorCount || 0} errors.`);
        }
        return { 
          success: false, 
          data: result,
          warning: options.treatLintAsWarning || false,
          message: `ESLint check failed with ${result.errorCount || 0} errors` 
        };
      }
      
      if (!silentMode) {
        logger.success("ESLint check passed.");
      }
      return { success: true, data: result };
    } else {
      // Fallback to command line
      if (!silentMode) {
        logger.info("Using command line fallback for ESLint check");
      }
      execSync('pnpm run lint', { 
        stdio: silentMode ? 'ignore' : 'inherit', 
        timeout: options.timeout?.lint || 45000 
      });
      return { success: true };
    }
  } catch (error) {
    if (!silentMode) {
      logger.warn(`ESLint check error: ${error.message}`);
    }
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
  
  if (!silentMode) {
    logger.info("Running workflow validation...");
  }
  
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
        if (!silentMode) {
          logger.warn(`Workflow validation failed with ${result.issues?.length || 0} issues.`);
        }
        return { 
          success: false, 
          data: result,
          warning: true,
          message: `Workflow validation failed with ${result.issues?.length || 0} issues` 
        };
      }
      
      if (!silentMode) {
        logger.success("Workflow validation passed.");
      }
      return { success: true, data: result };
    } else {
      // Fallback to command line
      if (!silentMode) {
        logger.info("Using command line fallback for workflow validation");
      }
      execSync('pnpm run workflow:validate', { 
        stdio: silentMode ? 'ignore' : 'inherit', 
        timeout: options.timeout?.workflowvalidation || 30000 
      });
      return { success: true };
    }
  } catch (error) {
    if (!silentMode) {
      logger.warn(`Workflow validation error: ${error.message}`);
    }
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
  
  if (!silentMode) {
    logger.info("Running project health checks...");
  }
  
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
        if (!silentMode) {
          logger.warn(`Health checks found ${result.issues?.length || 0} issues.`);
        }
        return { 
          success: false, 
          data: result,
          warning: options.treatHealthAsWarning || false,
          message: `Health checks found ${result.issues?.length || 0} issues` 
        };
      }
      
      if (!silentMode) {
        logger.success("Health checks passed.");
      }
      return { success: true, data: result };
    } else {
      // Health checks are critical, so no fallback
      if (!silentMode) {
        logger.error("Health checker module not available");
      }
      return { 
        success: false, 
        error: "Health checker module not available" 
      };
    }
  } catch (error) {
    if (!silentMode) {
      logger.error(`Health check error: ${error.message}`);
    }
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
    if (!silentMode) {
      logger.info("Skipping advanced checks as requested.");
    }
    
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
  
  if (!silentMode) {
    logger.info("Running comprehensive code quality checks...");
  }
  
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
      if (!silentMode) {
        logger.error(`Health check error: ${error.message}`);
      }
      results.health = { 
        success: false, 
        error: error.message,
        warning: options.treatHealthAsWarning || false
      };
    }
  } else {
    if (!silentMode) {
      logger.info("Skipping health checks as requested.");
    }
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
      if (!silentMode) {
        logger.error(`TypeScript check error: ${error.message}`);
      }
      results.typescript = { success: false, error: error.message };
    }
  } else {
    if (!silentMode) {
      logger.info("Skipping TypeScript check as requested.");
    }
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
      if (!silentMode) {
        logger.error(`Lint check error: ${error.message}`);
      }
      results.lint = { 
        success: false, 
        error: error.message,
        warning: options.treatLintAsWarning || false
      };
    }
  } else {
    if (!silentMode) {
      logger.info("Skipping ESLint check as requested.");
    }
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
      if (!silentMode) {
        logger.error(`Workflow validation error: ${error.message}`);
      }
      results.workflowValidation = { success: false, error: error.message, warning: true };
    }
  } else {
    if (!silentMode) {
      logger.info("Skipping workflow validation as requested.");
    }
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
      if (!silentMode) {
        logger.error(`Bundle size check error: ${error.message}`);
      }
      results.bundleSize = { success: false, error: error.message, warning: true };
    }
  } else {
    if (!silentMode) {
      logger.info("Skipping bundle size check as requested.");
    }
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
      if (!silentMode) {
        logger.error(`Dead code check error: ${error.message}`);
      }
      results.deadCode = { success: false, error: error.message, warning: true };
    }
  } else {
    if (!silentMode) {
      logger.info("Skipping dead code check as requested.");
    }
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
      if (!silentMode) {
        logger.error(`Docs quality check error: ${error.message}`);
      }
      results.docsQuality = { success: false, error: error.message, warning: true };
    }
  } else {
    if (!silentMode) {
      logger.info("Skipping documentation quality check as requested.");
    }
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
      if (!silentMode) {
        logger.error(`Docs freshness check error: ${error.message}`);
      }
      results.docsFreshness = { success: false, error: error.message, warning: true };
    }
  } else {
    if (!silentMode) {
      logger.info("Skipping documentation freshness check as requested.");
    }
    results.docsFreshness = { success: true, skipped: true };
  }
  
  // Safely collect warnings
  const warnings = Object.entries(results)
    .filter(([, result]) => result && result.warning === true)
    .map(([key, result]) => ({
      key,
      message: result.message || result.error || `Warning in ${key} check`
    }));
  
  if (warnings.length > 0 && options.promptFn && !silentMode) {
    logger.warn("The following warnings were found in quality checks:");
    warnings.forEach(({key, message}, index) => {
      logger.warn(`${index + 1}. [${key}] ${message}`);
    });
    
    try {
      const shouldContinue = await options.promptFn(
        "Continue despite these warnings? (Y/n)", 
        "Y"
      );
      
      if (shouldContinue.toLowerCase() === 'n') {
        logger.info("Exiting workflow due to quality check warnings.");
        return { 
          success: false, 
          results,
          warnings: warnings.map(w => w.message)
        };
      }
    } catch (error) {
      if (!silentMode) {
        logger.warn(`Warning prompt failed: ${error.message}. Continuing.`);
      }
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
  
  if (hasCriticalErrors && options.promptFn && !silentMode) {
    logger.error("Critical errors found in quality checks:");
    criticalErrors.forEach(({key, message}, index) => {
      logger.error(`${index + 1}. [${key}] ${message}`);
    });
    
    try {
      const shouldContinue = await options.promptFn(
        "Continue despite critical errors? (y/N)", 
        "N"
      );
      
      if (shouldContinue.toLowerCase() !== 'y') {
        logger.info("Exiting workflow due to critical quality check errors.");
        return { 
          success: false, 
          results,
          errors: criticalErrors.map(e => e.message)
        };
      }
    } catch (error) {
      if (!silentMode) {
        logger.warn(`Error prompt failed: ${error.message}. Continuing.`);
      }
    }
  }
  
  if (!silentMode) {
    logger.success("Quality checks complete!");
  }
  
  return {
    success: !hasCriticalErrors || options.ignoreAdvancedFailures,
    warnings: warnings.length > 0 ? warnings.map(w => w.message) : null,
    errors: hasCriticalErrors ? criticalErrors.map(e => e.message) : null,
    results
  };
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
  runAllAdvancedChecks
}; 