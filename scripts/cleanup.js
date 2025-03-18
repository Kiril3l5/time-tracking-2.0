#!/usr/bin/env node

/**
 * Cleanup script to remove temporary files and build artifacts
 */

import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

console.log(`${colors.cyan}${colors.bold}=== Project Cleanup ====${colors.reset}`);

/**
 * Run a command safely with error handling
 * @param {string} command - The command to execute
 * @param {boolean} silent - Whether to suppress output
 * @returns {boolean} - Whether the command was successful
 */
function runCommand(command, silent = false) {
  try {
    if (!silent) {
      console.log(`${colors.blue}> ${command}${colors.reset}`);
    }
    execSync(command, { 
      cwd: rootDir,
      stdio: silent ? 'ignore' : 'inherit'
    });
    return true;
  } catch (error) {
    if (!silent) {
      console.error(`${colors.red}Error executing: ${command}${colors.reset}`);
      console.error(error.message);
    }
    return false;
  }
}

/**
 * Remove a directory if it exists
 * @param {string} dirPath - Path to directory
 */
function removeDirectoryIfExists(dirPath) {
  const absolutePath = path.isAbsolute(dirPath) 
    ? dirPath 
    : path.join(rootDir, dirPath);
    
  if (fs.existsSync(absolutePath)) {
    console.log(`${colors.yellow}Removing directory: ${dirPath}${colors.reset}`);
    
    try {
      if (os.platform() === 'win32') {
        // Windows requires a different approach for nested directories
        runCommand(`rmdir /s /q "${absolutePath}"`, true);
      } else {
        // Unix-based systems
        runCommand(`rm -rf "${absolutePath}"`, true);
      }
      console.log(`${colors.green}✓ Removed${colors.reset}`);
    } catch (error) {
      console.error(`${colors.red}Failed to remove ${dirPath}: ${error.message}${colors.reset}`);
    }
  }
}

/**
 * Remove a file if it exists
 * @param {string} filePath - Path to file
 */
function removeFileIfExists(filePath) {
  const absolutePath = path.isAbsolute(filePath) 
    ? filePath 
    : path.join(rootDir, filePath);
    
  if (fs.existsSync(absolutePath)) {
    console.log(`${colors.yellow}Removing file: ${filePath}${colors.reset}`);
    
    try {
      fs.unlinkSync(absolutePath);
      console.log(`${colors.green}✓ Removed${colors.reset}`);
    } catch (error) {
      console.error(`${colors.red}Failed to remove ${filePath}: ${error.message}${colors.reset}`);
    }
  }
}

// List of directories to remove
const directoriesToRemove = [
  'node_modules',
  'packages/admin/node_modules',
  'packages/hours/node_modules', 
  'packages/common/node_modules',
  'packages/admin/dist',
  'packages/hours/dist',
  'packages/common/dist',
  'coverage',
  '.firebase'
];

// List of files to remove
const filesToRemove = [
  'firebase-debug.log',
  'ui-debug.log',
  'firestore-debug.log',
  'packages/admin/.firebase/hosting.*.cache',
  'packages/hours/.firebase/hosting.*.cache'
];

// Clean directories
console.log(`${colors.bold}Cleaning directories...${colors.reset}`);
directoriesToRemove.forEach(dir => {
  removeDirectoryIfExists(dir);
});

// Clean files
console.log(`\n${colors.bold}Cleaning files...${colors.reset}`);
filesToRemove.forEach(file => {
  // Handle glob patterns
  if (file.includes('*')) {
    const dirPath = path.dirname(file);
    const pattern = path.basename(file);
    const absoluteDirPath = path.isAbsolute(dirPath) 
      ? dirPath 
      : path.join(rootDir, dirPath);
      
    if (fs.existsSync(absoluteDirPath)) {
      const files = fs.readdirSync(absoluteDirPath);
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      
      files.forEach(f => {
        if (regex.test(f)) {
          removeFileIfExists(path.join(dirPath, f));
        }
      });
    }
  } else {
    removeFileIfExists(file);
  }
});

// Clear cache
console.log(`\n${colors.bold}Clearing package manager cache...${colors.reset}`);
runCommand('pnpm store prune', true);

console.log(`\n${colors.green}${colors.bold}Cleanup completed!${colors.reset}`); 