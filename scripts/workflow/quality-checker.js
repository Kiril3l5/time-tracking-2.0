/**
 * Quality Checker Module
 * 
 * Handles code quality checks including ESLint, TypeScript, and tests.
 * Properly integrates with existing check modules.
 */

import { execSync } from 'child_process';
import * as logger from '../core/logger.js';
import * as lintCheck from '../checks/lint-check.js';
import * as typescriptCheck from '../checks/typescript-check.js';
import * as testRunner from '../checks/test-runner.js';
import * as typescriptFixer from '../typescript/typescript-fixer.js';
import * as queryTypesFixer from '../typescript/query-types-fixer.js';
import * as testDepsFixer from '../test-types/test-deps-fixer.js';

/**
 * Run ESLint checks with fallback to command line
 * @param {Object} options - Options for the check
 * @returns {Promise<{success: boolean, error?: string}>} - Result
 */
export async function runLintChecks(options = {}) {
  logger.info("Running ESLint to check code quality...");
  
  try {
    // Try to use the module function
    if (typeof lintCheck.runLintCheck === 'function') {
      const result = await lintCheck.runLintCheck({
        verbose: options.verbose
      });
      return { success: result.success };
    } else {
      // Fallback to command line
      logger.info("Using command line fallback for ESLint");
      execSync('pnpm run lint', { stdio: 'inherit' });
      return { success: true };
    }
  } catch (error) {
    logger.warn(`ESLint check error: ${error.message}`);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Run TypeScript type checking with fallback to command line
 * @param {Object} options - Options for the check
 * @returns {Promise<{success: boolean, error?: string}>} - Result
 */
export async function runTypeScriptChecks(options = {}) {
  logger.info("Running TypeScript type checking...");
  
  try {
    // Try to use the module function
    if (typeof typescriptCheck.runTypeCheck === 'function') {
      const result = await typescriptCheck.runTypeCheck({
        verbose: options.verbose
      });
      return { success: result.success };
    } else {
      // Fallback to command line
      logger.info("Using command line fallback for TypeScript check");
      execSync('pnpm run typecheck', { stdio: 'inherit' });
      return { success: true };
    }
  } catch (error) {
    logger.warn(`TypeScript check error: ${error.message}`);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Run unit tests
 * @param {Object} options - Options for running tests
 * @returns {Promise<{success: boolean, error?: string}>} - Result
 */
export async function runTests(options = {}) {
  logger.info("Running unit tests...");
  
  try {
    const result = await testRunner.runTests({
      verbose: options.verbose
    });
    return { success: result.success };
  } catch (error) {
    logger.warn(`Test error: ${error.message}`);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Fix TypeScript errors
 * @param {Object} options - Options for fixes
 * @returns {Promise<{success: boolean, error?: string}>} - Result
 */
export async function fixTypeScriptErrors(options = {}) {
  logger.info("Attempting to fix TypeScript errors...");
  
  try {
    await typescriptFixer.fixTypeScriptErrors({
      verbose: options.verbose
    });
    
    // Re-run type check to see if fixes worked
    const retryResult = await runTypeScriptChecks(options);
    
    if (retryResult.success) {
      logger.success("TypeScript issues fixed successfully!");
    } else {
      logger.warn("Some TypeScript issues couldn't be fixed automatically.");
    }
    
    return retryResult;
  } catch (error) {
    logger.warn(`TypeScript fix error: ${error.message}`);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Fix React Query types
 * @param {Object} options - Options for fixes
 * @returns {Promise<{success: boolean, fixed: number, error?: string}>} - Result
 */
export async function fixQueryTypes(options = {}) {
  logger.info("Checking React Query types...");
  
  try {
    const result = await queryTypesFixer.fixQueryTypes({
      verbose: options.verbose
    });
    
    const fixedCount = result.fixed || 0;
    if (fixedCount > 0) {
      logger.success(`Fixed React Query imports in ${fixedCount} files`);
    } else {
      logger.info("No React Query imports needed fixing");
    }
    
    return { 
      success: true, 
      fixed: fixedCount 
    };
  } catch (error) {
    logger.warn(`React Query types fix error: ${error.message}`);
    return { 
      success: false, 
      fixed: 0,
      error: error.message 
    };
  }
}

/**
 * Fix test dependencies
 * @param {Object} options - Options for fixes
 * @returns {Promise<{success: boolean, error?: string}>} - Result
 */
export async function fixTestDependencies(options = {}) {
  logger.info("Checking for test dependencies issues...");
  
  try {
    await testDepsFixer.fixTestDependencies({
      verbose: options.verbose
    });
    
    // Re-run tests to see if fixes worked
    const retryResult = await runTests(options);
    
    if (retryResult.success) {
      logger.success("Test dependencies fixed successfully!");
    } else {
      logger.warn("Some test issues couldn't be fixed automatically.");
    }
    
    return { 
      success: true
    };
  } catch (error) {
    logger.warn(`Test dependencies fix error: ${error.message}`);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Run all quality checks
 * @param {Object} options - Options for checks
 * @param {Function} options.promptFn - Function to prompt the user
 * @returns {Promise<{success: boolean, results: Object}>} - Overall result and individual results
 */
export async function runAllQualityChecks(options = {}) {
  const results = {
    lint: null,
    typescript: null,
    tests: null
  };
  
  // Run ESLint
  results.lint = await runLintChecks(options);
  
  if (!results.lint.success && options.promptFn) {
    logger.warn("ESLint found code quality issues. Please review them before continuing.");
    const shouldContinue = await options.promptFn("Would you like to continue despite the lint issues? (y/N)", "N");
    if (shouldContinue.toLowerCase() !== 'y') {
      logger.info("Exiting workflow. Please fix the linting issues and try again.");
      return { 
        success: false, 
        results
      };
    }
  }
  
  // Run TypeScript
  results.typescript = await runTypeScriptChecks(options);
  
  if (!results.typescript.success) {
    logger.error("TypeScript found type errors.");
    
    if (options.promptFn) {
      const shouldFix = await options.promptFn("Would you like to attempt auto-fixing TypeScript issues? (Y/n)", "Y");
      
      if (shouldFix.toLowerCase() !== 'n') {
        const fixResult = await fixTypeScriptErrors(options);
        results.typescriptFix = fixResult;
        
        if (!fixResult.success) {
          const continueAnyway = await options.promptFn("Continue despite TypeScript errors? (y/N)", "N");
          if (continueAnyway.toLowerCase() !== 'y') {
            logger.info("Exiting workflow. Please fix the TypeScript errors manually and try again.");
            return { 
              success: false, 
              results
            };
          }
        }
      } else {
        const continueAnyway = await options.promptFn("Continue despite TypeScript errors? (y/N)", "N");
        if (continueAnyway.toLowerCase() !== 'y') {
          logger.info("Exiting workflow. Please fix the TypeScript errors and try again.");
          return { 
            success: false, 
            results
          };
        }
      }
    }
  }
  
  // Run Tests
  results.tests = await runTests(options);
  
  if (!results.tests.success && options.promptFn) {
    logger.error("Unit tests failed.");
    
    const shouldFixDeps = await options.promptFn("Would you like to attempt fixing test dependencies? (Y/n)", "Y");
    
    if (shouldFixDeps.toLowerCase() !== 'n') {
      const fixResult = await fixTestDependencies(options);
      results.testsFix = fixResult;
      
      if (!results.tests.success) {
        const continueAnyway = await options.promptFn("Continue despite test failures? (y/N)", "N");
        if (continueAnyway.toLowerCase() !== 'y') {
          logger.info("Exiting workflow. Please fix the failing tests and try again.");
          return { 
            success: false, 
            results
          };
        }
      }
    } else {
      const continueAnyway = await options.promptFn("Continue despite test failures? (y/N)", "N");
      if (continueAnyway.toLowerCase() !== 'y') {
        logger.info("Exiting workflow. Please fix the failing tests and try again.");
        return { 
          success: false, 
          results
        };
      }
    }
  }
  
  // Determine overall success
  const overallSuccess = 
    (results.lint.success || options.ignoreLintFailure) && 
    (results.typescript.success || options.ignoreTypeScriptFailure) && 
    (results.tests.success || options.ignoreTestFailure);
  
  if (overallSuccess) {
    logger.success("All quality checks complete!");
  }
  
  return {
    success: overallSuccess,
    results
  };
}

/**
 * Run all auto-fixes
 * @param {Object} options - Options for fixes
 * @returns {Promise<{success: boolean, results: Object}>} - Overall result and individual results
 */
export async function runAllFixes(options = {}) {
  const results = {
    testDeps: null,
    queryTypes: null,
    typescript: null
  };
  
  // Fix test dependencies
  results.testDeps = await fixTestDependencies(options);
  
  // Fix React Query types
  results.queryTypes = await fixQueryTypes(options);
  
  // Fix TypeScript errors
  results.typescript = await fixTypeScriptErrors(options);
  
  // Determine overall success
  const overallSuccess = 
    results.testDeps.success && 
    results.queryTypes.success && 
    results.typescript.success;
  
  if (overallSuccess) {
    logger.success("All auto-fixes complete!");
  }
  
  return {
    success: overallSuccess,
    results
  };
}

export default {
  runLintChecks,
  runTypeScriptChecks,
  runTests,
  fixTypeScriptErrors,
  fixQueryTypes,
  fixTestDependencies,
  runAllQualityChecks,
  runAllFixes
}; 