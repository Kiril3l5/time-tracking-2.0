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
import path from 'path';
import fs from 'fs';
import process from 'node:process';
import { createHash } from 'crypto';

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
 * Simple cache manager for resource-intensive checks
 */
class CheckCache {
  constructor() {
    this.cacheFile = path.join(process.cwd(), 'temp', 'check-cache.json');
    this.cache = null;
    this.loaded = false;
  }
  
  /**
   * Load the cache from disk
   */
  async load() {
    if (this.loaded) return;
    
    try {
      // Create temp directory if it doesn't exist
      const tempDir = path.join(process.cwd(), 'temp');
      try {
        await fs.mkdir(tempDir, { recursive: true });
      } catch (err) {
        // Directory exists or can't be created
      }
      
      // Load cache file
      try {
        const data = await fs.readFile(this.cacheFile, 'utf8');
        this.cache = JSON.parse(data);
      } catch (err) {
        // File doesn't exist or is invalid
        this.cache = {};
      }
    } catch (error) {
      silentLogger.debug(`Failed to load check cache: ${error.message}`);
      this.cache = {};
    }
    
    this.loaded = true;
  }
  
  /**
   * Save the cache to disk
   */
  async save() {
    if (!this.loaded || !this.cache) return;
    
    try {
      await fs.writeFile(this.cacheFile, JSON.stringify(this.cache, null, 2));
    } catch (error) {
      silentLogger.debug(`Failed to save check cache: ${error.message}`);
    }
  }
  
  /**
   * Generate a cache key based on relevant files
   * @param {string} type - Check type
   * @param {string[]} relevantFiles - Files to check for changes
   * @returns {Promise<string>} - Cache key
   */
  async getCacheKey(type, relevantFiles) {
    try {
      const hash = createHash('md5');
      
      // Add check type to the hash
      hash.update(type);
      
      // Add file modification times
      for (const file of relevantFiles) {
        if (fs.existsSync(file)) {
          const stats = await fs.stat(file);
          hash.update(`${file}:${stats.mtimeMs}`);
        }
      }
      
      return hash.digest('hex');
    } catch (error) {
      silentLogger.debug(`Failed to generate cache key: ${error.message}`);
      // Return a timestamp if we can't generate a proper key
      return `${type}-${Date.now()}`;
    }
  }
  
  /**
   * Check if a result is cached and still valid
   * @param {string} key - Cache key
   * @returns {Object|null} - Cached result or null
   */
  get(key) {
    if (!this.loaded || !this.cache || !key) return null;
    
    const entry = this.cache[key];
    if (!entry) return null;
    
    // Check if the cache entry has expired (default: 24 hours)
    const now = Date.now();
    if (entry.expires && entry.expires < now) {
      delete this.cache[key];
      return null;
    }
    
    return entry.result;
  }
  
  /**
   * Store a result in the cache
   * @param {string} key - Cache key
   * @param {Object} result - Result to cache
   * @param {number} ttl - Time to live in milliseconds (default: 24 hours)
   */
  set(key, result, ttl = 24 * 60 * 60 * 1000) {
    if (!this.loaded || !this.cache || !key) return;
    
    this.cache[key] = {
      result,
      expires: Date.now() + ttl,
      timestamp: Date.now()
    };
    
    // Schedule a save
    setTimeout(() => this.save(), 0);
  }
}

// Create a singleton instance
const checkCache = new CheckCache();

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
    // Find build directories to analyze
    const rootDir = process.cwd();
    const buildDirs = [
      path.join(rootDir, 'packages/admin/dist'),
      path.join(rootDir, 'packages/hours/dist')
    ].filter(dir => fs.existsSync(dir));
    
    if (buildDirs.length === 0) {
      silentLogger.warn("No build directories found for bundle analysis. Run the build step first.");
      return {
        success: false,
        error: "No build directories found. Run build step first.",
        warning: true
      };
    }
    
    // Try to use the module function
    if (typeof analyzeBundles === 'function') {
      // Set a timeout to prevent hanging
      const result = await runWithTimeout(
        analyzeBundles({
          directories: buildDirs,
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
      
      if (!result) {
        silentLogger.warn("Bundle size analysis returned no result");
        return { 
          success: false, 
          error: "Bundle size analysis returned no result",
          warning: true
        };
      }
      
      if (result.issues && result.issues.length > 0) {
        const errorCount = result.issues.filter(issue => issue.severity === 'error').length;
        const warningCount = result.issues.filter(issue => issue.severity === 'warning').length;
        
        silentLogger.warn(`Bundle size issues: ${errorCount} errors, ${warningCount} warnings`);
        
        return { 
          success: errorCount === 0, // Only fail on errors, warnings are acceptable
          data: result,
          warning: warningCount > 0,
          message: `Bundle size check found ${errorCount} errors and ${warningCount} warnings` 
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
  
  silentLogger.info("Running dead code analysis...");
  
  try {
    // Define relevant source directories
    const srcDirs = [
      path.join(process.cwd(), 'packages/admin/src'),
      path.join(process.cwd(), 'packages/hours/src'),
      path.join(process.cwd(), 'packages/common/src')
    ];
    
    // Run the analysis
    silentLogger.info("Running fresh dead code analysis...");
    
    const analyzeResult = await runWithTimeout(
      analyzeDeadCode({
        srcDirs,
        verbose: options.verbose,
        excludeTests: true,
        saveReport: true,
        // Add stricter options
        failOnUnusedExports: true,
        failOnEmptyFiles: true,
        failOnDuplicateCode: true,
        minDuplicationPercentage: 20,
        maxAllowedUnusedExports: 5
      }),
      60000,
      "Dead code analysis",
      null, // Don't provide fallback, let it fail
      options
    );
    
    // --- DEBUGGING: Log raw dead code analysis result ---
    logger.debug('--- Raw analyzeDeadCode result START ---');
    logger.debug(JSON.stringify(analyzeResult, null, 2));
    logger.debug('--- Raw analyzeDeadCode result END ---');
    // --- END DEBUGGING ---

    if (!analyzeResult) {
      // Add specific logging if analyzeResult is null/undefined
      logger.error('analyzeDeadCode function returned null or undefined result.');
      throw new Error("Dead code analysis returned no result");
    }
    
    // Categorize issues by severity
    const criticalIssues = [];
    const warnings = [];
    
    // Check for unused exports
    if (analyzeResult.unusedExports && analyzeResult.unusedExports.length > 0) {
      const count = analyzeResult.unusedExports.length;
      const maxAllowed = options.maxAllowedUnusedExports || 5;
      logger.debug(`Found ${count} unused exports (Max allowed: ${maxAllowed})`); // Log count
      if (count > maxAllowed) {
        criticalIssues.push(`Found ${count} unused exports - exceeds maximum allowed (${maxAllowed})`);
      } else {
        warnings.push(`Found ${count} unused exports that could be removed`);
      }
    }
    
    // Check for empty files (Assuming analyzeResult structure might have this)
    if (analyzeResult.emptyFiles && analyzeResult.emptyFiles.length > 0) {
      logger.debug(`Found ${analyzeResult.emptyFiles.length} empty files.`); // Log count
      criticalIssues.push(`Found ${analyzeResult.emptyFiles.length} empty files that should be removed`);
    }
    
    // Check for duplicate code (Assuming analyzeResult structure might have this)
    if (analyzeResult.duplicates && analyzeResult.duplicates.length > 0) {
      const highDuplication = analyzeResult.duplicates.filter(d => d.percentage >= 80);
      const mediumDuplication = analyzeResult.duplicates.filter(d => d.percentage >= 50 && d.percentage < 80);
      logger.debug(`Found ${analyzeResult.duplicates.length} duplicate code instances.`); // Log count
      
      if (highDuplication.length > 0) {
        criticalIssues.push(`Found ${highDuplication.length} instances of high code duplication (>80%)`);
      }
      if (mediumDuplication.length > 0) {
        warnings.push(`Found ${mediumDuplication.length} instances of medium code duplication (50-80%)`);
      }
    }
    
    // Check for deprecated API usage (Assuming analyzeResult structure might have this)
    if (analyzeResult.deprecatedUsage && analyzeResult.deprecatedUsage.length > 0) {
      logger.debug(`Found ${analyzeResult.deprecatedUsage.length} deprecated API uses.`); // Log count
      criticalIssues.push(`Found ${analyzeResult.deprecatedUsage.length} uses of deprecated APIs`);
    }
    
    // Determine overall success based on BOTH command success AND critical issues
    const overallSuccess = analyzeResult.success && criticalIssues.length === 0;
    logger.debug(`Determined dead code check success: ${overallSuccess} (Analyze Result Success: ${analyzeResult.success}, Critical Issues: ${criticalIssues.length})`); // Log success decision
    
    // Construct detailed result
    const result = {
      success: overallSuccess, // Use the combined success flag
      criticalIssues,
      warnings,
      data: {
        // Ensure data exists even if analysis had errors
        unusedExports: analyzeResult.data?.unusedExports || analyzeResult.unusedExports || [], 
        emptyFiles: analyzeResult.data?.emptyFiles || analyzeResult.emptyFiles || [],
        duplicates: analyzeResult.data?.duplicates || analyzeResult.duplicates || [],
        deprecatedUsage: analyzeResult.data?.deprecatedUsage || analyzeResult.deprecatedUsage || []
      },
      // Include the underlying error message if the analysis itself failed
      error: analyzeResult.success ? null : (analyzeResult.error || 'Dead code analysis sub-step failed') 
    };
    
    // Log results
    if (criticalIssues.length > 0) {
      silentLogger.error("Dead code analysis found critical issues:");
      criticalIssues.forEach(issue => silentLogger.error(`- ${issue}`));
    }
    if (warnings.length > 0) {
      silentLogger.warn("Dead code analysis found warnings:");
      warnings.forEach(warning => silentLogger.warn(`- ${warning}`));
    }
    if (overallSuccess && warnings.length === 0) { 
      silentLogger.success("Dead code analysis completed successfully with no issues.");
    }
    
    return result;
    
  } catch (error) {
    silentLogger.error("Dead code check failed:", error);
    return { 
      success: false, 
      error: error.message,
      criticalIssues: [`Dead code analysis failed: ${error.message}`],
      warnings: []
    };
  }
}

/**
 * Run documentation quality check
 * @param {Object} options - Options for the check
 * @returns {Promise<{success: boolean, error?: string, data?: any}>} - Result
 */
export async function runDocsQualityCheck(options = {}) {
  const { verbose = false, silentMode = false, recordWarning } = options;
  
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
        { success: true, issues: [] },
        options
      );
      
      // Check for execution error first
      if (result.error && !result.success) {
         silentLogger.warn(`Documentation quality check failed to run: ${result.error}`);
         if (recordWarning) {
            recordWarning(`Docs Quality check failed: ${result.error}`, 'Validation', 'Documentation');
         }
         return { success: false, error: result.error };
      }

      // Determine success based *only* on the underlying check's result.success
      const checkPassed = result.success === true;
      
      // Log warnings if the underlying check found issues
      const issuesFound = result.issues && Array.isArray(result.issues) && result.issues.length > 0;
      
      // Record warnings ONLY if the underlying check actually found issues
      if (issuesFound) {
        silentLogger.warn(`Found ${result.issues.length} documentation quality issues.`);
        // Record each specific issue as a warning
        if (recordWarning && typeof recordWarning === 'function') {
          result.issues.forEach(fileIssue => {
            if (fileIssue.issues && Array.isArray(fileIssue.issues)) {
              fileIssue.issues.forEach(issueText => {
                // Construct message with file context
                const message = `Documentation issue: ${issueText}`; 
                const filePath = fileIssue.file || null;
                recordWarning(message, 'Validation', 'Documentation', 'warning', filePath);
              });
            }
          });
        }
        // NOTE: Do NOT return success: false here anymore just because issues were found.
      }
      
      // Log the final status based on the underlying check
      if (checkPassed) {
        silentLogger.success("Documentation quality check passed.");
      } else {
        silentLogger.warn(`Documentation quality check reported issues or failed.`);
      }
      
      // Return the actual success status from analyzeDocumentation,
      // include the data, and set the warning flag if issues were found.
      return { 
        success: checkPassed, 
        data: result,
        warning: issuesFound, // Mark as warning if issues found
        message: issuesFound ? `Found ${result.issues.length} documentation quality issues` : 'Documentation quality check passed' 
      };
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
    // Catch errors during the execution of runDocsQualityCheck itself
    silentLogger.warn(`Documentation quality check execution error: ${error.message}`);
    if (recordWarning) {
        recordWarning(`Docs Quality check execution failed: ${error.message}`, 'Validation', 'Documentation', 'error');
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
        // Improved error message that doesn't rely solely on issues count
        const errorMessage = result.error || 
                           (result.invalidWorkflows ? 
                             `Workflow validation failed with ${result.invalidWorkflows} invalid workflow file(s)` : 
                             'Workflow validation failed: Missing required security checks');
                             
        silentLogger.warn(errorMessage);
        
        // Construct a more meaningful data object with proper issues
        const enhancedData = {
          ...result,
          issues: result.issues || [
            "Your GitHub Actions workflow may be missing one or more required security checks:",
            "- Dependency vulnerability scan (npm/yarn/pnpm audit)",
            "- Code scanning via CodeQL or similar tool",
            "- Secret scanning for leaked credentials",
            "- Vulnerability scanning for CVEs"
          ]
        };
        
        return { 
          success: false, 
          data: enhancedData,
          warning: true,
          message: errorMessage 
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
      error: error.message,
      data: {
        issues: ["Workflow validation check failed to complete: " + error.message]
      }
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
      
      // Ensure we have a valid result object
      if (!result) {
        silentLogger.warn("Health checks returned null or undefined result");
        return { 
          success: false,
          error: "Health checks returned null or undefined result",
          warning: options.treatHealthAsWarning || false 
        };
      }
      
      // First check if it timed out
      if (result.timedOut) {
        silentLogger.warn("Health checks timed out");
        return {
          success: false,
          error: "Health checks timed out",
          warning: options.treatHealthAsWarning || false,
          data: {
            issues: ["Health checks timed out"]
          }
        };
      }
      
      // Now validate result structure
      if (!result.success) {
        // Collect issues to provide meaningful error messages
        let issuesMessage = '';
        if (result.issues && result.issues.length > 0) {
          issuesMessage = result.issues.join(', ');
          silentLogger.warn(`Health checks found issues: ${issuesMessage}`);
        } else {
          issuesMessage = 'Unknown issue';
          silentLogger.warn(`Health checks failed without specific issues`);
        }

        return { 
          success: false,
          error: `Health checks failed: ${issuesMessage}`,
          data: result,
          warning: options.treatHealthAsWarning || false,
          message: `Health checks found issues: ${issuesMessage}` 
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
    const errorMessage = error ? error.message || "Unknown error" : "Null error received";
    silentLogger.error(`Health check error: ${errorMessage}`);
    
    // Add more detailed debug logging
    if (error && error.stack) {
      silentLogger.debug(`Health check error stack: ${error.stack}`);
    }
    
    return { 
      success: false, 
      error: errorMessage,
      data: {
        issues: [`Health check error: ${errorMessage}`]
      } 
    };
  }
}

/**
 * Run all advanced checks
 * 
 * @param {Object} options - Options for checks
 * @param {boolean} [options.skipBundleCheck=false] - Skip bundle size check
 * @param {boolean} [options.skipDeadCodeCheck=false] - Skip dead code check
 * @param {boolean} [options.skipDocsCheck=false] - Skip documentation quality check
 * @param {boolean} [options.skipDocsFreshnessCheck=false] - Skip docs freshness check
 * @param {boolean} [options.skipWorkflowValidation=false] - Skip workflow validation
 * @param {boolean} [options.skipTypeCheck=false] - Skip advanced type checking
 * @param {boolean} [options.skipLintCheck=false] - Skip advanced lint checking
 * @param {boolean} [options.skipHealthCheck=false] - Skip health check
 * @param {boolean} [options.parallelChecks=true] - Run compatible checks in parallel
 * @returns {Promise<Object>} - Results of all checks
 */
export async function runAllAdvancedChecks(options = {}) {
  // Default options
  const defaultOptions = {
    skipBundleCheck: false,
    skipDeadCodeCheck: false,
    skipDocsFreshnessCheck: false,
    skipDocsCheck: false,
    skipTypeCheck: false,
    skipLintCheck: false,
    skipWorkflowValidation: false,
    skipHealthCheck: false,
    ignoreAdvancedFailures: false,
    parallelChecks: true,
    verbose: false,
    treatLintAsWarning: false,
    treatHealthAsWarning: false,
    silentMode: false,
    promptFn: null
  };
  
  // Start timing the advanced checks
  const startTime = Date.now();
  
  // Merge with provided options
  const mergedOptions = { ...defaultOptions, ...options };
  
  const results = {
    results: {},
    success: true
  };
  
  // Set silent mode for this operation
  silentLogger.setSilent(mergedOptions.silentMode);
  
  // Handle explicitly run checks (don't mark them as skipped)
  // Track already run checks so we don't mark them as skipped later
  const alreadyRunChecks = new Set();
  
  // Load and initialize workflow state for saving results
  const workflowState = getWorkflowState();
  
  try {
    // Initialize results.results with existing state from workflowState if available
    // This ensures checks run earlier are not overwritten by skip logic later
    results.results = { ...(workflowState.checkResults || {}) };

    // If typescript was already run, ensure skipped: false is set
    if (results.results.typescript) {
      results.results.typescript.skipped = false;
      alreadyRunChecks.add('typescript');
    }
    
    // If lint was already run, ensure skipped: false is set
    if (results.results.lint) {
      results.results.lint.skipped = false;
      alreadyRunChecks.add('lint');
    }
    
    // Define checks to run
    const checks = [];
    
    if (!mergedOptions.skipBundleCheck && !alreadyRunChecks.has('bundleSize')) {
      checks.push({
        name: 'Bundle Size Analysis',
        id: 'bundleSize',
        fn: runBundleSizeCheck,
        skip: mergedOptions.skipBundleCheck
      });
    }
    
    if (!mergedOptions.skipDeadCodeCheck && !alreadyRunChecks.has('deadCode')) {
      checks.push({
        name: 'Dead Code Detection',
        id: 'deadCode',
        fn: runDeadCodeCheck,
        skip: mergedOptions.skipDeadCodeCheck
      });
    }
    
    if (!mergedOptions.skipDocsCheck && !alreadyRunChecks.has('docsQuality')) {
      checks.push({
        name: 'Documentation Quality',
        id: 'docsQuality',
        fn: runDocsQualityCheck,
        skip: mergedOptions.skipDocsCheck
      });
    }
    
    if (!mergedOptions.skipDocsFreshnessCheck && !alreadyRunChecks.has('docsFreshness')) {
      checks.push({
        name: 'Documentation Freshness',
        id: 'docsFreshness',
        fn: runDocsFreshnessCheck,
        skip: mergedOptions.skipDocsFreshnessCheck
      });
    }
    
    if (!mergedOptions.skipTypeCheck && !alreadyRunChecks.has('typescript')) {
      checks.push({
        name: 'TypeScript Validation',
        id: 'typescript',
        fn: runAdvancedTypeScriptCheck,
        skip: mergedOptions.skipTypeCheck,
        treatWarningAsSuccess: false
      });
    }
    
    if (!mergedOptions.skipLintCheck && !alreadyRunChecks.has('lint')) {
      checks.push({
        name: 'ESLint Validation',
        id: 'lint',
        fn: runAdvancedLintCheck,
        skip: mergedOptions.skipLintCheck,
        treatWarningAsSuccess: mergedOptions.treatLintAsWarning
      });
    }
    
    if (!mergedOptions.skipWorkflowValidation && !alreadyRunChecks.has('workflowValidation')) {
      checks.push({
        name: 'Workflow Validation',
        id: 'workflowValidation',
        fn: runWorkflowValidationCheck,
        skip: mergedOptions.skipWorkflowValidation
      });
    }
    
    if (!mergedOptions.skipHealthCheck && !alreadyRunChecks.has('health')) {
      checks.push({
        name: 'Health Check',
        id: 'health',
        fn: runProjectHealthCheck,
        skip: mergedOptions.skipHealthCheck,
        treatWarningAsSuccess: mergedOptions.treatHealthAsWarning
      });
    }
    
    // Generate array of check execution promises
    const checkPromises = checks
      .filter(check => !check.skip && typeof check.fn === 'function')
      .map(check => {
        return async () => {
          try {
            silentLogger.info(`Running ${check.name}...`);
            
            // Run the check
            const result = await check.fn({
              ...mergedOptions, // Pass through all options
              silentMode: mergedOptions.silentMode, // Control logging
              verbose: mergedOptions.verbose
            });
            
            // Check if special handling is needed
            const warningButSuccess = 
              check.treatWarningAsSuccess && 
              result.warning && 
              !result.success;
            
            // Handle special case of warning as success
            const finalSuccess = warningButSuccess ? true : result.success;
            
            // Store result
            results.results[check.id] = {
              ...result,
              success: finalSuccess,
              warning: result.warning || false
            };
            
            // Update overall success flag
            if (!finalSuccess && !mergedOptions.ignoreAdvancedFailures) {
              results.success = false;
            }
            
            silentLogger.info(`${check.name} ${finalSuccess ? 'passed' : 'failed'}`);
            
            return results.results[check.id];
          } catch (error) {
            silentLogger.error(`Error in ${check.name}: ${error.message}`);
            
            // Store error result
            results.results[check.id] = {
              success: false,
              error: error.message
            };
            
            // Update overall success flag
            if (!mergedOptions.ignoreAdvancedFailures) {
              results.success = false;
            }
            
            return results.results[check.id];
          }
        };
      });
    
    // Execute checks (parallel or sequential)
    if (mergedOptions.parallelChecks && checkPromises.length > 0) {
      silentLogger.info(`Running ${checkPromises.length} checks in parallel...`);
      await Promise.all(checkPromises.map(fn => fn()));
    } else if (checkPromises.length > 0) {
      silentLogger.info(`Running ${checkPromises.length} checks sequentially...`);
      await runChecksSequentially(checkPromises, results);
    }
    
    // Mark skipped checks explicitly, ONLY if no result exists from previous steps.
    checks.forEach(check => {
      if (check.skip && !alreadyRunChecks.has(check.id) && !results.results[check.id]) {
        results.results[check.id] = { 
          success: true, 
          skipped: true,
          message: `${check.name} was skipped` 
        };
      }
    });
  } catch (error) {
    silentLogger.error(`Advanced checks error: ${error.message}`);
    results.error = error.message;
    results.success = false;
  }
  
  // Calculate total duration for all advanced checks
  const endTime = Date.now();
  const totalDuration = endTime - startTime;
  
  // Add duration to results object
  results.duration = totalDuration;
  
  if (options.verbose) {
    silentLogger.info(`Advanced checks completed in ${totalDuration}ms`);
  }
  
  return results;
}

/**
 * Helper function to run checks sequentially
 */
async function runChecksSequentially(checksToRun, results) {
  for (const { name, func, options } of checksToRun) {
    try {
      silentLogger.info(`Running ${name} check...`);
      const result = await func(options);
      results[name] = result || { success: false, error: `${name} check returned no result` };
    } catch (error) {
      silentLogger.error(`${name} check error: ${error.message}`);
      results[name] = { 
        success: false, 
        error: error.message, 
        warning: name === 'health' && options.treatHealthAsWarning 
      };
    }
  }
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

// And update the export default statement at the end:
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