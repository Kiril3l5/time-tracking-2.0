#!/usr/bin/env node

/**
 * Script to fix React Query type imports across the project
 * This replaces old imports with modern @tanstack/react-query imports
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Logging utilities
const log = {
  info: (msg) => console.log(`${colors.blue}INFO:${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}SUCCESS:${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}WARNING:${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}ERROR:${colors.reset} ${msg}`),
};

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

// Function to process a file
function processFile(filePath) {
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

    // Add type declarations if using React Query hooks
    if (
      content.includes('useQuery') ||
      content.includes('useMutation') ||
      content.includes('useInfiniteQuery')
    ) {
      // Check if we need to add type imports
      if (!content.includes('@tanstack/react-query-types')) {
        // Find the last import statement
        const importRegex = /import\s+[^;]+;/g;
        let lastImportIndex = -1;
        let match;
        
        while ((match = importRegex.exec(content)) !== null) {
          lastImportIndex = match.index + match[0].length;
        }
        
        if (lastImportIndex !== -1) {
          // Add type import after the last import
          const typeImport = "\nimport type { QueryKey, QueryFunction } from '@tanstack/react-query';";
          content = content.slice(0, lastImportIndex) + typeImport + content.slice(lastImportIndex);
          modified = true;
        }
      }
    }

    // If the file was modified, write it back
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      log.success(`Updated React Query imports in ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    log.error(`Failed to process ${filePath}: ${error.message}`);
    return false;
  }
}

// Function to find all TypeScript/JavaScript files in a directory
function findTsFiles(dir, fileList = []) {
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
}

// Main function
function main() {
  log.info('Starting React Query type fixing...');
  
  // Get all TypeScript/JavaScript files in the packages directory
  const packagesDirs = ['packages/admin/src', 'packages/common/src', 'packages/hours/src'];
  let allFiles = [];
  
  packagesDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      const files = findTsFiles(dir);
      allFiles = [...allFiles, ...files];
    } else {
      log.warning(`Directory does not exist: ${dir}`);
    }
  });
  
  log.info(`Found ${allFiles.length} files to process`);
  
  // Process each file
  let modifiedCount = 0;
  allFiles.forEach(file => {
    if (processFile(file)) {
      modifiedCount++;
    }
  });
  
  log.success(`Fixed React Query imports in ${modifiedCount} files`);
  
  // Create type definition file if it doesn't exist
  const typeDefDir = 'types';
  const typeDefFile = path.join(typeDefDir, 'react-query.d.ts');
  
  if (!fs.existsSync(typeDefDir)) {
    fs.mkdirSync(typeDefDir, { recursive: true });
  }
  
  if (!fs.existsSync(typeDefFile)) {
    const typeDefContent = `// Type definitions for @tanstack/react-query
declare module '@tanstack/react-query' {
  export * from '@tanstack/react-query';
}
`;
    fs.writeFileSync(typeDefFile, typeDefContent, 'utf8');
    log.success(`Created type definition file: ${typeDefFile}`);
  }

  log.info('React Query type fixing complete');
}

// Run the main function
main(); 