#!/usr/bin/env node

/**
 * TypeScript Duplicate Import Fixer Module
 * 
 * Provides utilities for identifying and fixing duplicate import statements in TypeScript files.
 * 
 * Features:
 * - Find duplicate imports (same module imported multiple times)
 * - Merge duplicate imports into single import statements
 * - Fix type-only imports vs. value imports
 * - Support for ESM and CommonJS import styles
 * 
 * @module typescript/duplicate-import-fix
 */

import fs from 'fs/promises';
import path from 'path';
import * as logger from '../core/logger.js';
import * as commandRunner from '../core/command-runner.js';

/**
 * Find files with duplicate imports
 * 
 * @param {Object} options - Options for finding duplicate imports
 * @param {string|string[]} options.targetDirs - Directories to scan for TypeScript files
 * @param {boolean} [options.includeTestFiles=false] - Whether to include test files
 * @param {string[]} [options.extensions=['.ts', '.tsx']] - File extensions to check
 * @param {boolean} [options.verbose=false] - Whether to log verbose output
 * @returns {Promise<Array>} - List of files with duplicate imports
 */
export async function findFilesWithDuplicateImports(options) {
  const {
    targetDirs,
    includeTestFiles = false,
    extensions = ['.ts', '.tsx'],
    verbose = false
  } = options;
  
  const dirs = Array.isArray(targetDirs) ? targetDirs : [targetDirs];
  
  // Build the grep command to find potential duplicate imports
  const grepPatterns = ['from [\'"]', 'import {', 'import *', 'require\\('];
  const grepPattern = grepPatterns.join('\\|');
  
  const extensionPattern = extensions.join('\\|').replace(/\./g, '\\.');
  
  let excludePattern = '';
  if (!includeTestFiles) {
    excludePattern = '--exclude="*.test.*" --exclude="*.spec.*" --exclude="*/__tests__/*"';
  }
  
  const command = `grep -r "${grepPattern}" --include="*{${extensionPattern}}" ${excludePattern} ${dirs.join(' ')}`;
  
  logger.debug(`Running command: ${command}`);
  
  try {
    const result = await commandRunner.run(command, { captureOutput: true, ignoreError: true });
    
    // Group by file
    const fileLines = {};
    
    result.output.split('\n').forEach(line => {
      if (!line) return;
      
      // Extract file and matched line
      const colonIndex = line.indexOf(':');
      if (colonIndex < 0) return;
      
      const file = line.substring(0, colonIndex);
      const importLine = line.substring(colonIndex + 1);
      
      if (!fileLines[file]) {
        fileLines[file] = [];
      }
      
      fileLines[file].push(importLine);
    });
    
    // Find files with potential duplicate imports
    const suspiciousFiles = [];
    
    for (const [file, lines] of Object.entries(fileLines)) {
      const modulesImported = new Map();
      
      // Count module imports
      lines.forEach(line => {
        const moduleMatch = line.match(/from\s+['"](.*?)['"]/);
        if (moduleMatch) {
          const moduleName = moduleMatch[1];
          modulesImported.set(moduleName, (modulesImported.get(moduleName) || 0) + 1);
        }
        
        const requireMatch = line.match(/require\(['"](.*?)['"]\)/);
        if (requireMatch) {
          const moduleName = requireMatch[1];
          modulesImported.set(moduleName, (modulesImported.get(moduleName) || 0) + 1);
        }
      });
      
      // Find duplicates
      const duplicates = [];
      for (const [moduleName, count] of modulesImported.entries()) {
        if (count > 1) {
          duplicates.push({ moduleName, count });
        }
      }
      
      if (duplicates.length > 0) {
        suspiciousFiles.push({
          file,
          duplicates
        });
      }
    }
    
    if (verbose) {
      logger.info(`Found ${suspiciousFiles.length} files with potential duplicate imports`);
    }
    
    // Verify duplicates by reading the file contents
    const filesWithDuplicates = [];
    
    for (const { file, duplicates } of suspiciousFiles) {
      try {
        const content = await fs.readFile(file, 'utf8');
        const lines = content.split('\n');
        
        const confirmedDuplicates = [];
        
        for (const { moduleName } of duplicates) {
          // Regular expression to find imports for this module
          const importRegex = new RegExp(`(?:import\\s+[^;]*?from|require\\()\\s*['"]${escapeRegExp(moduleName)}['"]`, 'g');
          
          let match;
          const matchedLines = [];
          
          while ((match = importRegex.exec(content)) !== null) {
            // Find the line number for this match
            const lineIndex = findLineForPosition(content, match.index);
            matchedLines.push(lineIndex);
          }
          
          if (matchedLines.length > 1) {
            confirmedDuplicates.push({
              moduleName,
              lines: matchedLines.map(index => ({
                lineNumber: index + 1,
                content: lines[index]
              }))
            });
          }
        }
        
        if (confirmedDuplicates.length > 0) {
          filesWithDuplicates.push({
            file,
            duplicates: confirmedDuplicates
          });
        }
      } catch (err) {
        logger.error(`Error reading file ${file}: ${err.message}`);
      }
    }
    
    return filesWithDuplicates;
  } catch (err) {
    logger.error(`Error finding duplicate imports: ${err.message}`);
    return [];
  }
}

/**
 * Fix duplicate imports in a file
 * 
 * @param {string} file - Path to the file to fix
 * @param {boolean} [dryRun=false] - Whether to perform a dry run without modifying the file
 * @param {boolean} [verbose=false] - Whether to log verbose output
 * @returns {Promise<Object>} - Result of the fix operation
 */
export async function fixDuplicateImports(file, dryRun = false, verbose = false) {
  try {
    const content = await fs.readFile(file, 'utf8');
    const lines = content.split('\n');
    
    // Map of module name -> array of import info
    const moduleImports = new Map();
    
    // Find all import statements and group by module
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Modern ES import
      // e.g., import { Component } from 'react';
      // or import React from 'react';
      // or import * as React from 'react';
      const esImportMatch = line.match(/import\s+((?:[^{]|{[^}]*})*?)\s+from\s+['"]([^'"]+)['"]/);
      if (esImportMatch) {
        const importClause = esImportMatch[1].trim();
        const moduleName = esImportMatch[2];
        
        if (!moduleImports.has(moduleName)) {
          moduleImports.set(moduleName, []);
        }
        
        moduleImports.get(moduleName).push({
          type: 'es',
          line: i,
          content: line,
          importClause,
          isTypeOnly: line.includes('import type ') || line.includes('import { type ')
        });
        
        continue;
      }
      
      // CommonJS require
      // e.g., import React from 'react';
      // or import { Component  } from 'react';
      const requireMatch = line.match(/(?:const|let|var)\s+((?:[^=]|{[^}]*})*?)\s*=\s*require\(['"]([^'"]+)['"]\)/);
      if (requireMatch) {
        const importClause = requireMatch[1].trim();
        const moduleName = requireMatch[2];
        
        if (!moduleImports.has(moduleName)) {
          moduleImports.set(moduleName, []);
        }
        
        moduleImports.get(moduleName).push({
          type: 'require',
          line: i,
          content: line,
          importClause
        });
      }
    }
    
    // Find modules with duplicate imports
    const modulesToFix = [];
    
    for (const [moduleName, imports] of moduleImports.entries()) {
      if (imports.length > 1) {
        modulesToFix.push({
          moduleName,
          imports
        });
      }
    }
    
    if (modulesToFix.length === 0) {
      return {
        file,
        fixed: false,
        message: 'No duplicate imports found'
      };
    }
    
    if (verbose) {
      logger.info(`Found ${modulesToFix.length} modules with duplicate imports in ${file}`);
    }
    
    // Create a fixed version of the file
    const newLines = [...lines];
    const linesToRemove = new Set();
    
    for (const { moduleName, imports } of modulesToFix) {
      // Group imports by type (ES imports vs. CommonJS requires)
      const esImports = imports.filter(imp => imp.type === 'es');
      const requireImports = imports.filter(imp => imp.type === 'require');
      
      // Handle ES imports
      if (esImports.length > 1) {
        if (verbose) {
          logger.info(`Merging ${esImports.length} ES imports for '${moduleName}'`);
        }
        
        // Separate type-only and value imports
        const typeImports = esImports.filter(imp => imp.isTypeOnly);
        const valueImports = esImports.filter(imp => !imp.isTypeOnly);
        
        // Handle value imports
        if (valueImports.length > 1) {
          // Parse all import clauses
          const mergedImports = mergeESImports(valueImports.map(imp => imp.importClause));
          
          // Create new import statement
          const firstLine = valueImports[0].line;
          newLines[firstLine] = `import ${mergedImports} from '${moduleName}';`;
          
          // Mark other lines for removal
          for (let i = 1; i < valueImports.length; i++) {
            linesToRemove.add(valueImports[i].line);
          }
        }
        
        // Handle type-only imports
        if (typeImports.length > 1) {
          // Parse all import clauses
          const mergedImports = mergeESImports(typeImports.map(imp => imp.importClause));
          
          // Create new import statement
          const firstLine = typeImports[0].line;
          newLines[firstLine] = `import type ${mergedImports} from '${moduleName}';`;
          
          // Mark other lines for removal
          for (let i = 1; i < typeImports.length; i++) {
            linesToRemove.add(typeImports[i].line);
          }
        }
      }
      
      // Handle CommonJS requires
      if (requireImports.length > 1) {
        if (verbose) {
          logger.info(`Merging ${requireImports.length} require imports for '${moduleName}'`);
        }
        
        // Parse all import clauses
        const mergedImports = mergeRequireImports(requireImports.map(imp => imp.importClause));
        
        // Create new import statement
        const firstLine = requireImports[0].line;
        newLines[firstLine] = `const ${mergedImports} = require('${moduleName}');`;
        
        // Mark other lines for removal
        for (let i = 1; i < requireImports.length; i++) {
          linesToRemove.add(requireImports[i].line);
        }
      }
    }
    
    // Remove marked lines
    const fixedLines = newLines.filter((_, i) => !linesToRemove.has(i));
    const fixedContent = fixedLines.join('\n');
    
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
      fixedContent,
      removedLines: linesToRemove.size,
      message: dryRun ? 'Duplicate imports can be fixed (dry run)' : 'Fixed duplicate imports'
    };
  } catch (err) {
    logger.error(`Error fixing duplicate imports in ${file}: ${err.message}`);
    return {
      file,
      fixed: false,
      error: err.message
    };
  }
}

/**
 * Merge ES import clauses
 * 
 * @param {string[]} importClauses - Array of import clauses
 * @returns {string} - Merged import clause
 */
function mergeESImports(importClauses) {
  // Default imports (e.g., "React")
  const defaultImports = new Set();
  
  // Named imports (e.g., "{ Component, useState }")
  const namedImports = new Set();
  
  // Namespace imports (e.g., "* as React")
  const namespaceImports = new Set();
  
  // Process each import clause
  for (const clause of importClauses) {
    // Default import
    const defaultMatch = clause.match(/^([A-Za-z0-9_$]+)$/);
    if (defaultMatch) {
      defaultImports.add(defaultMatch[1]);
      continue;
    }
    
    // Namespace import
    const namespaceMatch = clause.match(/^\*\s+as\s+([A-Za-z0-9_$]+)$/);
    if (namespaceMatch) {
      namespaceImports.add(namespaceMatch[1]);
      continue;
    }
    
    // Named imports
    const namedMatch = clause.match(/{([^}]*)}/);
    if (namedMatch) {
      const names = namedMatch[1].split(',')
        .map(name => name.trim())
        .filter(name => name);
      
      names.forEach(name => namedImports.add(name));
    }
  }
  
  // Build the merged import clause
  const parts = [];
  
  // Add default import
  if (defaultImports.size > 0) {
    // If there are multiple default imports, use the first one and log a warning
    if (defaultImports.size > 1) {
      logger.warn(`Multiple default imports found: ${Array.from(defaultImports).join(', ')}. Using ${Array.from(defaultImports)[0]}`);
    }
    parts.push(Array.from(defaultImports)[0]);
  }
  
  // Add namespace import
  if (namespaceImports.size > 0) {
    // If there are multiple namespace imports, use the first one and log a warning
    if (namespaceImports.size > 1) {
      logger.warn(`Multiple namespace imports found: ${Array.from(namespaceImports).join(', ')}. Using ${Array.from(namespaceImports)[0]}`);
    }
    parts.push(`* as ${Array.from(namespaceImports)[0]}`);
  }
  
  // Add named imports
  if (namedImports.size > 0) {
    parts.push(`{ ${Array.from(namedImports).sort().join(', ')} }`);
  }
  
  return parts.join(', ');
}

/**
 * Merge CommonJS require import clauses
 * 
 * @param {string[]} importClauses - Array of import clauses
 * @returns {string} - Merged import clause
 */
function mergeRequireImports(importClauses) {
  // Simple imports (e.g., "React")
  const simpleImports = new Set();
  
  // Destructured imports (e.g., "{ Component, useState }")
  const destructuredImports = new Set();
  
  // Process each import clause
  for (const clause of importClauses) {
    // Destructured import
    const destructuredMatch = clause.match(/{([^}]*)}/);
    if (destructuredMatch) {
      const names = destructuredMatch[1].split(',')
        .map(name => name.trim())
        .filter(name => name);
      
      names.forEach(name => destructuredImports.add(name));
      continue;
    }
    
    // Simple import
    const simpleMatch = clause.match(/^([A-Za-z0-9_$]+)$/);
    if (simpleMatch) {
      simpleImports.add(simpleMatch[1]);
    }
  }
  
  // Build the merged import clause
  const parts = [];
  
  // Add simple import
  if (simpleImports.size > 0) {
    // If there are multiple simple imports, use the first one and log a warning
    if (simpleImports.size > 1) {
      logger.warn(`Multiple simple imports found: ${Array.from(simpleImports).join(', ')}. Using ${Array.from(simpleImports)[0]}`);
    }
    parts.push(Array.from(simpleImports)[0]);
  }
  
  // Add destructured imports
  if (destructuredImports.size > 0) {
    parts.push(`{ ${Array.from(destructuredImports).sort().join(', ')} }`);
  }
  
  return parts.join(', ');
}

/**
 * Find the line number for a position in a string
 * 
 * @param {string} content - The content to search
 * @param {number} position - The position in the content
 * @returns {number} - The line number (0-based)
 */
function findLineForPosition(content, position) {
  let line = 0;
  let pos = 0;
  
  while (pos < position && pos < content.length) {
    if (content[pos] === '\n') {
      line++;
    }
    pos++;
  }
  
  return line;
}

/**
 * Escape special characters in a string for use in a regular expression
 * 
 * @param {string} string - The string to escape
 * @returns {string} - The escaped string
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Fix duplicate imports in multiple files
 * 
 * @param {Array} files - Array of file paths to fix
 * @param {boolean} [dryRun=false] - Whether to perform a dry run without modifying files
 * @param {boolean} [verbose=false] - Whether to log verbose output
 * @returns {Promise<Object>} - Result of the fix operation
 */
export async function fixDuplicateImportsInFiles(files, dryRun = false, verbose = false) {
  const results = {
    total: files.length,
    processed: 0,
    fixed: 0,
    failed: 0,
    skipped: 0,
    details: []
  };
  
  for (const file of files) {
    try {
      const result = await fixDuplicateImports(file, dryRun, verbose);
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
 * Find and fix duplicate imports in a project
 * 
 * @param {Object} options - Options for fixing duplicate imports
 * @param {string|string[]} options.targetDirs - Directories to scan for TypeScript files
 * @param {boolean} [options.includeTestFiles=false] - Whether to include test files
 * @param {string[]} [options.extensions=['.ts', '.tsx']] - File extensions to check
 * @param {boolean} [options.dryRun=false] - Whether to perform a dry run without modifying files
 * @param {boolean} [options.verbose=false] - Whether to log verbose output
 * @returns {Promise<Object>} - Result of the operation
 */
export async function findAndFixDuplicateImports(options) {
  const {
    targetDirs,
    includeTestFiles = false,
    extensions = ['.ts', '.tsx'],
    dryRun = false,
    verbose = false
  } = options;
  
  logger.info(`Searching for files with duplicate imports...`);
  
  const filesWithDuplicates = await findFilesWithDuplicateImports({
    targetDirs,
    includeTestFiles,
    extensions,
    verbose
  });
  
  if (filesWithDuplicates.length === 0) {
    logger.info('No files with duplicate imports found.');
    return {
      total: 0,
      fixed: 0,
      failed: 0,
      skipped: 0,
      details: []
    };
  }
  
  logger.info(`Found ${filesWithDuplicates.length} files with duplicate imports.`);
  
  if (verbose) {
    for (const { file, duplicates } of filesWithDuplicates) {
      logger.info(`${file}:`);
      for (const { moduleName, lines } of duplicates) {
        logger.info(`  '${moduleName}' imported ${lines.length} times`);
        for (const { lineNumber, content } of lines) {
          logger.info(`    Line ${lineNumber}: ${content.trim()}`);
        }
      }
    }
  }
  
  if (dryRun) {
    logger.info('Dry run: not fixing files.');
    return {
      total: filesWithDuplicates.length,
      fixed: 0,
      failed: 0,
      skipped: filesWithDuplicates.length,
      details: filesWithDuplicates.map(({ file }) => ({
        file,
        fixed: false,
        message: 'Dry run: not fixed'
      }))
    };
  }
  
  logger.info(`Fixing duplicate imports in ${filesWithDuplicates.length} files...`);
  
  const results = await fixDuplicateImportsInFiles(
    filesWithDuplicates.map(({ file }) => file),
    false,
    verbose
  );
  
  logger.info(`Fixed duplicate imports in ${results.fixed} files.`);
  
  return results;
} 