#!/usr/bin/env node

/**
 * TypeScript Error Parser Module
 * 
 * Provides utilities for parsing TypeScript error messages across different platforms,
 * categorizing errors, and providing structured error data.
 * 
 * Features:
 * - Parse TypeScript compiler error outputs with cross-platform support
 * - Categorize errors by type (syntax, type mismatch, etc.)
 * - Extract file paths, line numbers, and error details
 * - Normalize paths for consistent handling across OS platforms
 * 
 * @module typescript/error-parser
 */

import * as path from 'path';
import * as logger from '../core/logger.js';

/* global process */

/**
 * Parse TypeScript errors from command output
 * 
 * @param {string} output - Command output from tsc
 * @param {Object} [options] - Parser options
 * @param {boolean} [options.normalizePaths=true] - Whether to normalize file paths
 * @param {boolean} [options.extractSnippets=false] - Whether to extract code snippets
 * @returns {Array} - Parsed errors
 */
export function parseTypeScriptErrors(output, options = {}) {
  const {
    normalizePaths = true,
    extractSnippets = false
  } = options;
  
  const errors = [];
  
  // Handle empty output
  if (!output || output.trim() === '') {
    return errors;
  }
  
  // Regex patterns for different error formats
  // Standard format: file(line,col): error TS1234: message
  const standardErrorRegex = /^(.+)\((\d+),(\d+)\): error (TS\d+): (.+)$/gm;
  
  // Alternative format (sometimes seen in different tsc versions): file:line:col - error TS1234: message
  const alternativeErrorRegex = /^(.+):(\d+):(\d+) - error (TS\d+): (.+)$/gm;
  
  // Parse standard format errors
  let match;
  while ((match = standardErrorRegex.exec(output)) !== null) {
    const [_, filePath, line, column, code, message] = match;
    
    errors.push({
      file: normalizePaths ? normalizePath(filePath) : filePath,
      line: parseInt(line, 10),
      column: parseInt(column, 10),
      code,
      message,
      category: categorizeTypeError(code, message),
      severity: 'error'
    });
  }
  
  // Parse alternative format errors
  while ((match = alternativeErrorRegex.exec(output)) !== null) {
    const [_, filePath, line, column, code, message] = match;
    
    errors.push({
      file: normalizePaths ? normalizePath(filePath) : filePath,
      line: parseInt(line, 10),
      column: parseInt(column, 10),
      code,
      message,
      category: categorizeTypeError(code, message),
      severity: 'error'
    });
  }
  
  // Extract code snippets if requested
  if (extractSnippets) {
    try {
      extractErrorSnippets(errors, output);
    } catch (err) {
      logger.debug(`Failed to extract error snippets: ${err.message}`);
    }
  }
  
  // Sort errors by file, then by line, then by column
  errors.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });
  
  return errors;
}

/**
 * Normalize file path for consistent cross-platform handling
 * 
 * @param {string} filePath - File path to normalize
 * @returns {string} - Normalized path
 */
function normalizePath(filePath) {
  // Convert backslashes to forward slashes for cross-platform consistency
  let normalized = filePath.replace(/\\/g, '/');
  
  // Remove any drive letter prefix on Windows (e.g., C:/)
  normalized = normalized.replace(/^[A-Z]:\//i, '');
  
  return normalized;
}

/**
 * Extract code snippets from tsc output if available
 * 
 * @param {Array} errors - Parsed errors (will be modified in-place)
 * @param {string} output - Full tsc output
 */
function extractErrorSnippets(errors, output) {
  // Some versions of tsc include code snippets in the output
  // We'll try to extract them and attach to the corresponding errors
  
  // Split output by lines
  const lines = output.split('\n');
  
  for (const error of errors) {
    // Look for the error in the output
    const errorIndex = lines.findIndex(line => 
      line.includes(`${error.file}(${error.line},${error.column})`) || 
      line.includes(`${error.file}:${error.line}:${error.column}`)
    );
    
    if (errorIndex >= 0 && errorIndex < lines.length - 2) {
      // The snippet usually follows the error message
      // and consists of a line of code and a line with a caret (^) indicating the error position
      const potentialSnippet = lines[errorIndex + 1];
      const potentialCaret = lines[errorIndex + 2];
      
      if (potentialCaret.includes('^')) {
        error.snippet = potentialSnippet.trim();
        error.caretPosition = potentialCaret.indexOf('^');
      }
    }
  }
}

/**
 * Categorize TypeScript errors
 * 
 * @param {string} code - Error code (e.g., TS2322)
 * @param {string} message - Error message
 * @returns {string} - Error category
 */
export function categorizeTypeError(code, message) {
  // Common error categories based on code and message patterns
  if (code === 'TS2322' || code === 'TS2345') {
    return 'type-mismatch';
  }
  
  if (code === 'TS2531' || code === 'TS2532' || code === 'TS2533' || 
      message.includes('undefined') || message.includes('null')) {
    return 'null-undefined';
  }
  
  if (code === 'TS2551' || code === 'TS2339') {
    return 'missing-property';
  }
  
  if (code === 'TS2304') {
    return 'unknown-identifier';
  }
  
  if (code === 'TS1005' || code === 'TS1128') {
    return 'syntax-error';
  }
  
  if (code === 'TS2307' || message.includes('import') || message.includes('export')) {
    return 'import-export';
  }
  
  if (code === 'TS2554' || code === 'TS2555' || code === 'TS2556') {
    return 'invalid-arguments';
  }
  
  if (code === 'TS2769' || code === 'TS2559') {
    return 'function-return';
  }
  
  if (code === 'TS2366' || code === 'TS2536') {
    return 'object-property';
  }
  
  if (code === 'TS2612' || message.includes('async') || message.includes('await') || message.includes('Promise')) {
    return 'async-await';
  }
  
  return 'other';
}

/**
 * Get detailed information about a TypeScript error code
 * 
 * @param {string} code - Error code (e.g., TS2322)
 * @returns {Object} - Error code details
 */
export function getErrorCodeDetails(code) {
  // Common TypeScript error codes and their descriptions
  const errorDetails = {
    // Type system errors
    'TS2322': { 
      title: 'Type assignment error', 
      description: 'Type is not assignable to the target type',
      documentation: 'https://www.typescriptlang.org/docs/handbook/2/everyday-types.html'
    },
    'TS2345': { 
      title: 'Argument type error', 
      description: 'Argument is not assignable to parameter type',
      documentation: 'https://www.typescriptlang.org/docs/handbook/2/functions.html'
    },
    'TS2531': { 
      title: 'Object is possibly null', 
      description: 'Object might be null when accessing a property',
      documentation: 'https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#null-and-undefined'
    },
    'TS2532': { 
      title: 'Object is possibly undefined', 
      description: 'Object might be undefined when accessing a property',
      documentation: 'https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#null-and-undefined'
    },
    'TS2339': { 
      title: 'Property does not exist', 
      description: 'Property does not exist on the given type',
      documentation: 'https://www.typescriptlang.org/docs/handbook/2/objects.html'
    },
    'TS2304': { 
      title: 'Cannot find name', 
      description: 'Referenced name could not be found',
      documentation: 'https://www.typescriptlang.org/docs/handbook/modules.html'
    },
    
    // Syntax errors
    'TS1005': { 
      title: 'Syntax error', 
      description: 'Unexpected token in the code',
      documentation: 'https://www.typescriptlang.org/docs/handbook/2/basic-types.html'
    },
    
    // Import/export errors
    'TS2307': { 
      title: 'Cannot find module', 
      description: 'Module not found or path is incorrect',
      documentation: 'https://www.typescriptlang.org/docs/handbook/modules.html'
    },
    
    // Function errors
    'TS2554': { 
      title: 'Expected arguments', 
      description: 'Function called with incorrect number of arguments',
      documentation: 'https://www.typescriptlang.org/docs/handbook/2/functions.html'
    }
  };
  
  if (errorDetails[code]) {
    return {
      ...errorDetails[code],
      code
    };
  }
  
  // Default for unknown codes
  return {
    title: 'TypeScript error',
    description: 'Unknown TypeScript error code',
    code,
    documentation: 'https://www.typescriptlang.org/docs/'
  };
}

/**
 * Group errors by file, category, or code
 * 
 * @param {Array} errors - Parsed TypeScript errors
 * @param {string} groupBy - Grouping method ('file', 'category', or 'code')
 * @returns {Object} - Grouped errors
 */
export function groupErrors(errors, groupBy = 'file') {
  const grouped = {};
  
  if (!['file', 'category', 'code'].includes(groupBy)) {
    logger.warn(`Invalid groupBy value: ${groupBy}. Using 'file' instead.`);
    groupBy = 'file';
  }
  
  for (const error of errors) {
    const key = error[groupBy];
    
    if (!grouped[key]) {
      grouped[key] = [];
    }
    
    grouped[key].push(error);
  }
  
  return grouped;
}

/**
 * Count errors by category
 * 
 * @param {Array} errors - Parsed TypeScript errors
 * @returns {Object} - Error counts by category
 */
export function countErrorsByCategory(errors) {
  const counts = {};
  
  for (const error of errors) {
    const category = error.category;
    
    if (!counts[category]) {
      counts[category] = 0;
    }
    
    counts[category]++;
  }
  
  return counts;
}

/**
 * Find the most common error types
 * 
 * @param {Array} errors - Parsed TypeScript errors
 * @param {number} [limit=5] - Maximum number of errors to return
 * @returns {Array} - Most common error codes and their counts
 */
export function findMostCommonErrors(errors, limit = 5) {
  const codeCounts = {};
  
  // Count occurrences of each error code
  for (const error of errors) {
    if (!codeCounts[error.code]) {
      codeCounts[error.code] = 0;
    }
    
    codeCounts[error.code]++;
  }
  
  // Convert to array and sort by count (descending)
  const sortedCounts = Object.entries(codeCounts)
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count);
  
  // Get top errors with details
  return sortedCounts
    .slice(0, limit)
    .map(({ code, count }) => ({
      ...getErrorCodeDetails(code),
      count
    }));
} 