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
  
  // Try to use cached result if files haven't changed
  try {
    await checkCache.load();
    
    // Define relevant source directories
    const srcDirs = [
      path.join(process.cwd(), 'packages/admin/src'),
      path.join(process.cwd(), 'packages/hours/src'),
      path.join(process.cwd(), 'packages/common/src')
    ];
    
    // Generate a cache key based on source files
    const cacheKey = await checkCache.getCacheKey('deadCode', srcDirs);
    
    // Check for cached result
    const cachedResult = checkCache.get(cacheKey);
    if (cachedResult) {
      silentLogger.info("Using cached dead code analysis result");
      return cachedResult;
    }
    
    // No cached result, run the analysis
    silentLogger.info("No cache available, running fresh dead code analysis...");
    
    // Original check implementation
    let analyzeResult;
    
    try {
      analyzeResult = await runWithTimeout(
        analyzeDeadCode({
          srcDirs,
          verbose: options.verbose,
          excludeTests: true,
          saveReport: true
        }),
        60000, // Increased timeout from 45s to 60s
        "Dead code analysis",
        { success: true, warning: true },
        options
      );
    } catch (deadCodeError) {
      silentLogger.error(`Dead code analysis execution error: ${deadCodeError.message}`);
      // Return detailed error information
      return { 
        success: false, 
        error: `Dead code analysis failed: ${deadCodeError.message}`,
        warning: true,
        message: "Dead code analysis encountered execution errors. See logs for details."
      };
    }
    
    // If we got an undefined or null result
    if (!analyzeResult) {
      silentLogger.error("Dead code analysis returned no result");
      return { 
        success: false, 
        error: "Dead code analysis returned no result",
        warning: true,
        message: "Dead code analyzer returned no result. Check system resources and try again."
      };
    }
    
    // If we have detailed results with issues
    if (analyzeResult.unusedExports && analyzeResult.unusedExports.length > 0) {
      const count = analyzeResult.unusedExports.length;
      silentLogger.warn(`Found ${count} unused exports that could be removed.`);
      
      // Add detailed error message
      analyzeResult.message = `Found ${count} unused exports that could be removed. Check the report for details.`;
    }
    
    // Improve the result structure to include proper success/failure indication
    const result = {
      ...analyzeResult,
      success: analyzeResult.success !== false, // Ensure we have a boolean success value
      warning: analyzeResult.unusedExports && analyzeResult.unusedExports.length > 0
    };
    
    // Cache the result
    checkCache.set(cacheKey, result);
    await checkCache.save();
    
    silentLogger.success("Dead code analysis completed successfully.");
    return result;
  } catch (error) {
    silentLogger.error("Dead code check failed:", error);
    return { 
      success: false, 
      error: error.message,
      warning: true,
      message: `Dead code check failed: ${error.message}. Try running with --verbose for more details.`
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
  const {
    skipBundleCheck = false,
    skipDeadCodeCheck = false,
    skipDocsCheck = false,
    skipDocsFreshnessCheck = false,
    skipWorkflowValidation = false,
    skipTypeCheck = false,
    skipLintCheck = false,
    skipHealthCheck = false,
    ignoreAdvancedFailures = false,
    parallelChecks = true,
    verbose = false,
    silentMode = false,
    treatLintAsWarning = false,
    treatHealthAsWarning = false,
    promptFn = null,
    timeout = {
      docsFreshness: 30000,
      docsQuality: 30000,
      bundleSize: 60000,
      deadCode: 45000,
      typeCheck: 45000,
      lint: 45000,
      workflowValidation: 30000,
      health: 60000
    },
    ...restOptions
  } = options;
  
  // Set silent mode
  silentLogger.setSilent(silentMode);
  
  // Validate that timeout is an object
  if (timeout && typeof timeout !== 'object') {
    silentLogger.warn("Invalid timeout parameter. Using defaults.");
  }
  
  // Initialize report object
  silentLogger.info("Running advanced checks...");
  const results = {};
  
  // Define which checks need to run sequentially
  // TypeScript and Lint checks should run first since other checks rely on valid code
  if (!skipTypeCheck) {
    try {
      results.typescript = await runAdvancedTypeScriptCheck({
        ...restOptions,
        silentMode,
        timeout: timeout?.typeCheck
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
  
  // Run lint check
  if (!skipLintCheck) {
    try {
      results.lint = await runAdvancedLintCheck({
        ...restOptions,
        silentMode,
        timeout: timeout?.lint
      });
      // Ensure the result is valid even if the function returns undefined
      if (!results.lint) {
        results.lint = { success: false, error: "Lint check returned no result" };
      }
      // Make lint check a warning if requested
      if (!results.lint.success && treatLintAsWarning) {
        results.lint.warning = true;
      }
    } catch (error) {
      silentLogger.error(`Lint check error: ${error.message}`);
      results.lint = { success: false, error: error.message };
      if (treatLintAsWarning) {
        results.lint.warning = true;
      }
    }
  } else {
    silentLogger.info("Skipping lint check as requested.");
    results.lint = { success: true, skipped: true };
  }
  
  // Run the rest of the checks in parallel if requested
  const parallelChecksToRun = [];
  
  // Bundle size check
  if (!skipBundleCheck) {
    parallelChecksToRun.push({
      name: 'bundleSize',
      func: runBundleSizeCheck,
      options: {
        ...restOptions,
        silentMode,
        timeout: timeout?.bundleSize
      }
    });
  }
  
  // Dead code check
  if (!skipDeadCodeCheck) {
    parallelChecksToRun.push({
      name: 'deadCode',
      func: runDeadCodeCheck,
      options: {
        ...restOptions,
        silentMode,
        timeout: timeout?.deadCode
      }
    });
  }
  
  // Docs quality check
  if (!skipDocsCheck) {
    parallelChecksToRun.push({
      name: 'docsQuality',
      func: runDocsQualityCheck,
      options: {
        ...restOptions,
        silentMode,
        timeout: timeout?.docsQuality
      }
    });
  }
  
  // Docs freshness check
  if (!skipDocsFreshnessCheck) {
    parallelChecksToRun.push({
      name: 'docsFreshness',
      func: runDocsFreshnessCheck,
      options: {
        ...restOptions,
        silentMode,
        timeout: timeout?.docsFreshness
      }
    });
  }
  
  // Workflow validation
  if (!skipWorkflowValidation) {
    parallelChecksToRun.push({
      name: 'workflowValidation',
      func: runWorkflowValidationCheck,
      options: {
        ...restOptions,
        silentMode,
        timeout: timeout?.workflowValidation
      }
    });
  }
  
  // Health check
  if (!skipHealthCheck) {
    parallelChecksToRun.push({
      name: 'health',
      func: runProjectHealthCheck,
      options: {
        ...restOptions,
        silentMode,
        timeout: timeout?.health
      }
    });
  }
  
  // Execute parallel checks efficiently
  if (parallelChecks && parallelChecksToRun.length > 0) {
    // Add progress indicators
    if (!silentMode) {
      silentLogger.info(`Running ${parallelChecksToRun.length} checks in parallel...`);
    }
    
    // Run checks in parallel with better progress tracking
    const parallelPromises = parallelChecksToRun.map(check => {
      return new Promise((resolve) => {
        const startTime = Date.now();
        if (!silentMode) {
          silentLogger.info(`Starting check: ${check.name}...`);
        }
        
        // Run the check and handle the result
        check.func(check.options)
          .then(result => {
            const duration = Date.now() - startTime;
            
            if (!silentMode) {
              const status = result.success ? 'succeeded' : (result.warning ? 'has warnings' : 'failed');
              silentLogger.info(`Check ${check.name} ${status} (${duration}ms)`);
            }
            
            resolve({ name: check.name, result });
          })
          .catch(error => {
            const duration = Date.now() - startTime;
            silentLogger.error(`Check ${check.name} failed with error: ${error.message} (${duration}ms)`);
            resolve({ 
              name: check.name, 
              result: { 
                success: false, 
                error: error.message,
                duration 
              } 
            });
          });
      });
    });
    
    // Wait for all parallel checks to complete with timeout protection
    const parallelTimeout = setTimeout(() => {
      silentLogger.warn("Some parallel checks are taking too long. Consider running with --skip options for problematic checks.");
    }, 30000); // 30-second warning for long-running checks
    
    const parallelResults = await Promise.all(parallelPromises);
    clearTimeout(parallelTimeout);
    
    // Process the results
    for (const { name, result } of parallelResults) {
      results[name] = result;
    }
  } else {
    await runChecksSequentially(parallelChecksToRun, results);
  }
  
  // Check for warnings
  const warnings = Object.entries(results)
    .filter(([, result]) => result && !result.success && result.warning === true)
    .map(([key, result]) => ({
      key,
      message: result.message || result.error || `Warning in ${key} check`
    }));
  
  return {
    success: !warnings.length,
    results,
    warnings
  };
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