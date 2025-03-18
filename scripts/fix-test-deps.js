#!/usr/bin/env node

/**
 * Fix Test Dependencies Script
 * 
 * This script ensures that React and its JSX runtime are properly installed
 * and available for testing. It addresses the issue with missing jsx-runtime.js.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ANSI color codes for better terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

console.log(`${colors.bright}${colors.cyan}=== Fix Test Dependencies Script ===${colors.reset}`);

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

/**
 * Run a command and return its result
 */
function runCommand(command, options = {}) {
  console.log(`${colors.blue}Running: ${command}${colors.reset}`);
  try {
    const result = execSync(command, {
      encoding: 'utf8',
      stdio: 'pipe',
      ...options,
    });
    return { success: true, result };
  } catch (error) {
    console.error(`${colors.red}Error executing command: ${command}${colors.reset}`);
    console.error(`${colors.dim}${error.message}${colors.reset}`);
    return { success: false, error };
  }
}

/**
 * Check if React and its JSX runtime are properly installed
 */
function checkReactJsxRuntime() {
  const jsxRuntimePath = path.join(rootDir, 'node_modules', 'react', 'jsx-runtime.js');
  
  if (!fs.existsSync(jsxRuntimePath)) {
    console.log(`${colors.yellow}React JSX runtime not found at ${jsxRuntimePath}${colors.reset}`);
    return false;
  }
  
  return true;
}

/**
 * Fix React JSX runtime
 */
function fixReactJsxRuntime() {
  console.log(`${colors.yellow}Reinstalling React to ensure JSX runtime is available...${colors.reset}`);
  
  // First, check if pnpm is available
  const useYarn = !runCommand('which pnpm', { stdio: 'ignore' }).success;
  const packageManager = useYarn ? 'yarn' : 'pnpm';
  
  // Clean React installation
  runCommand(`${packageManager} remove react react-dom`, { cwd: rootDir });
  runCommand(`${packageManager} install react react-dom`, { cwd: rootDir });
  
  // Force package resolution
  runCommand(`${packageManager} ${useYarn ? 'install' : 'install --force'}`, { cwd: rootDir });
  
  // Check if it worked
  if (checkReactJsxRuntime()) {
    console.log(`${colors.green}Successfully fixed React JSX runtime${colors.reset}`);
    return true;
  } else {
    console.log(`${colors.red}Failed to fix React JSX runtime${colors.reset}`);
    
    // Create a symlink or copy as a fallback
    try {
      const reactDir = path.join(rootDir, 'node_modules', 'react');
      const jsxDevRuntimePath = path.join(reactDir, 'jsx-dev-runtime.js');
      const jsxRuntimePath = path.join(reactDir, 'jsx-runtime.js');
      
      if (fs.existsSync(jsxDevRuntimePath) && !fs.existsSync(jsxRuntimePath)) {
        console.log(`${colors.yellow}Creating JSX runtime from JSX dev runtime...${colors.reset}`);
        fs.copyFileSync(jsxDevRuntimePath, jsxRuntimePath);
        
        // Also copy the .js.map if it exists
        const jsxDevRuntimeMapPath = path.join(reactDir, 'jsx-dev-runtime.js.map');
        const jsxRuntimeMapPath = path.join(reactDir, 'jsx-runtime.js.map');
        
        if (fs.existsSync(jsxDevRuntimeMapPath)) {
          fs.copyFileSync(jsxDevRuntimeMapPath, jsxRuntimeMapPath);
        }
        
        return true;
      }
    } catch (error) {
      console.error(`${colors.red}Error creating JSX runtime:${colors.reset}`, error.message);
    }
    
    return false;
  }
}

// Main execution
try {
  console.log(`${colors.yellow}Checking for React JSX runtime...${colors.reset}`);
  
  if (!checkReactJsxRuntime()) {
    const fixed = fixReactJsxRuntime();
    
    if (!fixed) {
      console.log(`${colors.red}Could not fix React JSX runtime automatically.${colors.reset}`);
      console.log(`${colors.yellow}Try running the following commands manually:${colors.reset}`);
      console.log(`${colors.bright}pnpm install react react-dom --force${colors.reset}`);
      process.exit(1);
    }
  } else {
    console.log(`${colors.green}React JSX runtime is already available.${colors.reset}`);
  }
  
  console.log(`${colors.bright}${colors.green}Test dependencies fixed successfully!${colors.reset}`);
} catch (error) {
  console.error(`${colors.red}Error fixing test dependencies:${colors.reset}`, error.message);
  process.exit(1);
} 