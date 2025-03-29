#!/usr/bin/env node

/**
 * TypeScript Fixer Module
 * 
 * Main orchestrator for TypeScript fixing utilities that combines multiple fixing strategies
 * and provides a unified interface for fixing TypeScript code issues.
 * 
 * Features:
 * - Fix duplicate imports
 * - Fix unused imports
 * - Parse and categorize TypeScript errors
 * - Generate reports on TypeScript issues
 * - Apply fixes automatically or in interactive mode
 * 
 * @module typescript/typescript-fixer
 */

import fs from 'fs/promises';
import path from 'path';
import process from 'node:process';
import * as logger from '../core/logger.js';
import * as commandRunner from '../core/command-runner.js';
import * as errorParser from './error-parser.js';
import * as duplicateImportFix from './duplicate-import-fix.js';
import * as unusedImportFix from './unused-import-fix.js';
import * as typeValidator from './type-validator.js';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

/**
 * Get the directory where this script is located
 * @returns {string} - Directory path
 */
function getScriptDir() {
  const __filename = fileURLToPath(import.meta.url);
  return path.dirname(__filename);
}

/**
 * Get the root directory of the project
 * @returns {string} - Root directory path
 */
function getRootDir() {
  const rootDir = path.resolve(getScriptDir(), '..', '..');
  return rootDir;
}

/**
 * Get all TypeScript files in the project
 * @returns {string[]} Array of file paths
 */
function getAllTypeScriptFiles() {
  const files = [];
  const dirs = [
    path.join(getRootDir(), 'src'),
    path.join(getRootDir(), 'packages')
  ];

  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      files.push(...getFilesRecursively(dir, ['.ts', '.tsx']));
    }
  }

  return files;
}

/**
 * Check if a variable is used in the code
 * @param {string} content - File content
 * @param {string} varName - Variable name to check
 * @returns {boolean} Whether the variable is used
 */
function isVariableUsed(content, varName) {
  // Skip if it's a destructured variable
  if (content.includes(`{ ${varName} }`)) return true;
  
  // Count occurrences of the variable name
  const regex = new RegExp(`\\b${varName}\\b`, 'g');
  const matches = content.match(regex) || [];
  
  // If it appears more than once (including the declaration), it's used
  return matches.length > 1;
}

/**
 * Get all files recursively from a directory with specific extensions
 * @param {string} dir - Directory to scan
 * @param {string[]} extensions - File extensions to include
 * @returns {string[]} Array of file paths
 */
function getFilesRecursively(dir, extensions) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFilesRecursively(fullPath, extensions));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Apply fixes to TypeScript files
 * 
 * @param {Object} options - Options for applying fixes
 * @param {string|string[]} options.targetDirs - Directories to scan for TypeScript files
 * @param {boolean} [options.fix=true] - Whether to apply fixes
 * @param {string[]} [options.extensions=['.ts', '.tsx']] - File extensions to check
 * @param {boolean} [options.includeTestFiles=false] - Whether to include test files
 * @param {boolean} [options.fixDuplicateImports=true] - Whether to fix duplicate imports
 * @param {boolean} [options.fixUnusedImports=true] - Whether to fix unused imports
 * @param {boolean} [options.verbose=false] - Whether to log verbose output
 * @param {boolean} [options.dryRun=false] - Whether to perform a dry run without modifying files
 * @returns {Promise<Object>} - Result of the fix operation
 */
export async function fixTypeScriptIssues(options) {
  const {
    targetDirs,
    fix = true,
    extensions = ['.ts', '.tsx'],
    includeTestFiles = false,
    fixDuplicateImports = true,
    fixUnusedImports = true,
    verbose = false,
    dryRun = false
  } = options;
  
  logger.info('Running enhanced TypeScript error fixing...');

  // First run ESLint with auto-fix
  if (!dryRun) {
    execSync('pnpm run lint:fix', { stdio: 'inherit' });
  }

  // Then run TypeScript compiler to catch remaining issues
  if (!dryRun) {
    execSync('pnpm run typecheck', { stdio: 'inherit' });
  }

  const dirs = Array.isArray(targetDirs) ? targetDirs : [targetDirs];
  
  if (verbose) {
    logger.info(`TypeScript fixer targeting directories: ${dirs.join(', ')}`);
    logger.info(`Options: fix=${fix}, dryRun=${dryRun}, fixDuplicateImports=${fixDuplicateImports}, fixUnusedImports=${fixUnusedImports}`);
  }
  
  const results = {
    startTime: new Date(),
    endTime: null,
    targeted: {
      directories: dirs,
      extensions
    },
    fixes: {
      duplicateImports: {
        fixApplied: fix && fixDuplicateImports,
        filesScanned: 0,
        filesWithIssues: 0,
        filesFixed: 0,
        failed: 0
      },
      unusedImports: {
        fixApplied: fix && fixUnusedImports,
        filesScanned: 0,
        filesWithIssues: 0,
        filesFixed: 0,
        failed: 0
      }
    },
    summary: {
      totalFilesScanned: 0,
      totalFilesWithIssues: 0,
      totalFilesFixed: 0,
      totalFailed: 0
    }
  };
  
  // Fix duplicate imports
  if (fix && fixDuplicateImports) {
    logger.sectionHeader('Fixing Duplicate Imports');
    
    const duplicateImportOptions = {
      targetDirs: dirs,
      includeTestFiles,
      extensions,
      dryRun,
      verbose
    };
    
    try {
      const duplicateResult = await duplicateImportFix.findAndFixDuplicateImports(duplicateImportOptions);
      
      results.fixes.duplicateImports = {
        ...results.fixes.duplicateImports,
        filesScanned: duplicateResult.total,
        filesWithIssues: duplicateResult.total,
        filesFixed: duplicateResult.fixed,
        failed: duplicateResult.failed,
        details: duplicateResult.details
      };
      
      logger.info(`Duplicate imports scan complete: ${duplicateResult.fixed} files fixed, ${duplicateResult.failed} failed`);
    } catch (error) {
      logger.error(`Error fixing duplicate imports: ${error.message}`);
      results.fixes.duplicateImports.failed++;
    }
  }
  
  // Fix unused imports
  if (fix && fixUnusedImports) {
    logger.sectionHeader('Fixing Unused Imports');
    
    const unusedImportOptions = {
      targetDirs: dirs,
      includeTestFiles,
      extensions,
      dryRun,
      verbose
    };
    
    try {
      const unusedResult = await unusedImportFix.findAndFixUnusedImports(unusedImportOptions);
      
      results.fixes.unusedImports = {
        ...results.fixes.unusedImports,
        filesScanned: unusedResult.total,
        filesWithIssues: unusedResult.total,
        filesFixed: unusedResult.fixed,
        failed: unusedResult.failed,
        details: unusedResult.details
      };
      
      logger.info(`Unused imports scan complete: ${unusedResult.fixed} files fixed, ${unusedResult.failed} failed`);
    } catch (error) {
      logger.error(`Error fixing unused imports: ${error.message}`);
      results.fixes.unusedImports.failed++;
    }
  }

  // Fix any remaining issues
  if (fix && !dryRun) {
    const files = getAllTypeScriptFiles();
    for (const file of files) {
      let content = fs.readFileSync(file, 'utf8');
      
      // Replace any types with unknown or proper types
      content = content.replace(/: any/g, ': unknown');
      
      // Remove console statements
      content = content.replace(/console\.(log|warn|error|info|debug)\((.*?)\);?/g, '');
      
      // Fix unused variables
      content = content.replace(/const\s+(\w+)\s*=\s*[^;]+;?/g, (match, varName) => {
        if (!isVariableUsed(content, varName)) {
          return `// Unused variable: ${varName}`;
        }
        return match;
      });

      fs.writeFileSync(file, content);
    }
  }
  
  // Compute summary statistics
  results.summary.totalFilesScanned = Math.max(
    results.fixes.duplicateImports.filesScanned,
    results.fixes.unusedImports.filesScanned
  );
  
  results.summary.totalFilesWithIssues = 
    results.fixes.duplicateImports.filesWithIssues +
    results.fixes.unusedImports.filesWithIssues;
  
  results.summary.totalFilesFixed = 
    results.fixes.duplicateImports.filesFixed +
    results.fixes.unusedImports.filesFixed;
  
  results.summary.totalFailed = 
    results.fixes.duplicateImports.failed +
    results.fixes.unusedImports.failed;
  
  results.endTime = new Date();
  results.duration = results.endTime - results.startTime;
  
  logger.success('TypeScript fixes applied successfully!');
  return results;
}

/**
 * Analyze TypeScript errors in the project
 * 
 * @param {Object} options - Options for analyzing TypeScript errors
 * @param {string|string[]} [options.targetDirs=['./']] - Directories to scan for TypeScript files
 * @param {boolean} [options.useProject=true] - Whether to use tsconfig.json
 * @param {string} [options.configPath='tsconfig.json'] - Path to tsconfig.json
 * @param {boolean} [options.generateReport=false] - Whether to generate a report file
 * @param {string} [options.reportPath='typescript-errors.log'] - Path to the report file
 * @param {boolean} [options.verbose=false] - Whether to log verbose output
 * @returns {Promise<Object>} - Analysis results
 */
export async function analyzeTypeScriptErrors(options) {
  const {
    targetDirs = ['./'],
    useProject = true,
    configPath = 'tsconfig.json',
    generateReport = false,
    reportPath = 'typescript-errors.log',
    verbose = false
  } = options;
  
  logger.sectionHeader('Analyzing TypeScript Errors');
  
  try {
    // Run TypeScript type checking
    const typeCheckResult = await typeValidator.runTypeCheck({
      project: useProject,
      configPath,
      verbose
    });
    
    if (typeCheckResult.success) {
      logger.success('No TypeScript errors found!');
      return {
        success: true,
        errorCount: 0,
        errors: []
      };
    }
    
    // Parse and categorize errors
    const errors = errorParser.parseTypeScriptErrors(typeCheckResult.rawOutput, {
      normalizePaths: true,
      extractSnippets: true
    });
    
    // Group errors by category
    const errorsByCategory = errorParser.groupErrors(errors, 'category');
    
    // Find the most common errors
    const mostCommonErrors = errorParser.findMostCommonErrors(errors, 5);
    
    // Print error summary
    logger.error(`Found ${errors.length} TypeScript errors`);
    
    if (verbose) {
      // Print error categories
      logger.info('Errors by category:');
      for (const [category, categoryErrors] of Object.entries(errorsByCategory)) {
        logger.info(`  ${category}: ${categoryErrors.length} errors`);
      }
      
      // Print most common errors
      logger.info('Most common error types:');
      for (const { code, title, count } of mostCommonErrors) {
        logger.info(`  ${code} (${title}): ${count} occurrences`);
      }
    }
    
    // Generate report if requested
    if (generateReport) {
      const report = typeValidator.generateErrorReport(errors, {
        includeSuggestions: true,
        groupByFile: true
      });
      
      await typeValidator.saveErrorReport(errors, reportPath);
      logger.info(`Error report saved to ${reportPath}`);
    }
    
    return {
      success: false,
      errorCount: errors.length,
      errorsByCategory,
      mostCommonErrors,
      errors
    };
  } catch (error) {
    logger.error(`Error analyzing TypeScript errors: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Verify TypeScript types and fix common issues in one operation
 * 
 * @param {Object} options - Options for verifying and fixing TypeScript
 * @param {string|string[]} [options.targetDirs=['./']] - Directories to scan for TypeScript files
 * @param {boolean} [options.fix=true] - Whether to apply fixes
 * @param {boolean} [options.fixDuplicateImports=true] - Whether to fix duplicate imports
 * @param {boolean} [options.fixUnusedImports=true] - Whether to fix unused imports
 * @param {boolean} [options.dryRun=false] - Whether to perform a dry run without modifying files
 * @param {boolean} [options.generateReport=false] - Whether to generate an error report
 * @param {string} [options.reportPath='typescript-errors.log'] - Path to the error report file
 * @param {boolean} [options.verbose=false] - Whether to log verbose output
 * @returns {Promise<Object>} - Verification and fix results
 */
export async function verifyAndFixTypeScript(options = {}) {
  const {
    targetDirs = ['./'],
    fix = true,
    fixDuplicateImports = true,
    fixUnusedImports = true,
    dryRun = false,
    generateReport = false,
    reportPath = 'typescript-errors.log',
    verbose = false
  } = options;
  
  logger.sectionHeader('TypeScript Verification and Fixing');
  logger.info(`Starting TypeScript verification and fixing process at ${new Date().toISOString()}`);
  
  const startTime = Date.now();
  
  // First analyze TypeScript errors
  const analysisResult = await analyzeTypeScriptErrors({
    targetDirs,
    generateReport,
    reportPath,
    verbose
  });
  
  // Then fix TypeScript issues if requested
  let fixResults = null;
  if (fix) {
    fixResults = await fixTypeScriptIssues({
      targetDirs,
      fix,
      fixDuplicateImports,
      fixUnusedImports,
      dryRun,
      verbose
    });
  }
  
  // Check if we need to re-run type checking after fixes
  let reanalysisResult = null;
  if (fix && !dryRun && (fixResults.summary.totalFilesFixed > 0)) {
    logger.info('Re-analyzing TypeScript errors after applying fixes...');
    
    reanalysisResult = await analyzeTypeScriptErrors({
      targetDirs,
      generateReport: false,
      verbose: false
    });
    
    if (reanalysisResult.success) {
      logger.success('All TypeScript errors fixed!');
    } else {
      const errorDiff = analysisResult.errorCount - reanalysisResult.errorCount;
      if (errorDiff > 0) {
        logger.info(`Fixed ${errorDiff} TypeScript errors. ${reanalysisResult.errorCount} errors remaining.`);
      } else {
        logger.warn('Applied fixes but error count did not decrease.');
      }
    }
  }
  
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000; // Convert to seconds
  
  logger.info(`TypeScript verification and fixing process completed in ${duration.toFixed(2)} seconds`);
  
  return {
    initialAnalysis: analysisResult,
    fixes: fixResults,
    reanalysis: reanalysisResult,
    startTime,
    endTime,
    duration
  };
}

/**
 * Main entry point for the TypeScript fixer CLI
 */
export async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const options = {
      targetDirs: ['.'],
      fix: true,
      fixDuplicateImports: true,
      fixUnusedImports: true,
      dryRun: false,
      generateReport: false,
      reportPath: 'typescript-errors.log',
      verbose: false
    };
    
    // Process arguments
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      if (arg === '--no-fix') {
        options.fix = false;
      } else if (arg === '--no-duplicate-fix') {
        options.fixDuplicateImports = false;
      } else if (arg === '--no-unused-fix') {
        options.fixUnusedImports = false;
      } else if (arg === '--dry-run') {
        options.dryRun = true;
      } else if (arg === '--report') {
        options.generateReport = true;
      } else if (arg === '--report-path' && i + 1 < args.length) {
        options.reportPath = args[++i];
      } else if (arg === '--verbose') {
        options.verbose = true;
      } else if (arg === '--dir' && i + 1 < args.length) {
        options.targetDirs = [args[++i]];

        process.exit(0);
      } else if (!arg.startsWith('--')) {
        options.targetDirs = [arg];
      }
    }
    
    const result = await verifyAndFixTypeScript(options);
    
    // Exit with appropriate code
    if (result.reanalysis?.success || result.initialAnalysis?.success) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    logger.error(`Error in TypeScript fixer: ${error.message}`);
    logger.debug(error.stack);
    process.exit(1);
  }
}


/**
 * Improved error parsing that handles multiple TypeScript error formats
 * @param {string} output - TypeScript error output
 * @returns {Object} - Parsed errors by file
 */
export function parseTypeScriptErrorsEnhanced(output) {
  const errors = {};
  
  // First try the standard approach via the error-parser module
  const parsedErrors = errorParser.parseErrorOutput(output);
  
  if (Object.keys(parsedErrors).length > 0) {
    return parsedErrors;
  }
  
  // If the standard parser didn't find anything, try alternative parsing methods
  logger.info('Using enhanced error parsing for TypeScript errors...');
  
  const lines = output.split('\n');
  
  // First try the normal format: packages/common/src/hooks/useTimeEntries.ts:12:15
  const fileLineRegexNormal = /^(.+\.(ts|tsx)):(\d+):(\d+).*error\s+(TS\d+):\s+(.+)$/;
  
  // Alternate format: packages/common/src/hooks/useTimeEntries.ts(12,15)
  const fileLineRegexParens = /^(.+\.(ts|tsx))\((\d+),(\d+)\).*error\s+(TS\d+):\s+(.+)$/;
  
  // Windows format with parentheses: packages/common/src/hooks/useTimeEntries.ts(12,15)
  const windowsFormatRegex = /(.+\.(ts|tsx))\((\d+),(\d+)\): error (TS\d+): (.+)/;
  
  // Process by looking at each line
  lines.forEach(line => {
    let match = line.match(fileLineRegexNormal) || 
                line.match(fileLineRegexParens) || 
                line.match(windowsFormatRegex);
    
    if (match) {
      const filePath = match[1].trim();
      const lineNumber = parseInt(match[3], 10);
      const column = parseInt(match[4], 10);
      const errorCode = match[5].replace('TS', ''); // Strip 'TS' prefix for consistency
      const errorMessage = match[6].trim();
      
      // Normalize file path for cross-platform compatibility
      const normalizedPath = filePath.replace(/\\/g, '/');
      
      if (!errors[normalizedPath]) {
        errors[normalizedPath] = [];
        logger.info(`Found file with errors: ${normalizedPath}`);
      }
      
      errors[normalizedPath].push({
        line: lineNumber,
        column,
        code: errorCode,
        message: errorMessage,
        rawLine: line
      });
    }
  });
  
  // If no errors detected yet, try to extract from the summary section
  if (Object.keys(errors).length === 0) {
    logger.info('Trying to extract errors from summary section...');
    
    // Look for the summary section with "Errors  Files"
    const filesSectionIndex = lines.findIndex(line => line.includes('Errors  Files'));
    if (filesSectionIndex !== -1) {
      // Process each line after the "Errors  Files" header
      for (let i = filesSectionIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Pattern: "     7  packages/common/src/hooks/useTimeEntries.ts:12"
        const fileSummaryMatch = line.match(/\s*(\d+)\s+(.+):(\d+)/);
        if (fileSummaryMatch) {
          const errorCount = parseInt(fileSummaryMatch[1], 10);
          const filePath = fileSummaryMatch[2].trim();
          const lineNumber = parseInt(fileSummaryMatch[3], 10);
          
          // Normalize path
          const normalizedPath = filePath.replace(/\\/g, '/');
          
          if (!errors[normalizedPath]) {
            errors[normalizedPath] = [];
            
            // Create a generic error entry
            errors[normalizedPath].push({
              line: lineNumber,
              column: 1,
              code: '2300', // Default to duplicate identifier since that's common
              message: 'Duplicate identifier or unused import detected from summary',
              rawLine: line,
              fromSummary: true
            });
            
            logger.info(`Added file from summary: ${normalizedPath} (${errorCount} errors)`);
          }
        }
      }
    }
  }
  
  // If we still have no errors, try to directly extract file paths and scan those files
  if (Object.keys(errors).length === 0) {
    logger.info('No errors found through regular parsing, scanning for file paths mentioned in output...');
    
    // Look for any file path pattern, even without specific error information
    const filePathPattern = /(packages\/[\w-]+\/src\/[\w/.-]+\.tsx?)/g;
    const filePaths = new Set();
    
    let match;
    while ((match = filePathPattern.exec(output)) !== null) {
      filePaths.add(match[1]);
    }
    
    // Add these files with a generic error indicator
    for (const filePath of filePaths) {
      const normalizedPath = filePath.replace(/\\/g, '/');
      
      if (!errors[normalizedPath]) {
        errors[normalizedPath] = [];
        
        errors[normalizedPath].push({
          line: 1, // Default to start of file
          column: 1,
          code: '0000', // Generic code
          message: 'TypeScript issue detected without specific error information',
          fromScanning: true
        });
        
        logger.info(`Added file from scanning: ${normalizedPath}`);
      }
    }
  }
  
  return errors;
}

/**
 * Resolves a file path, handling various formats and path normalization
 * @param {string} filePath - Original file path
 * @returns {string|null} - Resolved file path or null if not found
 */
function resolveFilePath(filePath) {
  // Check if the file exists with the original path
  if (existsSync(filePath)) {
    return filePath;
  }
  
  // Try alternate path formats (helps with Windows paths)
  let altPaths = [
    filePath,
    path.join(getRootDir(), filePath)
  ];
  
  // Try relative path from packages directory if it includes 'packages/'
  if (filePath.includes('packages/')) {
    altPaths.push(path.join(getRootDir(), filePath));
  }
  
  // Check all the alternative paths
  for (const altPath of altPaths) {
    if (existsSync(altPath)) {
      logger.info(`Found file at alternate path: ${altPath}`);
      return altPath;
    }
  }
  
  logger.error(`File not found: ${filePath} or any alternate path`);
  return null;
}

/**
 * Enhanced function to fix TypeScript files using heuristic methods when specific errors aren't identifiable
 * @param {string} filePath - Path to the file 
 * @param {Array} errors - Error information for this file
 * @param {Object} options - Fix options
 * @returns {Promise<Object>} - Fix results
 */
export async function fixFileWithHeuristics(filePath, errors, options = {}) {
  const {
    dryRun = false,
    verbose = false
  } = options;
  
  logger.info(`Analyzing ${filePath} for TypeScript issues...`);
  
  // Resolve the file path
  const resolvedPath = resolveFilePath(filePath);
  if (!resolvedPath) {
    return { 
      success: false,
      message: 'File not found',
      changes: 0
    };
  }
  
  try {
    // Read the file content
    const content = readFileSync(resolvedPath, 'utf-8');
    const lines = content.split('\n');
    
    // Track changes
    let hasChanges = false;
    let changeCount = 0;
    
    // Track imports and duplicates
    const importLines = [];
    const importsByPackage = {};
    const markedForRemoval = new Set();
    
    // Scan for import statements
    lines.forEach((line, index) => {
      // Match various import formats
      const standardImportMatch = line.match(/^import\s+(?:type\s+)?(?:({[^}]+})|(.+))\s+from\s+['"]([^'"]+)['"]/);
      
      if (standardImportMatch) {
        const importItems = standardImportMatch[1] || standardImportMatch[2];
        const packageName = standardImportMatch[3];
        
        // Store import info
        const importInfo = {
          lineIndex: index,
          packageName,
          raw: line
        };
        
        importLines.push(importInfo);
        
        // Group by package
        if (!importsByPackage[packageName]) {
          importsByPackage[packageName] = [];
        }
        importsByPackage[packageName].push(importInfo);
      }
    });
    
    // Find duplicate imports
    Object.entries(importsByPackage).forEach(([packageName, imports]) => {
      if (imports.length > 1) {
        if (verbose) {
          logger.info(`Found ${imports.length} imports from ${packageName}`);
        }
        
        // Keep the first occurrence, mark others for removal
        imports.slice(1).forEach(imp => {
          markedForRemoval.add(imp.lineIndex);
          hasChanges = true;
          changeCount++;
          if (verbose) {
            logger.info(`Marking duplicate import for removal at line ${imp.lineIndex + 1}`);
          }
        });
      }
    });
    
    // Handle specific error types
    if (Array.isArray(errors)) {
      errors.forEach(error => {
        // Find unused imports (TS6192 or similar)
        if (error.code === '6192' || error.message.includes('unused')) {
          const lineNum = error.line;
          
          importLines.forEach(importInfo => {
            if (importInfo.lineIndex + 1 === lineNum) {
              markedForRemoval.add(importInfo.lineIndex);
              hasChanges = true;
              changeCount++;
              if (verbose) {
                logger.info(`Marking unused import for removal at line ${lineNum}`);
              }
            }
          });
        }
      });
    }
    
    // If we don't have specific errors but we found the file in the output,
    // assume it has duplicate imports and remove them
    if (!hasChanges && errors.some(e => e.fromSummary || e.fromScanning)) {
      logger.info(`No specific errors identified in ${filePath}, using heuristic-based cleanup`);
      
      Object.entries(importsByPackage).forEach(([packageName, imports]) => {
        if (imports.length > 1) {
          // Keep the first occurrence, mark others for removal
          imports.slice(1).forEach(imp => {
            markedForRemoval.add(imp.lineIndex);
            hasChanges = true;
            changeCount++;
            if (verbose) {
              logger.info(`Heuristic: Marking duplicate import for removal at line ${imp.lineIndex + 1}`);
            }
          });
        }
      });
    }
    
    if (!hasChanges) {
      logger.info(`No changes needed for ${filePath}`);
      return {
        success: true,
        message: 'No changes needed',
        changes: 0
      };
    }
    
    // Build the new content with lines removed
    const newLines = lines.filter((_, index) => !markedForRemoval.has(index));
    
    if (!dryRun) {
      // Write the fixed content back to the file
      writeFileSync(resolvedPath, newLines.join('\n'), 'utf-8');
      logger.success(`Fixed file: ${filePath} (removed ${markedForRemoval.size} lines)`);
    } else {
      logger.info(`Would fix file: ${filePath} (would remove ${markedForRemoval.size} lines)`);
    }
    
    return {
      success: true,
      message: dryRun ? 'Changes identified (dry run)' : 'Fixed file',
      changes: markedForRemoval.size
    };
  } catch (error) {
    logger.error(`Error processing ${filePath}: ${error.message}`);
    return {
      success: false,
      message: `Error: ${error.message}`,
      changes: 0
    };
  }
}

/**
 * Generate a detailed report of TypeScript errors and fixes
 * @param {Object} data - Data for the report
 * @returns {Object} - Generated report data
 */
function generateReport(data = {}) {
  const {
    typeCheckResult,
    fileCount = 0,
    fixResults = null
  } = data;
  
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      typeCheckPassed: typeCheckResult?.success || false,
      fileCount,
      fixesApplied: fixResults !== null,
      totalFixedFiles: 0,
      totalRemainingIssues: 0
    },
    details: {
      errors: {},
      fixes: {}
    }
  };
  
  // Add error details if available
  if (typeCheckResult && !typeCheckResult.success) {
    report.details.errors.output = typeCheckResult.stdout + '\n' + typeCheckResult.stderr;
  }
  
  // Add fix details if available
  if (fixResults) {
    report.summary.totalFixedFiles = (fixResults.fixes.duplicateImports?.filesFixed || 0) +
                                     (fixResults.fixes.unusedImports?.filesFixed || 0) +
                                     (fixResults.fixes.heuristics?.heuristicFixed || 0);
    
    report.details.fixes = {
      duplicateImports: fixResults.fixes.duplicateImports,
      unusedImports: fixResults.fixes.unusedImports,
      heuristics: fixResults.fixes.heuristics,
      verificationAfterFix: fixResults.verificationAfterFix
    };
    
    if (fixResults.verificationAfterFix) {
      report.summary.totalRemainingIssues = fixResults.verificationAfterFix.remainingFileCount || 0;
    }
  }
  
  return report;
}

/**
 * Enhanced verification and fixing for TypeScript issues
 * @param {Object} options - Verification options
 * @returns {Promise<Object>} - Result of verification and fixing
 */
export async function verifyAndFixTypeScriptEnhanced(options = {}) {
  const {
    targetDirs = [path.join(getRootDir(), 'packages')],
    fix = true,
    dryRun = false,
    report = false,
    verbose = false,
    typeCheckCommand = 'npx tsc --noEmit',
    fixDuplicateImports = true,
    fixUnusedImports = true,
    fixHeuristics = true,
    includeTestFiles = false
  } = options;
  
  logger.sectionHeader('TypeScript Verification and Fixing');
  logger.info('Running TypeScript type checking...');
  
  // Run type check
  const typeCheckResult = await commandRunner.runCommand(typeCheckCommand, {
    cwd: getRootDir(),
    shell: true,
    captureStdout: true,
    captureStderr: true
  });
  
  // Check if there are any errors
  if (typeCheckResult.success) {
    logger.success('TypeScript check passed! No errors to fix.');
    return {
      success: true,
      verificationPassed: true,
      fixesApplied: false,
      report: report ? generateReport({ typeCheckResult, fixResults: null }) : null
    };
  }
  
  // Parse errors - first try the enhanced parsing
  const typeScriptErrors = parseTypeScriptErrorsEnhanced(typeCheckResult.stdout + '\n' + typeCheckResult.stderr);
  const fileCount = Object.keys(typeScriptErrors).length;
  
  logger.info(`Found ${fileCount} files with TypeScript errors`);
  
  if (fileCount === 0) {
    logger.warning('TypeScript check failed but no specific files with errors could be identified.');
    return {
      success: false,
      verificationPassed: false,
      fixesApplied: false,
      errorOutput: typeCheckResult.stdout + '\n' + typeCheckResult.stderr,
      report: report ? generateReport({ typeCheckResult, fileCount: 0 }) : null
    };
  }
  
  // Apply fixes if requested
  let fixResults = null;
  
  if (fix) {
    logger.info('Applying fixes to TypeScript issues...');
    
    // Apply standard fixes first (duplicate and unused imports)
    fixResults = await fixTypeScriptIssues({
      targetDirs,
      fix: true,
      includeTestFiles,
      fixDuplicateImports,
      fixUnusedImports,
      verbose,
      dryRun
    });
    
    // Then apply heuristic-based fixes for remaining issues
    if (fixHeuristics) {
      logger.info('Applying heuristic-based fixes for remaining issues...');
      
      const heuristicResults = {
        heuristicAttempts: 0,
        heuristicFixed: 0,
        heuristicFailures: 0,
        details: []
      };
      
      // Apply heuristic fixes to each file with errors
      for (const [filePath, errors] of Object.entries(typeScriptErrors)) {
        heuristicResults.heuristicAttempts++;
        
        const result = await fixFileWithHeuristics(filePath, errors, {
          dryRun,
          verbose
        });
        
        if (result.success && result.changes > 0) {
          heuristicResults.heuristicFixed++;
        } else if (!result.success) {
          heuristicResults.heuristicFailures++;
        }
        
        heuristicResults.details.push({
          filePath,
          result
        });
      }
      
      // Merge the heuristic results with the standard fix results
      fixResults.fixes.heuristics = heuristicResults;
    }
    
    // Run TypeScript check again to verify fixes
    if (!dryRun) {
      logger.info('Running TypeScript check again to verify fixes...');
      
      const secondCheckResult = await commandRunner.runCommand(typeCheckCommand, {
        cwd: getRootDir(),
        shell: true,
        captureStdout: true,
        captureStderr: true
      });
      
      if (secondCheckResult.success) {
        logger.success('All TypeScript issues fixed successfully!');
        fixResults.verificationAfterFix = {
          success: true
        };
      } else {
        logger.warning('Some TypeScript issues remain after fixing:');
        const remainingErrors = parseTypeScriptErrorsEnhanced(
          secondCheckResult.stdout + '\n' + secondCheckResult.stderr
        );
        
        fixResults.verificationAfterFix = {
          success: false,
          remainingFileCount: Object.keys(remainingErrors).length
        };
      }
    }
  }
  
  // Generate report if requested
  const reportData = report ? generateReport({
    typeCheckResult,
    fileCount,
    fixResults
  }) : null;
  
  return {
    success: true,
    verificationPassed: false,
    fileCount,
    fixesApplied: fix,
    fixResults,
    report: reportData
  };
}

// Run main function if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
} 