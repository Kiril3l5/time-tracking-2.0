/**
 * Advanced Checker Module
 * 
 * Handles advanced checks including bundle size analysis, dead code detection,
 * vulnerability scanning, and documentation quality checks.
 * Integrates with existing advanced check modules.
 */

import * as logger from '../core/logger.js';
import * as bundleCheck from '../checks/bundle-check.js';
import * as deadCodeCheck from '../checks/deadcode-check.js';
import * as vulnerabilityCheck from '../checks/vulnerability-check.js';
import * as docsQualityCheck from '../checks/docs-quality-check.js';
import * as importSyntaxCheck from '../checks/import-syntax-check.js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Run a bundle size analysis check
 * @param {Object} options - Options for the check
 * @returns {Promise<{success: boolean, error?: string, data?: any}>} - Result
 */
export async function runBundleSizeCheck(options = {}) {
  logger.info("Running bundle size analysis...");
  
  try {
    // Try to use the module function
    if (typeof bundleCheck.analyzeBundleSize === 'function') {
      const result = await bundleCheck.analyzeBundleSize({
        verbose: options.verbose,
        compareToPrevious: true,
        saveReport: true
      });
      
      if (result.sizeIncrease && result.sizeIncrease > 10) {
        logger.warn(`Bundle size increased by ${result.sizeIncrease}% compared to the previous build.`);
        return { 
          success: false, 
          data: result,
          warning: true,
          message: `Bundle size increased by ${result.sizeIncrease}%` 
        };
      }
      
      logger.success("Bundle size check passed.");
      return { success: true, data: result };
    } else {
      // Fallback to command line
      logger.info("Using command line fallback for bundle size check");
      execSync('pnpm run analyze-bundle', { stdio: 'inherit' });
      return { success: true };
    }
  } catch (error) {
    logger.warn(`Bundle size check error: ${error.message}`);
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
  logger.info("Running dead code detection...");
  
  try {
    // Try to use the module function
    if (typeof deadCodeCheck.detectDeadCode === 'function') {
      const result = await deadCodeCheck.detectDeadCode({
        verbose: options.verbose,
        saveReport: true
      });
      
      const deadCodeCount = result.totalFiles || 0;
      if (deadCodeCount > 0) {
        logger.warn(`Found ${deadCodeCount} files with potentially unused code.`);
        return { 
          success: false, 
          data: result,
          warning: true,
          message: `Found ${deadCodeCount} files with potentially unused code` 
        };
      }
      
      logger.success("No dead code found.");
      return { success: true, data: result };
    } else {
      // Fallback to command line
      logger.info("Using command line fallback for dead code check");
      execSync('pnpm run detect-deadcode', { stdio: 'inherit' });
      return { success: true };
    }
  } catch (error) {
    logger.warn(`Dead code check error: ${error.message}`);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Run vulnerability scanning
 * @param {Object} options - Options for the check
 * @returns {Promise<{success: boolean, error?: string, data?: any}>} - Result
 */
export async function runVulnerabilityCheck(options = {}) {
  logger.info("Scanning for dependency vulnerabilities...");
  
  try {
    // Try to use the module function
    if (typeof vulnerabilityCheck.scanVulnerabilities === 'function') {
      const result = await vulnerabilityCheck.scanVulnerabilities({
        verbose: options.verbose,
        saveReport: true
      });
      
      const vulnerabilityCount = result.highSeverity || 0;
      if (vulnerabilityCount > 0) {
        logger.warn(`Found ${vulnerabilityCount} high severity vulnerabilities.`);
        return { 
          success: false, 
          data: result,
          warning: true,
          message: `Found ${vulnerabilityCount} high severity vulnerabilities` 
        };
      }
      
      logger.success("No high severity vulnerabilities found.");
      return { success: true, data: result };
    } else {
      // Fallback to command line
      logger.info("Using command line fallback for vulnerability check");
      execSync('pnpm audit', { stdio: 'inherit' });
      return { success: true };
    }
  } catch (error) {
    logger.warn(`Vulnerability check error: ${error.message}`);
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
  logger.info("Checking documentation quality...");
  
  try {
    // Try to use the module function
    if (typeof docsQualityCheck.checkDocumentation === 'function') {
      const result = await docsQualityCheck.checkDocumentation({
        verbose: options.verbose,
        saveReport: true
      });
      
      const issuesCount = result.totalIssues || 0;
      if (issuesCount > 0) {
        logger.warn(`Found ${issuesCount} documentation quality issues.`);
        return { 
          success: false, 
          data: result,
          warning: true,
          message: `Found ${issuesCount} documentation quality issues` 
        };
      }
      
      logger.success("Documentation quality check passed.");
      return { success: true, data: result };
    } else {
      // Fallback to command line
      logger.info("Using command line fallback for documentation quality check");
      execSync('pnpm run check-docs', { stdio: 'inherit' });
      return { success: true };
    }
  } catch (error) {
    logger.warn(`Documentation quality check error: ${error.message}`);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Run import syntax check
 * @param {Object} options - Options for the check
 * @returns {Promise<{success: boolean, error?: string, data?: any}>} - Result
 */
export async function runImportSyntaxCheck(options = {}) {
  logger.info("Checking for consistent ES module syntax...");
  
  try {
    // Try to use the module function
    if (typeof importSyntaxCheck.checkImportSyntax === 'function') {
      const result = await importSyntaxCheck.checkImportSyntax({
        verbose: options.verbose,
        saveReport: true
      });
      
      const inconsistentCount = result.inconsistentFiles || 0;
      if (inconsistentCount > 0) {
        logger.warn(`Found ${inconsistentCount} files with inconsistent import syntax.`);
        return { 
          success: false, 
          data: result,
          warning: true,
          message: `Found ${inconsistentCount} files with inconsistent import syntax` 
        };
      }
      
      logger.success("Import syntax check passed.");
      return { success: true, data: result };
    } else {
      // Fallback to command line
      logger.info("Using command line fallback for import syntax check");
      execSync('pnpm run check-imports', { stdio: 'inherit' });
      return { success: true };
    }
  } catch (error) {
    logger.warn(`Import syntax check error: ${error.message}`);
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
  const results = {
    bundleSize: null,
    deadCode: null,
    vulnerability: null,
    docsQuality: null,
    importSyntax: null,
  };
  
  // Skip if requested
  if (options.skipAdvancedChecks) {
    logger.info("Skipping advanced checks as requested.");
    return { 
      success: true, 
      skipped: true,
      results 
    };
  }
  
  logger.info("Running advanced code quality checks...");
  
  // Run bundle size check
  if (!options.skipBundleCheck) {
    results.bundleSize = await runBundleSizeCheck(options);
  } else {
    logger.info("Skipping bundle size check as requested.");
    results.bundleSize = { success: true, skipped: true };
  }
  
  // Run dead code check
  if (!options.skipDeadCodeCheck) {
    results.deadCode = await runDeadCodeCheck(options);
  } else {
    logger.info("Skipping dead code check as requested.");
    results.deadCode = { success: true, skipped: true };
  }
  
  // Run vulnerability check
  if (!options.skipVulnerabilityCheck) {
    results.vulnerability = await runVulnerabilityCheck(options);
  } else {
    logger.info("Skipping vulnerability check as requested.");
    results.vulnerability = { success: true, skipped: true };
  }
  
  // Run docs quality check
  if (!options.skipDocsCheck) {
    results.docsQuality = await runDocsQualityCheck(options);
  } else {
    logger.info("Skipping documentation quality check as requested.");
    results.docsQuality = { success: true, skipped: true };
  }
  
  // Run import syntax check
  if (!options.skipImportCheck) {
    results.importSyntax = await runImportSyntaxCheck(options);
  } else {
    logger.info("Skipping import syntax check as requested.");
    results.importSyntax = { success: true, skipped: true };
  }
  
  // Collect warnings
  const warnings = Object.values(results)
    .filter(result => result && result.warning)
    .map(result => result.message);
  
  if (warnings.length > 0 && options.promptFn) {
    logger.warn("The following warnings were found in advanced checks:");
    warnings.forEach((warning, index) => {
      logger.warn(`${index + 1}. ${warning}`);
    });
    
    const shouldContinue = await options.promptFn(
      "Continue despite these warnings? (Y/n)", 
      "Y"
    );
    
    if (shouldContinue.toLowerCase() === 'n') {
      logger.info("Exiting workflow due to advanced check warnings.");
      return { 
        success: false, 
        results,
        warnings
      };
    }
  }
  
  // Check for critical errors (non-warnings)
  const criticalErrors = Object.values(results)
    .filter(result => result && !result.success && !result.warning && !result.skipped)
    .length > 0;
  
  if (criticalErrors && options.promptFn) {
    logger.error("Critical errors found in advanced checks.");
    const shouldContinue = await options.promptFn(
      "Continue despite critical errors? (y/N)", 
      "N"
    );
    
    if (shouldContinue.toLowerCase() !== 'y') {
      logger.info("Exiting workflow due to critical advanced check errors.");
      return { 
        success: false, 
        results
      };
    }
  }
  
  logger.success("Advanced checks complete!");
  return {
    success: !criticalErrors || options.ignoreAdvancedFailures,
    warnings: warnings.length > 0 ? warnings : null,
    results
  };
}

export default {
  runBundleSizeCheck,
  runDeadCodeCheck,
  runVulnerabilityCheck,
  runDocsQualityCheck,
  runImportSyntaxCheck,
  runAllAdvancedChecks
}; 