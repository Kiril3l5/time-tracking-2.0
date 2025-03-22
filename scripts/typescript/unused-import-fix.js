#!/usr/bin/env node

/**
 * TypeScript Unused Import Fixer Module
 * 
 * Provides utilities for identifying and removing unused imports in TypeScript files.
 * 
 * Features:
 * - Find unused imports in TypeScript files
 * - Remove unused imports automatically
 * - Support for both ESM and CommonJS import styles
 * - Customizable scan options and ignore patterns
 * 
 * @module typescript/unused-import-fix
 */

import fs from 'fs/promises';
import path from 'path';
import * as logger from '../core/logger.js';
import * as commandRunner from '../core/command-runner.js';

/**
 * Find files with unused imports
 * 
 * @param {Object} options - Options for finding unused imports
 * @param {string|string[]} options.targetDirs - Directories to scan for TypeScript files
 * @param {boolean} [options.includeTestFiles=false] - Whether to include test files
 * @param {string[]} [options.extensions=['.ts', '.tsx']] - File extensions to check
 * @param {boolean} [options.verbose=false] - Whether to log verbose output
 * @returns {Promise<Array>} - List of files with unused imports
 */
export async function findFilesWithUnusedImports(options) {
  const {
    targetDirs,
    includeTestFiles = false,
    extensions = ['.ts', '.tsx'],
    verbose = false
  } = options;
  
  const dirs = Array.isArray(targetDirs) ? targetDirs : [targetDirs];
  
  // Execute ESLint with the no-unused-vars rule to identify unused imports
  const extensionArgs = extensions.map(ext => `--ext ${ext}`).join(' ');
  const testFilesIgnore = includeTestFiles ? '' : '--ignore-pattern "**/*.test.*" --ignore-pattern "**/*.spec.*" --ignore-pattern "**/__tests__/*"';
  
  const command = `npx eslint ${extensionArgs} ${testFilesIgnore} --no-eslintrc --parser @typescript-eslint/parser --plugin @typescript-eslint --rule 'no-unused-vars: error' --rule '@typescript-eslint/no-unused-vars: error' --format json ${dirs.join(' ')}`;
  
  logger.debug(`Running command: ${command}`);
  
  try {
    const result = await commandRunner.run(command, { captureOutput: true, ignoreError: true });
    
    // Parse ESLint JSON output
    let eslintResults;
    try {
      // ESLint returns an array even with --format json
      eslintResults = JSON.parse(result.output);
    } catch (error) {
      logger.error(`Failed to parse ESLint output: ${error.message}`);
      logger.debug(`Raw output: ${result.output}`);
      return [];
    }
    
    // Extract files with unused imports
    const filesWithUnusedImports = [];
    
    for (const fileResult of eslintResults) {
      const { filePath, messages } = fileResult;
      
      // Filter messages for unused imports
      const unusedImports = messages.filter(message => {
        // Check for no-unused-vars rule
        const isUnusedVar = message.ruleId === 'no-unused-vars' || message.ruleId === '@typescript-eslint/no-unused-vars';
        
        // Check for import declarations
        const isImport = message.message.includes("'") && (
          message.message.includes(' imported ') || 
          message.message.includes(' import ') ||
          message.message.includes(' require')
        );
        
        return isUnusedVar && isImport;
      });
      
      if (unusedImports.length > 0) {
        filesWithUnusedImports.push({
          file: filePath,
          unusedImports: unusedImports.map(message => ({
            name: extractImportName(message.message),
            line: message.line,
            column: message.column,
            message: message.message
          }))
        });
      }
    }
    
    if (verbose) {
      logger.info(`Found ${filesWithUnusedImports.length} files with unused imports`);
    }
    
    return filesWithUnusedImports;
  } catch (err) {
    logger.error(`Error finding unused imports: ${err.message}`);
    return [];
  }
}

/**
 * Extract import name from ESLint message
 * 
 * @param {string} message - ESLint error message
 * @returns {string} - Extracted import name
 */
function extractImportName(message) {
  // Extract the import name from ESLint messages
  // Common patterns:
  // - "'X' is defined but never used"
  // - "'X' is imported but never used"
  
  const matches = message.match(/'([^']+)'/) || message.match(/"([^"]+)"/);
  return matches ? matches[1] : 'unknown';
}

/**
 * Fix unused imports in a file
 * 
 * @param {string} file - Path to the file to fix
 * @param {Array} unusedImports - List of unused imports to remove
 * @param {boolean} [dryRun=false] - Whether to perform a dry run without modifying the file
 * @param {boolean} [verbose=false] - Whether to log verbose output
 * @returns {Promise<Object>} - Result of the fix operation
 */
export async function fixUnusedImports(file, unusedImports, dryRun = false, verbose = false) {
  try {
    const content = await fs.readFile(file, 'utf8');
    const lines = content.split('\n');
    
    // Build a map of line number -> unused imports on that line
    const lineImports = new Map();
    for (const imp of unusedImports) {
      if (!lineImports.has(imp.line)) {
        lineImports.set(imp.line, []);
      }
      lineImports.get(imp.line).push(imp);
    }
    
    // Process each line with unused imports
    const newLines = [...lines];
    const removedImports = [];
    
    for (const [lineNumber, importsOnLine] of lineImports.entries()) {
      const lineIndex = lineNumber - 1; // Convert to 0-based index
      const line = lines[lineIndex];
      
      // Skip empty lines or non-existent lines
      if (!line || lineIndex < 0 || lineIndex >= lines.length) {
        continue;
      }
      
      // Check for different import styles
      if (line.includes('import ') && line.includes(' from ')) {
        // ES module import style
        // Like: import { A, B, C } from 'module';
        // or: import A from 'module';
        // or: import * as A from 'module';
        
        const unusedNames = importsOnLine.map(imp => imp.name);
        const newLine = removeUnusedESImport(line, unusedNames);
        
        if (newLine !== line) {
          newLines[lineIndex] = newLine;
          removedImports.push(...importsOnLine.map(imp => imp.name));
          
          if (verbose) {
            logger.debug(`Line ${lineNumber}: Removed unused imports: ${unusedNames.join(', ')}`);
          }
        }
      } else if (line.includes('require(')) {
        // CommonJS require style
        // Like: import { A, B, C  } from 'module';
        // or: import A from 'module';
        
        const unusedNames = importsOnLine.map(imp => imp.name);
        const newLine = removeUnusedRequire(line, unusedNames);
        
        if (newLine !== line) {
          newLines[lineIndex] = newLine;
          removedImports.push(...importsOnLine.map(imp => imp.name));
          
          if (verbose) {
            logger.debug(`Line ${lineNumber}: Removed unused imports: ${unusedNames.join(', ')}`);
          }
        }
      }
    }
    
    // Remove empty imports
    const finalLines = removeEmptyImports(newLines);
    const fixedContent = finalLines.join('\n');
    
    if (content === fixedContent) {
      return {
        file,
        fixed: false,
        message: 'No changes made'
      };
    }
    
    if (!dryRun) {
      await fs.writeFile(file, fixedContent, 'utf8');
    }
    
    return {
      file,
      fixed: true,
      removedImports,
      message: dryRun ? 'Unused imports can be fixed (dry run)' : `Removed ${removedImports.length} unused imports`
    };
  } catch (err) {
    logger.error(`Error fixing unused imports in ${file}: ${err.message}`);
    return {
      file,
      fixed: false,
      error: err.message
    };
  }
}

/**
 * Remove unused ES imports from a line
 * 
 * @param {string} line - Line with ES imports
 * @param {string[]} unusedNames - Names of unused imports
 * @returns {string} - Line with unused imports removed
 */
function removeUnusedESImport(line, unusedNames) {
  // Get the part between import and from
  const importMatch = line.match(/import\s+(.*?)\s+from/);
  if (!importMatch) return line;
  
  const importClause = importMatch[1];
  
  // Check for default import: import A from 'module';
  if (!importClause.includes('{') && !importClause.includes('*')) {
    const defaultName = importClause.trim();
    if (unusedNames.includes(defaultName)) {
      // Remove the entire import
      return '';
    }
    return line;
  }
  
  // Check for namespace import: import * as A from 'module';
  if (importClause.includes('*')) {
    const namespaceMatch = importClause.match(/\*\s+as\s+(\w+)/);
    if (namespaceMatch && unusedNames.includes(namespaceMatch[1])) {
      // Remove the entire import
      return '';
    }
    return line;
  }
  
  // Handle named imports: import { A, B, C } from 'module';
  const namedImportsMatch = importClause.match(/{([^}]*)}/);
  if (!namedImportsMatch) return line;
  
  const namedImports = namedImportsMatch[1].split(',')
    .map(name => {
      // Handle type imports like { type X }
      const typePrefixMatch = name.match(/type\s+(\w+)/);
      if (typePrefixMatch) {
        return {
          name: typePrefixMatch[1].trim(),
          fullText: name.trim(),
          isType: true
        };
      }
      
      // Handle aliases like { X as Y }
      const aliasMatch = name.match(/(\w+)\s+as\s+(\w+)/);
      if (aliasMatch) {
        return {
          name: aliasMatch[2].trim(), // The local name (Y) is what's unused
          fullText: name.trim(),
          isAlias: true
        };
      }
      
      // Regular import
      return {
        name: name.trim(),
        fullText: name.trim()
      };
    });
  
  // Filter out unused imports
  const filteredImports = namedImports.filter(imp => !unusedNames.includes(imp.name));
  
  // If all imports are unused, remove the entire line
  if (filteredImports.length === 0) {
    return '';
  }
  
  // Otherwise, rebuild the import statement
  const newImportClause = `{ ${filteredImports.map(imp => imp.fullText).join(', ')} }`;
  
  // If this is a type-only import (import type { ... })
  if (line.includes('import type ')) {
    return line.replace(/import type\s+{[^}]*}/, `import type ${newImportClause}`);
  }
  
  // Regular import
  return line.replace(/{[^}]*}/, newImportClause);
}

/**
 * Remove unused CommonJS requires from a line
 * 
 * @param {string} line - Line with CommonJS requires
 * @param {string[]} unusedNames - Names of unused imports
 * @returns {string} - Line with unused imports removed
 */
function removeUnusedRequire(line, unusedNames) {
  // Match the variable assignment part: const X = or const { X, Y } =
  const requireMatch = line.match(/(?:const|let|var)\s+(.*?)\s*=\s*require/);
  if (!requireMatch) return line;
  
  const requireClause = requireMatch[1];
  
  // Simple require: import A from 'module';
  if (!requireClause.includes('{')) {
    if (unusedNames.includes(requireClause.trim())) {
      // Remove the entire line
      return '';
    }
    return line;
  }
  
  // Destructured require: import { A, B, C  } from 'module';
  const destructuredMatch = requireClause.match(/{([^}]*)}/);
  if (!destructuredMatch) return line;
  
  const destructuredImports = destructuredMatch[1].split(',')
    .map(name => {
      // Handle aliases like { X: Y }
      const aliasMatch = name.match(/(\w+)\s*:\s*(\w+)/);
      if (aliasMatch) {
        return {
          name: aliasMatch[2].trim(), // The local name (Y) is what's unused
          fullText: name.trim(),
          isAlias: true
        };
      }
      
      // Regular import
      return {
        name: name.trim(),
        fullText: name.trim()
      };
    });
  
  // Filter out unused imports
  const filteredImports = destructuredImports.filter(imp => !unusedNames.includes(imp.name));
  
  // If all imports are unused, remove the entire line
  if (filteredImports.length === 0) {
    return '';
  }
  
  // Otherwise, rebuild the import statement
  const newRequireClause = `{ ${filteredImports.map(imp => imp.fullText).join(', ')} }`;
  
  return line.replace(/{[^}]*}/, newRequireClause);
}

/**
 * Remove empty import statements from an array of lines
 * 
 * @param {string[]} lines - Array of code lines
 * @returns {string[]} - Lines with empty imports removed
 */
function removeEmptyImports(lines) {
  return lines.filter(line => {
    // Skip empty lines
    if (!line.trim()) return true;
    
    // Remove empty import statements: import {} from 'module';
    if (line.includes('import') && line.includes('from') && line.match(/import\s*{\s*}\s*from/)) {
      return false;
    }
    
    // Remove empty require statements: const {} = require('module');
    if (line.includes('require') && line.match(/(?:const|let|var)\s*{\s*}\s*=/)) {
      return false;
    }
    
    return true;
  });
}

/**
 * Fix unused imports in multiple files
 * 
 * @param {Array} filesWithUnusedImports - Array of files with unused imports
 * @param {boolean} [dryRun=false] - Whether to perform a dry run without modifying files
 * @param {boolean} [verbose=false] - Whether to log verbose output
 * @returns {Promise<Object>} - Result of the fix operation
 */
export async function fixUnusedImportsInFiles(filesWithUnusedImports, dryRun = false, verbose = false) {
  const results = {
    total: filesWithUnusedImports.length,
    processed: 0,
    fixed: 0,
    failed: 0,
    skipped: 0,
    details: []
  };
  
  for (const { file, unusedImports } of filesWithUnusedImports) {
    try {
      const result = await fixUnusedImports(file, unusedImports, dryRun, verbose);
      results.processed++;
      
      if (result.fixed) {
        results.fixed++;
      } else if (result.error) {
        results.failed++;
      } else {
        results.skipped++;
      }
      
      results.details.push(result);
      
      if (verbose) {
        logger.info(`${result.fixed ? 'Fixed' : 'Skipped'} ${file}: ${result.message}`);
      }
    } catch (err) {
      logger.error(`Error processing ${file}: ${err.message}`);
      results.processed++;
      results.failed++;
      results.details.push({
        file,
        fixed: false,
        error: err.message
      });
    }
  }
  
  return results;
}

/**
 * Find and fix unused imports in a project
 * 
 * @param {Object} options - Options for fixing unused imports
 * @param {string|string[]} options.targetDirs - Directories to scan for TypeScript files
 * @param {boolean} [options.includeTestFiles=false] - Whether to include test files
 * @param {string[]} [options.extensions=['.ts', '.tsx']] - File extensions to check
 * @param {boolean} [options.dryRun=false] - Whether to perform a dry run without modifying files
 * @param {boolean} [options.verbose=false] - Whether to log verbose output
 * @returns {Promise<Object>} - Result of the operation
 */
export async function findAndFixUnusedImports(options) {
  const {
    targetDirs,
    includeTestFiles = false,
    extensions = ['.ts', '.tsx'],
    dryRun = false,
    verbose = false
  } = options;
  
  logger.info(`Searching for files with unused imports...`);
  
  const filesWithUnusedImports = await findFilesWithUnusedImports({
    targetDirs,
    includeTestFiles,
    extensions,
    verbose
  });
  
  if (filesWithUnusedImports.length === 0) {
    logger.info('No files with unused imports found.');
    return {
      total: 0,
      fixed: 0,
      failed: 0,
      skipped: 0,
      details: []
    };
  }
  
  logger.info(`Found ${filesWithUnusedImports.length} files with unused imports.`);
  
  if (verbose) {
    for (const { file, unusedImports } of filesWithUnusedImports) {
      logger.info(`${file}:`);
      for (const { name, line, message } of unusedImports) {
        logger.info(`  Line ${line}: ${name} - ${message}`);
      }
    }
  }
  
  if (dryRun) {
    logger.info('Dry run: not fixing files.');
    return {
      total: filesWithUnusedImports.length,
      fixed: 0,
      failed: 0,
      skipped: filesWithUnusedImports.length,
      details: filesWithUnusedImports.map(({ file }) => ({
        file,
        fixed: false,
        message: 'Dry run: not fixed'
      }))
    };
  }
  
  logger.info(`Fixing unused imports in ${filesWithUnusedImports.length} files...`);
  
  const results = await fixUnusedImportsInFiles(filesWithUnusedImports, false, verbose);
  
  logger.info(`Fixed unused imports in ${results.fixed} files.`);
  
  return results;
} 