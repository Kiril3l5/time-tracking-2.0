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
import { performance } from 'node:perf_hooks';

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
  
  // --- START REPLACEMENT for effectiveTimeout calculation ---
  let effectiveTimeout = timeoutMs; // Start with default
  let customTimeout = undefined; // Keep track if custom was attempted

  if (operationName === 'Documentation freshness check') {
    // Force 120s specifically for this check, overriding default and options
    effectiveTimeout = 120000; // Increased timeout to 120 seconds
    silentLogger.debug(`Timeout Override for [${operationName}]: Forcing ${effectiveTimeout}ms.`);
  } else {
    // Use logic for other checks (respecting options if present)
    // Corrected key generation: Convert operationName to camelCase matching the options object keys
    const checkNameKey = operationName.replace(/\s+(.)/g, (match, chr) => chr.toUpperCase()).replace(/^./, chr => chr.toLowerCase());
    customTimeout = options.timeout && typeof options.timeout === 'object' ? options.timeout[checkNameKey] : undefined;
    if (typeof customTimeout === 'number' && customTimeout > 0) {
         effectiveTimeout = customTimeout;
    }
  }

  silentLogger.debug(`Timeout Final for [${operationName}]: Effective Timeout Chosen: ${effectiveTimeout} (Default: ${timeoutMs}, Custom Attempted: ${customTimeout})`);
  // --- END REPLACEMENT ---
  
  if (options.verbose && !options.silentMode) {
    silentLogger.debug(`Running '${operationName}' with ${effectiveTimeout/1000}s timeout (Custom: ${customTimeout}, Default: ${timeoutMs})`);
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
 * @returns {Promise<{success: boolean, error?: string, data?: any, duration: number, name: string}>} - Result
 */
export async function runBundleSizeCheck(options = {}) {
  const checkName = 'bundleSize';
  const startTime = Date.now();
  const { verbose = false, silentMode = false } = options;
  
  // Update silent mode setting
  silentLogger.setSilent(silentMode);
  silentLogger.info("Running bundle size analysis...");
  let resultData = {};
  let success = false;
  let errorMsg = null;
  let warning = false;
  let message = null;
  
  try {
    // Find build directories to analyze
    const rootDir = process.cwd();
    const buildDirs = [
      path.join(rootDir, 'packages/admin/dist'),
      path.join(rootDir, 'packages/hours/dist')
    ].filter(dir => fs.existsSync(dir));
    
    if (buildDirs.length === 0) {
      errorMsg = "No build directories found. Run build step first.";
      silentLogger.warn(errorMsg);
      success = false;
      warning = true;
    } else if (typeof analyzeBundles === 'function') {
      const analyzeResult = await runWithTimeout(
        analyzeBundles({
          directories: buildDirs,
          verbose: options.verbose,
          compareToPrevious: true,
          saveReport: true,
          silent: true // Always silence inner module logging
        }),
        options.timeout?.bundlesize || 60000, // Use provided timeout or default
        "Bundle size analysis",
        { success: false, error: "Bundle size analysis timed out", issues: [] }, // Fallback on timeout
        options
      );
      
      if (!analyzeResult) {
         errorMsg = "Bundle size analysis returned no result";
         silentLogger.warn(errorMsg);
         success = false;
         warning = true;
      } else if (analyzeResult.timedOut) {
         errorMsg = analyzeResult.error;
         silentLogger.warn(errorMsg);
         success = false;
         warning = true;
      } else {
          resultData = analyzeResult; // Store the raw result data
          if (analyzeResult.issues && analyzeResult.issues.length > 0) {
            const errorCount = analyzeResult.issues.filter(issue => issue.severity === 'error').length;
            const warningCount = analyzeResult.issues.filter(issue => issue.severity === 'warning').length;
            
            message = `Bundle size check found ${errorCount} errors and ${warningCount} warnings`;
            silentLogger.warn(`Bundle size issues: ${errorCount} errors, ${warningCount} warnings`);
            
            success = errorCount === 0; // Fail only on errors
            warning = warningCount > 0;
            if (!success) errorMsg = errorMsg || `Bundle size check failed with ${errorCount} errors`;
          } else {
             success = true;
             silentLogger.success("Bundle size check passed.");
          }
      }
    } else {
      // Fallback to command line (Consider removing if module is reliable)
      silentLogger.info("Using command line fallback for bundle size check");
      execSync('pnpm run analyze-bundle', { 
        stdio: silentMode ? 'ignore' : 'inherit', 
        timeout: options.timeout?.bundlesize || 60000 
      });
      success = true; // Assume success if command doesn't throw
    }
  } catch (error) {
    errorMsg = error.message;
    silentLogger.error("Bundle size check failed:", error);
    success = false; 
  }
  
  // Calculate duration and return consistent structure
  const duration = Date.now() - startTime;
  return {
      name: checkName,
      success: success,
      duration: duration,
      error: errorMsg,
      warning: warning,
      message: message || errorMsg, // Provide a summary message
      data: resultData 
  };
}

/**
 * Run dead code detection
 * @param {Object} options - Options for the check
 * @returns {Promise<{success: boolean, error?: string, data?: any, duration: number, name: string}>} - Result
 */
export async function runDeadCodeCheck(options = {}) {
  const checkName = 'deadCode';
  const startTime = Date.now();
  const { verbose = false, silentMode = false } = options;
  
  silentLogger.setSilent(silentMode);
  silentLogger.info("Running dead code analysis...");
  
  let resultData = {};
  let success = false;
  let errorMsg = null;
  let criticalIssues = [];
  let warnings = [];

  try {
    const srcDirs = [
      path.join(process.cwd(), 'packages/admin/src'),
      path.join(process.cwd(), 'packages/hours/src'),
      path.join(process.cwd(), 'packages/common/src')
    ];
    
    silentLogger.info("Running fresh dead code analysis...");
    
    const analyzeResult = await runWithTimeout(
      analyzeDeadCode({
        srcDirs,
        verbose: options.verbose,
        excludeTests: true,
        saveReport: true,
        failOnUnusedExports: true,
        failOnEmptyFiles: true,
        failOnDuplicateCode: true,
        minDuplicationPercentage: 20,
        maxAllowedUnusedExports: 5
      }),
      options.timeout?.deadcode || 60000, // Use provided timeout or default
      "Dead code analysis",
      { success: false, error: "Dead code analysis timed out" }, // Fallback on timeout
      options
    );
    
    logger.debug('--- Raw analyzeDeadCode result START ---');
    logger.debug(JSON.stringify(analyzeResult, null, 2));
    logger.debug('--- Raw analyzeDeadCode result END ---');

    if (!analyzeResult) {
      errorMsg = "Dead code analysis returned no result";
      logger.error(errorMsg);
      success = false;
    } else if (analyzeResult.timedOut) {
       errorMsg = analyzeResult.error;
       logger.error(errorMsg);
       success = false;
    } else {
        resultData = { // Store relevant data
            unusedExports: analyzeResult.data?.unusedExports || analyzeResult.unusedExports || [],
            emptyFiles: analyzeResult.data?.emptyFiles || analyzeResult.emptyFiles || [],
            duplicates: analyzeResult.data?.duplicates || analyzeResult.duplicates || [],
            deprecatedUsage: analyzeResult.data?.deprecatedUsage || analyzeResult.deprecatedUsage || [],
            depcheckErrors: analyzeResult.depcheckErrors || []
        };

        // Categorize issues
        if (resultData.unusedExports.length > 0) {
            const count = resultData.unusedExports.length;
            const maxAllowed = options.maxAllowedUnusedExports || 5;
            if (count > maxAllowed) criticalIssues.push(`Found ${count} unused exports - exceeds maximum allowed (${maxAllowed})`);
            else warnings.push(`Found ${count} unused exports that could be removed`);
        }
        if (resultData.emptyFiles.length > 0) criticalIssues.push(`Found ${resultData.emptyFiles.length} empty files`);
        if (resultData.duplicates.length > 0) {
            const high = resultData.duplicates.filter(d => d.percentage >= 80).length;
            const med = resultData.duplicates.filter(d => d.percentage >= 50 && d.percentage < 80).length;
            if (high > 0) criticalIssues.push(`Found ${high} instances of high code duplication (>80%)`);
            if (med > 0) warnings.push(`Found ${med} instances of medium code duplication (50-80%)`);
        }
        if (resultData.deprecatedUsage.length > 0) criticalIssues.push(`Found ${resultData.deprecatedUsage.length} uses of deprecated APIs`);

        // Check depcheck status
        const depcheckCommandFailed = !!(resultData.depcheckErrors.length > 0 || analyzeResult.error);
        const depcheckErrorMsg = analyzeResult.error || (depcheckCommandFailed ? `Depcheck failed in ${resultData.depcheckErrors.length} package(s).` : null);
        if (depcheckCommandFailed) {
            logger.error(`Depcheck command failed: ${depcheckErrorMsg}`);
            criticalIssues.push(depcheckErrorMsg); // Add depcheck failure as critical
        }
        
        // Determine overall success
        const foundCriticalIssues = criticalIssues.length > 0;
        success = analyzeResult.success && !foundCriticalIssues && !depcheckCommandFailed;
        errorMsg = !success ? (depcheckErrorMsg || criticalIssues.join('; ') || analyzeResult.error || "Dead code check failed") : null;
        
        if (criticalIssues.length > 0) silentLogger.error("Dead code analysis found critical issues:", criticalIssues.join('; '));
        if (warnings.length > 0) silentLogger.warn("Dead code analysis found warnings:", warnings.join('; '));
        if (success && warnings.length === 0) silentLogger.success("Dead code analysis passed.");
    }
    
  } catch (error) {
    errorMsg = error.message;
    silentLogger.error("Dead code check failed:", error);
    success = false; 
  }
  
  const duration = Date.now() - startTime;
  return {
      name: checkName,
      success: success,
      duration: duration,
      error: errorMsg,
      warning: warnings.length > 0 && success, // Warning only if it passed but had warnings
      message: errorMsg || (warnings.length > 0 ? warnings.join('; ') : "Dead code check passed"),
      data: resultData 
  };
}

/**
 * Run documentation quality check
 * @param {Object} options - Options for the check
 * @returns {Promise<{success: boolean, error?: string, data?: any, duration: number, name: string}>} - Result
 */
export async function runDocsQualityCheck(options = {}) {
  const checkName = 'docsQuality';
  const startTime = Date.now();
  const { verbose = false, silentMode = false, recordWarning } = options;
  
  silentLogger.setSilent(silentMode);
  silentLogger.info("Checking documentation quality...");
  
  let resultData = {};
  let success = false;
  let errorMsg = null;
  let warning = false;
  let message = null;

  try {
    if (typeof analyzeDocumentation === 'function') {
      const analyzeResult = await runWithTimeout(
        analyzeDocumentation({
          verbose: options.verbose,
          saveReport: true,
          silent: true
        }),
        options.timeout?.docsquality || 30000, // Use provided timeout or default
        "Documentation quality check",
        { success: false, error: "Documentation quality check timed out", issues: [] },
        options
      );
      
      if (!analyzeResult) {
          errorMsg = "Documentation quality check returned no result";
          success = false;
      } else if (analyzeResult.timedOut || (analyzeResult.error && !analyzeResult.success)) {
          errorMsg = analyzeResult.error || "Documentation quality check failed to run";
          success = false;
          silentLogger.warn(errorMsg);
          if (recordWarning) recordWarning(`Docs Quality check failed: ${errorMsg}`, 'Validation', 'Documentation');
      } else {
          resultData = analyzeResult; // Store raw data
          success = analyzeResult.success === true; // Base success on the check's result
          const issuesFound = analyzeResult.issues && Array.isArray(analyzeResult.issues) && analyzeResult.issues.length > 0;
          
          if (issuesFound) {
            warning = true; // Mark as warning if issues found, regardless of success status
            message = `Found ${analyzeResult.issues.length} documentation quality issues`;
            silentLogger.warn(message);
            // Record specific issues if recorder is available
            if (recordWarning && typeof recordWarning === 'function') {
               analyzeResult.issues.forEach(fileIssue => {
                  if (fileIssue.issues && Array.isArray(fileIssue.issues)) {
                      fileIssue.issues.forEach(issueText => {
                          recordWarning(`Doc Issue: ${issueText}`, 'Validation', 'Documentation', 'warning', fileIssue.file || null);
                      });
                  }
               });
            }
          }
          
          if (success) {
            message = message || "Documentation quality check passed.";
            silentLogger.success(message);
          } else {
             errorMsg = errorMsg || "Documentation quality check reported issues or failed.";
             message = message || errorMsg;
             silentLogger.warn(message);
          }
      }
    } else {
      silentLogger.info("Using command line fallback for documentation quality check");
      execSync('pnpm run check-docs', { 
        stdio: silentMode ? 'ignore' : 'inherit', 
        timeout: options.timeout?.docsquality || 30000 
      });
      success = true; // Assume success
    }
  } catch (error) {
      errorMsg = error.message;
      success = false;
      silentLogger.warn(`Documentation quality check execution error: ${errorMsg}`);
      if (recordWarning) recordWarning(`Docs Quality check execution failed: ${errorMsg}`, 'Validation', 'Documentation', 'error');
  }
  
  const duration = Date.now() - startTime;
  return {
      name: checkName,
      success: success,
      duration: duration,
      error: errorMsg,
      warning: warning, // Reflects if issues were found
      message: message || errorMsg || "Documentation quality check completed",
      data: resultData
  };
}

/**
 * Run documentation freshness check
 * @param {Object} options - Options for the check
 * @returns {Promise<{success: boolean, error?: string, data?: any, duration: number, name: string}>} - Result
 */
export async function runDocsFreshnessCheck(options = {}) {
  const checkName = 'docsFreshness';
  const startTime = Date.now();
  const { verbose = false, silentMode = false } = options;
  
  silentLogger.setSilent(silentMode);
  silentLogger.info("Checking documentation freshness...");

  let resultData = {};
  let success = false;
  let errorMsg = null;
  let warning = false;
  let message = null;
  
  try {
    if (typeof checkDocumentation === 'function') {
      const analyzeResult = await runWithTimeout(
        checkDocumentation({
          verbose: options.verbose,
          saveReport: true,
          silent: true
        }),
        options.timeout?.docsfreshness || 120000, // Use provided timeout or default (increased)
        "Documentation freshness check",
        { success: false, error: "Documentation freshness check timed out", staleDocuments: [] },
        options
      );
      
      if (!analyzeResult) {
          errorMsg = "Documentation freshness check returned no result";
          success = false;
      } else if (analyzeResult.timedOut || (analyzeResult.error && !analyzeResult.success)) {
          errorMsg = analyzeResult.error || "Documentation freshness check failed to run";
          success = false;
          silentLogger.warn(errorMsg);
      } else {
          resultData = analyzeResult; // Store raw data
          const staleDocsCount = analyzeResult.staleDocuments?.length || 0;
          success = staleDocsCount === 0; // Success means no stale docs
          
          if (staleDocsCount > 0) {
            warning = true; // Treat stale docs as a warning
            message = `Found ${staleDocsCount} stale documentation files.`;
            errorMsg = message; // Report the finding as the primary message/error if failed
            silentLogger.warn(message);
          }
          
          if (success) {
            message = "Documentation freshness check passed.";
            silentLogger.success(message);
          }
      }
    } else {
      silentLogger.info("Using command line fallback for documentation freshness check");
      execSync('pnpm run docs:freshness', { 
        stdio: silentMode ? 'ignore' : 'inherit', 
        timeout: options.timeout?.docsfreshness || 120000 
      });
      success = true; // Assume success
    }
  } catch (error) {
      errorMsg = error.message;
      success = false;
      silentLogger.warn(`Documentation freshness check error: ${errorMsg}`);
  }

  const duration = Date.now() - startTime;
  return {
      name: checkName,
      success: success,
      duration: duration,
      error: errorMsg,
      warning: warning, // Reflects if stale docs were found
      message: message || errorMsg || "Documentation freshness check completed",
      data: resultData
  };
}

/**
 * Run TypeScript check
 * @param {Object} options - Options for the check
 * @returns {Promise<{success: boolean, error?: string, data?: any, duration: number, name: string}>} - Result
 */
export async function runAdvancedTypeScriptCheck(options = {}) {
  const checkName = 'typescript';
  const startTime = Date.now();
  const { verbose = false, silentMode = false } = options;
  
  silentLogger.setSilent(silentMode);
  silentLogger.info("Running advanced TypeScript check...");
  
  let resultData = {};
  let success = false;
  let errorMsg = null;
  let message = null;

  try {
    if (typeof runTypeCheck === 'function') {
      const analyzeResult = await runWithTimeout(
        runTypeCheck({
          verbose: options.verbose,
          saveReport: true,
          silent: true
        }),
        options.timeout?.typescript || 45000, // Use provided timeout or default
        "TypeScript check",
        { success: false, error: "TypeScript check timed out", errors: [] },
        options
      );
      
      if (!analyzeResult) {
          errorMsg = "TypeScript check returned no result";
          success = false;
      } else if (analyzeResult.timedOut || !analyzeResult.success) {
          const errorCount = analyzeResult.errors?.length || 0;
          errorMsg = analyzeResult.error || `TypeScript check failed with ${errorCount} errors.`;
          success = false;
          message = errorMsg;
          silentLogger.warn(message);
      } else {
          success = true;
          message = "TypeScript check passed.";
          silentLogger.success(message);
      }
       resultData = analyzeResult; // Store data regardless of success
    } else {
      silentLogger.info("Using command line fallback for TypeScript check");
      execSync('pnpm run workflow:typecheck', { 
        stdio: silentMode ? 'ignore' : 'inherit', 
        timeout: options.timeout?.typecheck || 45000 
      });
      success = true; // Assume success
    }
  } catch (error) {
      errorMsg = error.message;
      success = false;
      silentLogger.error(`TypeScript check error: ${errorMsg}`);
  }
  
  const duration = Date.now() - startTime;
  return {
      name: checkName,
      success: success,
      duration: duration,
      error: errorMsg,
      warning: false, // TS errors are generally not warnings
      message: message || errorMsg || "TypeScript check completed",
      data: resultData
  };
}

/**
 * Run ESLint check
 * @param {Object} options - Options for the check
 * @returns {Promise<{success: boolean, error?: string, data?: any, duration: number, name: string}>} - Result
 */
export async function runAdvancedLintCheck(options = {}) {
  const checkName = 'lint';
  const startTime = Date.now();
  const { verbose = false, silentMode = false, treatLintAsWarning = false } = options;
  
  silentLogger.setSilent(silentMode);
  silentLogger.info("Running advanced ESLint check...");
  
  let resultData = {};
  let success = false;
  let errorMsg = null;
  let warning = false; // Default to false, set based on treatLintAsWarning
  let message = null;

  try {
    if (typeof runLint === 'function') {
      const analyzeResult = await runWithTimeout(
        runLint({
          verbose: options.verbose,
          saveReport: true,
          silent: true
        }),
        options.timeout?.lint || 45000, // Use provided timeout or default
        "ESLint check",
        { success: false, error: "ESLint check timed out", errorCount: 1 }, // Assume failure on timeout
        options
      );
      
      if (!analyzeResult) {
          errorMsg = "ESLint check returned no result";
          success = false;
      } else if (analyzeResult.timedOut || !analyzeResult.success) {
          const errorCount = analyzeResult.errorCount || 0;
          errorMsg = analyzeResult.error || `ESLint check failed with ${errorCount} errors.`;
          success = false; // Underlying check failed
          warning = treatLintAsWarning; // If failed, it's a warning ONLY if specified
          message = errorMsg;
          if (warning) silentLogger.warn(message + " (Treated as warning)");
          else silentLogger.error(message); // Log as error if blocking
      } else {
          success = true; // Underlying check passed
          warning = false; // Passed = not a warning
          message = "ESLint check passed.";
          silentLogger.success(message);
      }
      resultData = analyzeResult; // Store data
    } else {
      silentLogger.info("Using command line fallback for ESLint check");
      execSync('pnpm run lint', { 
        stdio: silentMode ? 'ignore' : 'inherit', 
        timeout: options.timeout?.lint || 45000 
      });
      success = true; // Assume success
    }
  } catch (error) {
      errorMsg = error.message;
      success = false; // Catch block means failure
      warning = treatLintAsWarning; // If failed, it's a warning ONLY if specified
      if (warning) silentLogger.warn(`ESLint check error: ${errorMsg} (Treated as warning)`);
      else silentLogger.error(`ESLint check error: ${errorMsg}`);
  }

  const duration = Date.now() - startTime;
  return {
      name: checkName,
      success: success || warning, // Overall "success" for dashboard = true if it passed OR failed but is treated as warning
      duration: duration,
      error: !warning ? errorMsg : null, // Only report error if it's NOT treated as a warning
      warning: warning, // Explicitly state if it's a warning
      message: message || errorMsg || "ESLint check completed",
      data: resultData
  };
}

/**
 * Run workflow validation check
 * @param {Object} options - Options for the check
 * @returns {Promise<{success: boolean, error?: string, data?: any, duration: number, name: string}>} - Result
 */
export async function runWorkflowValidationCheck(options = {}) {
  const checkName = 'workflowValidation';
  const startTime = Date.now();
  const { verbose = false, silentMode = false } = options;
  
  silentLogger.setSilent(silentMode);
  silentLogger.info("Running workflow validation...");
  
  let resultData = {};
  let success = false;
  let errorMsg = null;
  let warning = false; // Treat workflow issues as warnings by default
  let message = null;

  try {
    if (typeof validateWorkflows === 'function') {
      const analyzeResult = await runWithTimeout(
        validateWorkflows({
          verbose: options.verbose,
          saveReport: true,
          silent: true
        }),
        options.timeout?.workflowvalidation || 30000, // Use provided timeout or default
        "Workflow validation",
        { success: false, error: "Workflow validation timed out" },
        options
      );
      
      if (!analyzeResult) {
          errorMsg = "Workflow validation returned no result";
          success = false;
      } else if (analyzeResult.timedOut || !analyzeResult.success) {
           errorMsg = analyzeResult.error || 
                      (analyzeResult.invalidWorkflows ? 
                         `Validation failed with ${analyzeResult.invalidWorkflows} invalid file(s)` : 
                         'Validation failed: Missing required security checks');
           success = false; // Underlying check failed
           warning = true; // Treat as warning
           message = errorMsg;
           silentLogger.warn(message + " (Treated as warning)");
           
           // Enhance data for reporting
           resultData = {
               ...analyzeResult,
               issues: analyzeResult.issues || [/* Default issues list */]
           };
      } else {
          success = true;
          warning = false;
          message = "Workflow validation passed.";
          silentLogger.success(message);
          resultData = analyzeResult;
      }
    } else {
      silentLogger.info("Using command line fallback for workflow validation");
      execSync('pnpm run workflow:validate', { 
        stdio: silentMode ? 'ignore' : 'inherit', 
        timeout: options.timeout?.workflowvalidation || 30000 
      });
      success = true; // Assume success
    }
  } catch (error) {
      errorMsg = error.message;
      success = false; // Catch block means failure
      warning = true; // Treat as warning
      silentLogger.warn(`Workflow validation error: ${errorMsg} (Treated as warning)`);
      resultData = { issues: [`Check failed to complete: ${errorMsg}`] };
  }
  
  const duration = Date.now() - startTime;
  return {
      name: checkName,
      success: success || warning, // Overall success if passed OR treated as warning
      duration: duration,
      error: !warning ? errorMsg : null, // Only report error if blocking
      warning: warning,
      message: message || errorMsg || "Workflow validation completed",
      data: resultData
  };
}

/**
 * Run health checks
 * @param {Object} options - Options for the check
 * @returns {Promise<{success: boolean, error?: string, data?: any, duration: number, name: string}>} - Result
 */
export async function runProjectHealthCheck(options = {}) {
  const checkName = 'health';
  const startTime = Date.now();
  const { verbose = false, silentMode = false, treatHealthAsWarning = false } = options;
  
  silentLogger.setSilent(silentMode);
  silentLogger.info("Running project health checks...");
  
  let resultData = {};
  let success = false;
  let errorMsg = null;
  let warning = false;
  let message = null;

  try {
    if (typeof runHealthChecks === 'function') {
      const analyzeResult = await runWithTimeout(
        runHealthChecks({ // Pass all options down
          verbose: options.verbose,
          silent: true,
          ...options 
        }),
        options.timeout?.health || 60000, // Use provided timeout or default
        "Health checks",
        { success: false, error: "Health checks timed out", issues: [] },
        options
      );
      
      if (!analyzeResult) {
          errorMsg = "Health checks returned null or undefined result";
          success = false;
      } else if (analyzeResult.timedOut || !analyzeResult.success) {
          let issuesMessage = '';
          if (analyzeResult.issues && analyzeResult.issues.length > 0) {
              issuesMessage = analyzeResult.issues.join(', ');
          } else {
              issuesMessage = 'Unknown issue';
          }
          errorMsg = analyzeResult.error || `Health checks failed: ${issuesMessage}`;
          success = false; // Underlying check failed
          warning = treatHealthAsWarning; // Check if treated as warning
          message = errorMsg;
          if (warning) silentLogger.warn(message + " (Treated as warning)");
          else silentLogger.error(message); // Log as error if blocking
          
          resultData = analyzeResult; // Keep data even on failure
      } else {
          success = true;
          warning = false; // Passed = not warning
          message = "Health checks passed.";
          silentLogger.success(message);
          resultData = analyzeResult;
      }
    } else {
      errorMsg = "Health checker module not available";
      silentLogger.error(errorMsg);
      success = false; 
    }
  } catch (error) {
      const errorMessage = error ? error.message || "Unknown error" : "Null error received";
      errorMsg = `Health check error: ${errorMessage}`;
      success = false; // Catch block means failure
      warning = treatHealthAsWarning; // Check if treated as warning
      if (warning) silentLogger.warn(errorMsg + " (Treated as warning)");
      else silentLogger.error(errorMsg);

      if (error && error.stack) silentLogger.debug(`Health check error stack: ${error.stack}`);
      resultData = { issues: [`Health check error: ${errorMessage}`] };
  }
  
  const duration = Date.now() - startTime;
  return {
      name: checkName,
      success: success || warning, // Overall success if passed OR treated as warning
      duration: duration,
      error: !warning ? errorMsg : null, // Only report error if blocking
      warning: warning,
      message: message || errorMsg || "Health check completed",
      data: resultData
  };
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
 * @returns {Promise<Object>} - Results of all checks, where each result has the consistent structure
 */
export async function runAllAdvancedChecks(options = {}) {
  // Initialize logger, results, etc.
  silentLogger.setSilent(options.silentMode || false);
  const results = {}; // Store results keyed by check name
  let overallSuccess = true; // Tracks if any *blocking* check failed
  const startTime = performance.now();

  silentLogger.info('Starting advanced checks...');

  // --- Run Checks ---
  // Define all possible checks and their functions
  const allChecks = {
    typescriptBuild: runTypeScriptBuildCheck, // Add new TypeScript build check with highest priority
    bundleSize: runBundleSizeCheck,
    deadCode: runDeadCodeCheck,
    docsQuality: runDocsQualityCheck,
    docsFreshness: runDocsFreshnessCheck,
    typescript: runAdvancedTypeScriptCheck, // Keep these mappings
    lint: runAdvancedLintCheck,
    workflowValidation: runWorkflowValidationCheck,
    health: runProjectHealthCheck
  };

  // Filter checks based on options
  const checksToRun = Object.entries(allChecks)
    .filter(([name]) => !options[`skip${name.charAt(0).toUpperCase() + name.slice(1)}Check`])
    .map(([name, fn]) => ({ name, fn }));

  // Run checks (parallel or sequential)
  if (checksToRun.length > 0) {
    if (options.parallelChecks) {
      silentLogger.info(`Running ${checksToRun.length} checks in parallel...`);
      // Map each check to its async function call, passing options
      const promises = checksToRun.map(check => 
          check.fn(options).catch(error => ({ // Call the actual check function
              // Construct a failure object in the consistent format on catch
              name: check.name, 
              success: false, 
              error: error.message || 'Unknown execution error',
              duration: 0, // Duration unknown if it crashed immediately
              data: null 
          }))
      );
      // Use Promise.allSettled to wait for all checks
      const settledResults = await Promise.allSettled(promises);
      
      // Process settled results
      settledResults.forEach((settledResult, index) => {
          const checkName = checksToRun[index].name;
          if (settledResult.status === 'fulfilled') {
              // Check fulfilled, store the structured result
              const checkResult = settledResult.value;
              results[checkName] = checkResult; // Store the whole { name, success, duration, ... } object
              // Update overallSuccess: fail if check failed AND is not treated as warning
              if (checkResult && checkResult.success === false && !checkResult.warning && !options.ignoreAdvancedFailures) {
                  overallSuccess = false;
              }
          } else {
              // Check rejected (error during execution not caught by inner try/catch)
              const reason = settledResult.reason;
              results[checkName] = { 
                  name: checkName,
                  success: false, 
                  error: reason?.message || 'Unknown check execution error',
                  duration: 0, // Can't know duration
                  data: null
              };
              overallSuccess = false; // Execution error is always a failure
              silentLogger.error(`Critical error running check ${checkName}: ${results[checkName].error}`);
          }
      });
    } else {
      // Run sequentially (Less common path, but ensure consistency)
      silentLogger.info(`Running ${checksToRun.length} checks sequentially...`);
      await runChecksSequentially(checksToRun, results, options); // Pass results object to be populated
      // Determine overall success based on populated results
      overallSuccess = Object.values(results).every(r => r.success !== false || r.warning || options.ignoreAdvancedFailures);
    }
  }

  // --- Final Reporting --- 
  const duration = performance.now() - startTime;
  silentLogger.info(`Advanced checks completed in ${(duration / 1000).toFixed(1)}s`);

  // Report summary using the structured results
  Object.entries(results).forEach(([name, result]) => {
      // Use result.success and result.warning which are now consistently populated
      if (result && result.success === false && !result.warning && !options.ignoreAdvancedFailures) {
          silentLogger.error(`- ${name}: Failed (${result.error || 'Check failed'})`);
      } else if (result && result.warning) {
          // It might be success: true, warning: true (e.g. lint passed but treated as warning)
          // Or success: false, warning: true (e.g. health failed but treated as warning)
          const statusText = result.success ? 'Passed with warnings' : 'Failed (treated as warning)';
          silentLogger.warn(`- ${name}: ${statusText}`);
      } else if (result && result.success) {
         // Only log success in verbose mode 
         if (options.verbose) {
            silentLogger.success(`- ${name}: Passed`);
         }
      } else if (!result) {
          // Handle cases where a check might not have produced a result object (should be rare now)
          silentLogger.warn(`- ${name}: No result data available.`);
      }
  });

  // Return the overall status and the detailed results map
  return {
    success: overallSuccess,
    duration,
    results // Return the map of { checkName: { name, success, duration, ... } }
  };
}

/**
 * Helper function to run checks sequentially
 * Ensures the results object is populated correctly.
 */
async function runChecksSequentially(checksToRun, results, options) {
  for (const { name, fn } of checksToRun) { // Removed checkOptions from loop destructuring
    try {
      silentLogger.info(`Running ${name} check...`);
      // Call the check function, it should return the consistent structure
      const result = await fn(options); // Pass main options object
      results[name] = result || { // Store the returned structured object
          name: name,
          success: false, 
          error: `${name} check returned no result`,
          duration: 0,
          data: null 
      };
    } catch (error) {
      silentLogger.error(`${name} check error: ${error.message}`);
      // Construct consistent failure object on catch
      results[name] = { 
        name: name,
        success: false, 
        error: error.message, 
        duration: 0, // Duration unknown
        // Determine warning status based on options for this check
        warning: (name === 'health' && options.treatHealthAsWarning) || (name === 'lint' && options.treatLintAsWarning), 
        data: null
      };
    }
  }
}

/**
 * Run a single advanced check with direct workflow integration
 * (This function should remain largely the same as it already calls the updated checks)
 * 
 * @param {string} checkName - Name of the check to run
 * @param {Object} options - Check options
 * @param {string} [options.phase='Validation'] - Current workflow phase
 * @returns {Promise<Object>} Check result in the consistent format { name, success, duration, error, data }
 */
export async function runSingleCheckWithWorkflowIntegration(checkName, options = {}) {
  const { 
    phase = 'Validation',
    // We pass all other options down to the specific check function now
    ...checkOptions 
  } = options;
  
  const workflowState = getWorkflowState();
  const stepName = `${checkName} Check`;
  const startTime = Date.now(); // Start time for this specific integrated run
  
  workflowState.setCurrentStep(stepName);
  const isSilent = checkOptions.silentMode !== false;
  silentLogger.setSilent(isSilent);
  
  // --- Simplified Logic: Call the appropriate (now consistent) check function ---
  try {
      let checkFunction;
      switch(checkName.toLowerCase()) {
          case 'bundle': case 'bundlesize': checkFunction = runBundleSizeCheck; break;
          case 'deadcode': checkFunction = runDeadCodeCheck; break;
          case 'docs': case 'documentation': checkFunction = runDocsQualityCheck; break;
          case 'docfreshness': checkFunction = runDocsFreshnessCheck; break;
          case 'typescript': checkFunction = runAdvancedTypeScriptCheck; break;
          case 'lint': checkFunction = runAdvancedLintCheck; break;
          case 'workflow': case 'workflowvalidation': checkFunction = runWorkflowValidationCheck; break;
          case 'health': checkFunction = runProjectHealthCheck; break;
          default: {
              const error = `Unknown advanced check: ${checkName}`;
              workflowState.addWarning(error, stepName, phase);
              workflowState.completeStep(stepName, { success: false, error });
              // Return consistent error format
              return { name: checkName, success: false, error, duration: Date.now() - startTime, data: null }; 
          }
      }
      
      // Directly call the selected check function. It will handle its own timeout via runWithTimeout internally
      // and return the standardized { name, success, duration, error, data } object.
      const checkResult = await checkFunction(checkOptions); 
      
      // Duration for workflowState.completeStep should reflect this integration step's time
      const integrationDuration = Date.now() - startTime;

      // Record warnings from the check result (if any) to the workflow state
      // The check function itself might have already logged them via silentLogger
      if (checkResult.warning && checkResult.message) {
           workflowState.addWarning(`${checkName}: ${checkResult.message}`, stepName, phase, checkResult.success ? 'warning' : 'error');
      } else if (!checkResult.success && checkResult.error) {
           workflowState.addWarning(`${checkName} Failed: ${checkResult.error}`, stepName, phase, 'error');
      }
      // Example: Extract specific issues if needed (modify based on actual data structure)
      if (checkResult.data?.issues?.length > 0 && checkName.toLowerCase() === 'docs') {
          checkResult.data.issues.forEach(issue => workflowState.addWarning(`Doc Issue: ${issue.message} (${issue.file})`, stepName, phase));
      }
      
      // Complete the workflow step tracking using the success status from the check result
      workflowState.completeStep(stepName, { 
          success: checkResult.success, 
          error: checkResult.error, // Pass error if present
          duration: integrationDuration // Use the duration of this specific integration call
      });
      
      // Return the structured result obtained from the check function
      // Ensure the name field is correctly set from the input checkName
      return { ...checkResult, name: checkName, duration: checkResult.duration ?? integrationDuration }; // Return the result, ensure name and duration are set

  } catch (error) {
      // Catch errors from invoking the check function itself (less likely now)
      const duration = Date.now() - startTime; 
      const errorMsg = `${checkName} integration error: ${error.message}`;
      
      workflowState.addWarning(errorMsg, stepName, phase);
      workflowState.trackError(error, stepName);
      workflowState.completeStep(stepName, { success: false, error: errorMsg, duration });
      
      // Return consistent error format
      return { name: checkName, success: false, error: errorMsg, duration, data: null }; 
  }
}

/**
 * Run TypeScript build check for the common package
 * 
 * @param {Object} options - Options for the check
 * @returns {Promise<Object>} Check result
 */
export async function runTypeScriptBuildCheck(options = {}) {
  silentLogger.setSilent(options.silentMode || false);
  
  const startTime = performance.now();
  
  try {
    const { runPackageBuildCheck } = await import('../checks/typescript-check.js');
    
    // Record step if available
    if (options.recordStep) {
      options.recordStep('TypeScript Build Check', options.phase || 'Validation');
    }
    
    // Get list of packages to check
    const packagesToCheck = ['common', 'admin', 'hours'];
    silentLogger.info(`Running TypeScript build check for packages: ${packagesToCheck.join(', ')}...`);
    
    // Run checks for each package and collect results
    const packageResults = {};
    let overallSuccess = true;
    let combinedErrors = [];
    let totalErrorCount = 0;
    
    for (const packageName of packagesToCheck) {
      silentLogger.info(`Checking package: ${packageName}...`);
      
      // Run the package build check
      const checkResult = runPackageBuildCheck({
        package: packageName,
        dryRun: true,
        debug: options.verbose || false
      });
      
      // Store results
      packageResults[packageName] = checkResult;
      
      // Update overall success status
      if (!checkResult.success) {
        overallSuccess = false;
        
        // Collect errors with package name prefix
        if (checkResult.errors && Array.isArray(checkResult.errors)) {
          const errorsWithPackage = checkResult.errors.map(error => ({
            ...error,
            package: packageName,
            file: error.file ? `${packageName}/${error.file}` : error.file
          }));
          
          combinedErrors = [...combinedErrors, ...errorsWithPackage];
          totalErrorCount += checkResult.errorCount || errorsWithPackage.length;
        }
      }
    }
    
    // Calculate duration
    const duration = Math.round(performance.now() - startTime);
    
    // Process errors across all packages
    if (!overallSuccess && combinedErrors.length > 0) {
      // Create a clear message for the workflow dashboard
      const errorSummary = `TypeScript build check failed with ${totalErrorCount} errors across multiple packages`;
      silentLogger.error(errorSummary);
      
      // Group errors by type for better reporting
      const errorsByType = combinedErrors.reduce((acc, error) => {
        const code = error.code || 'unknown';
        if (!acc[code]) {
          acc[code] = [];
        }
        acc[code].push(error);
        return acc;
      }, {});
      
      // Format errors for display in the workflow dashboard
      silentLogger.error('===== TypeScript Build Errors =====');
      
      // Add each error as a warning in the workflow
      combinedErrors.forEach((error, index) => {
        if (index < 15) { // Limit displayed errors to avoid overwhelming the console
          // Format the error message for display
          const formattedMessage = error.file && error.line 
            ? `${error.file}:${error.line}:${error.column} - ${error.message}`
            : error.message || 'Unknown error';
            
          silentLogger.error(formattedMessage);
          
          // Record each error in the workflow state if the recordWarning function is available
          if (options.recordWarning) {
            options.recordWarning(
              formattedMessage,
              options.phase || 'Validation',
              'TypeScript Build Check',
              'error',
              error.package
            );
          }
        }
      });
      
      if (combinedErrors.length > 15) {
        const remainingErrors = combinedErrors.length - 15;
        const message = `... and ${remainingErrors} more errors`;
        silentLogger.error(message);
        
        if (options.recordWarning) {
          options.recordWarning(
            message,
            options.phase || 'Validation',
            'TypeScript Build Check',
            'error'
          );
        }
      }
      
      // Add special handling for common error types
      // Handle TS6133 (unused variables/imports)
      if (errorsByType['TS6133'] && errorsByType['TS6133'].length > 0) {
        const unusedCount = errorsByType['TS6133'].length;
        const message = `Found ${unusedCount} unused variables/imports. Consider removing them or prefixing with underscore.`;
        silentLogger.warn(message);
        
        if (options.recordWarning) {
          options.recordWarning(
            message,
            options.phase || 'Validation',
            'TypeScript Build Check',
            'info'
          );
        }
      }
      
      // Handle TS2769 (Vite configuration errors)
      if (errorsByType['TS2769'] && errorsByType['TS2769'].length > 0) {
        const viteErrors = errorsByType['TS2769'].filter(e => e.file && e.file.includes('vite.config.ts'));
        if (viteErrors.length > 0) {
          const message = `Found ${viteErrors.length} Vite configuration type errors. These may be caused by mismatched vite versions across packages.`;
          silentLogger.warn(message);
          
          const suggestion = "Consider updating package.json dependencies to align Vite versions or updating vite.config.ts to use proper typings.";
          silentLogger.info(suggestion);
          
          if (options.recordWarning) {
            options.recordWarning(
              message,
              options.phase || 'Validation',
              'TypeScript Build Check',
              'warning'
            );
            
            options.recordWarning(
              suggestion,
              options.phase || 'Validation',
              'TypeScript Build Check',
              'info'
            );
          }
        }
      }
      
      silentLogger.error('===================================');
      
      // Provide actionable error message
      let actionableError;
      
      // Create more specific actionable messages based on error types
      if (errorsByType['TS6133'] && Object.keys(errorsByType).length === 1) {
        actionableError = `Found ${totalErrorCount} unused variables/imports. Fix by removing or prefixing with underscore.`;
      } else if (errorsByType['TS2769'] && errorsByType['TS2769'].every(e => e.file && e.file.includes('vite.config.ts'))) {
        actionableError = `Found ${totalErrorCount} Vite configuration type errors. Check Vite version compatibility.`;
      } else {
        actionableError = `Found ${totalErrorCount} TypeScript errors across multiple packages. See workflow warnings for details.`;
      }
      
      // Record step completion with actionable error message
      if (options.recordStep) {
        options.recordStep('TypeScript Build Check', options.phase || 'Validation', false, duration, actionableError);
      }
      
      return {
        success: false,
        error: actionableError,
        duration,
        errorCount: totalErrorCount,
        packageResults,
        errors: combinedErrors,
        errorsByType
      };
    }
    
    // Record step completion
    if (options.recordStep) {
      options.recordStep('TypeScript Build Check', options.phase || 'Validation', overallSuccess, duration);
    }
    
    return {
      success: overallSuccess,
      duration,
      packageResults
    };
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    
    silentLogger.error(`TypeScript build check failed with error: ${error.message}`);
    
    // Record step failure
    if (options.recordStep) {
      options.recordStep('TypeScript Build Check', options.phase || 'Validation', false, duration, error.message);
    }
    
    return {
      success: false,
      error: error.message,
      duration
    };
  }
}

// Export default remains the same
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
  runSingleCheckWithWorkflowIntegration,
  runTypeScriptBuildCheck
};