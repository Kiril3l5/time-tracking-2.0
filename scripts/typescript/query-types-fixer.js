#!/usr/bin/env node

/**
 * React Query Types Fixer Module
 * 
 * This module fixes React Query type imports across the project
 * by replacing old imports with modern @tanstack/react-query imports.
 * 
 * Can be used standalone or integrated into the preview workflow.
 */

import fs from 'node:fs';
import path from 'node:path';
import { cwd, process } from '../core/process-utils.js';
import { execSync } from 'child_process';
import { fileURLToPath } from 'node:url';
import * as logger from '../core/logger.js';

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

// Map of old imports to new imports
const importMappings = {
  'react-query': '@tanstack/react-query',
  'useQuery': 'useQuery',
  'useMutation': 'useMutation',
  'useInfiniteQuery': 'useInfiniteQuery',
  'useQueryClient': 'useQueryClient',
  'QueryClient': 'QueryClient',
  'QueryClientProvider': 'QueryClientProvider',
};

/**
 * Process a file to fix React Query imports
 * @param {string} filePath - Path to the file
 * @param {Object} options - Options
 * @param {boolean} options.dryRun - Whether to perform a dry run
 * @returns {boolean} Whether the file was modified
 */
function processFile(filePath, options = {}) {
  const { dryRun = false } = options;
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // Replace import from 'react-query'
    if (content.includes("from 'react-query'") || content.includes('from "react-query"')) {
      const newContent = content.replace(
        /(import\s+{[^}]+}\s+from\s+['"])react-query(['"])/g,
        `$1@tanstack/react-query$2`
      );
      
      if (newContent !== content) {
        content = newContent;
        modified = true;
      }
    }

    // More accurate check for type usage
    // Check if these types are actually being used in type annotations/signatures
    // not just mentioned somewhere in the code as string literals
    const hasQueryKeyTypeAnnotation = /:\s*QueryKey\b|\bQueryKey(\[\]|<|>|\|)/g.test(content);
    const hasQueryFunctionTypeAnnotation = /:\s*QueryFunction\b|\bQueryFunction(\[\]|<|>|\|)/g.test(content);
    
    // Check for any existing imports to avoid duplicates
    const hasExistingQueryKeyImport = content.includes("QueryKey } from '@tanstack/react-query'");
    const hasExistingQueryFunctionImport = content.includes("QueryFunction } from '@tanstack/react-query'");
    
    const needsQueryKeyType = hasQueryKeyTypeAnnotation && !hasExistingQueryKeyImport;
    const needsQueryFunctionType = hasQueryFunctionTypeAnnotation && !hasExistingQueryFunctionImport;

    // Specifically remove unused imports
    if (content.includes("import type { QueryKey") && !hasQueryKeyTypeAnnotation) {
      content = content.replace(/import type \{ QueryKey(, QueryFunction)? \} from '@tanstack\/react-query';(\r\n|\r|\n)/g, '');
      content = content.replace(/import type \{ (.*), QueryKey(, .*)? \} from '@tanstack\/react-query';(\r\n|\r|\n)/g, 'import type { $1$2 } from \'@tanstack/react-query\';$3');
      modified = true;
    }
    
    if (content.includes("import type { QueryFunction") && !hasQueryFunctionTypeAnnotation) {
      content = content.replace(/import type \{ QueryFunction(, QueryKey)? \} from '@tanstack\/react-query';(\r\n|\r|\n)/g, '');
      content = content.replace(/import type \{ (.*), QueryFunction(, .*)? \} from '@tanstack\/react-query';(\r\n|\r|\n)/g, 'import type { $1$2 } from \'@tanstack/react-query\';$3');
      modified = true;
    }
    
    if (needsQueryKeyType || needsQueryFunctionType) {
      // Find the last import statement
      const importRegex = /import\s+[^;]+;/g;
      let lastImportIndex = -1;
      let match;
      
      while ((match = importRegex.exec(content)) !== null) {
        lastImportIndex = match.index + match[0].length;
      }
      
      if (lastImportIndex !== -1) {
        // Only add types that are needed
        const typesToAdd = [];
        if (needsQueryKeyType) typesToAdd.push('QueryKey');
        if (needsQueryFunctionType) typesToAdd.push('QueryFunction');
        
        if (typesToAdd.length > 0) {
          const typeImport = `\nimport type { ${typesToAdd.join(', ')} } from '@tanstack/react-query';`;
          content = content.slice(0, lastImportIndex) + typeImport + content.slice(lastImportIndex);
          modified = true;
        }
      }
    }

    // If the file was modified, write it back
    if (modified) {
      if (!dryRun) {
        fs.writeFileSync(filePath, content, 'utf8');
      }
      logger.success(`${dryRun ? '[DRY RUN] Would update' : 'Updated'} React Query imports in ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error(`Failed to process ${filePath}: ${error.message}`);
    return false;
  }
}

/**
 * Find all TypeScript/JavaScript files in a directory
 * @param {string} dir - Directory to search
 * @param {Array} fileList - List of files (for recursion)
 * @returns {Array} List of files
 */
function findTsFiles(dir, fileList = []) {
  try {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory() && !file.startsWith('node_modules') && !file.startsWith('.')) {
        findTsFiles(filePath, fileList);
      } else if (
        stat.isFile() && 
        (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx'))
      ) {
        fileList.push(filePath);
      }
    });
    
    return fileList;
  } catch (error) {
    logger.error(`Error finding TypeScript files: ${error.message}`);
    return fileList;
  }
}

/**
 * Create type definition file
 * @param {Object} options - Options
 * @param {boolean} options.dryRun - Whether to perform a dry run
 * @returns {boolean} Whether the file was created
 */
function createTypeDefinitionFile(options = {}) {
  const { dryRun = false } = options;
  
  try {
    const typeDefDir = path.join(rootDir, 'types');
    const typeDefFile = path.join(typeDefDir, 'react-query.d.ts');
    
    if (!fs.existsSync(typeDefDir)) {
      if (!dryRun) {
        fs.mkdirSync(typeDefDir, { recursive: true });
      }
      logger.info(`${dryRun ? '[DRY RUN] Would create' : 'Created'} types directory`);
    }
    
    if (!fs.existsSync(typeDefFile) || dryRun) {
      const typeDefContent = `// Type definitions for @tanstack/react-query
declare module '@tanstack/react-query' {
  export * from '@tanstack/react-query';
}
`;
      if (!dryRun) {
        fs.writeFileSync(typeDefFile, typeDefContent, 'utf8');
      }
      logger.success(`${dryRun ? '[DRY RUN] Would create' : 'Created'} type definition file: ${typeDefFile}`);
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error(`Error creating type definition file: ${error.message}`);
    return false;
  }
}

/**
 * Fix React Query type imports
 * @param {Object} options - Options
 * @param {boolean} options.dryRun - Whether to perform a dry run
 * @param {boolean} options.verbose - Whether to log verbose output
 * @param {Array<string>} options.targetDirs - Directories to scan for TypeScript files
 * @returns {Promise<Object>} Result of the fix operation
 */
export async function fixQueryTypes(options = {}) {
  const { 
    dryRun = false, 
    verbose = false,
    targetDirs = ['packages/admin/src', 'packages/common/src', 'packages/hours/src']
  } = options;
  
  logger.sectionHeader('Fixing React Query Type Imports');
  
  try {
    // Get all TypeScript/JavaScript files in the packages directory
    let allFiles = [];
    
    targetDirs.forEach(dir => {
      const dirPath = path.resolve(rootDir, dir);
      if (fs.existsSync(dirPath)) {
        const files = findTsFiles(dirPath);
        allFiles = [...allFiles, ...files];
      } else {
        logger.warning(`Directory does not exist: ${dirPath}`);
      }
    });
    
    logger.info(`Found ${allFiles.length} files to process`);
    
    // Process each file
    let modifiedCount = 0;
    allFiles.forEach(file => {
      if (processFile(file, { dryRun })) {
        modifiedCount++;
      }
    });
    
    // Create type definition file
    const typeDefCreated = createTypeDefinitionFile({ dryRun });
    
    logger.success(`${dryRun ? '[DRY RUN] Would fix' : 'Fixed'} React Query imports in ${modifiedCount} files`);
    
    return {
      success: true,
      message: `Fixed React Query imports in ${modifiedCount} files`,
      fixesApplied: modifiedCount > 0 || typeDefCreated,
      modifiedFiles: modifiedCount,
      typeDefCreated
    };
  } catch (error) {
    logger.error(`Error fixing React Query types: ${error.message}`);
    logger.debug(error.stack);
    
    return {
      success: false,
      error: error.message,
      fixesApplied: false
    };
  }
}

// Run main function if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fixQueryTypes().then(result => {
    if (!result.success) {
      process.exit(1);
    }
  }).catch(error => {
    logger.error(`Unhandled error: ${error.message}`);
    process.exit(1);
  });
} 