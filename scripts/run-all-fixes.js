#!/usr/bin/env node

/**
 * Master script that runs all fix scripts in sequence
 * This automates the process of applying fixes across the project
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
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
  title: (msg) => console.log(`\n${colors.magenta}${msg}${colors.reset}\n` + '='.repeat(msg.length) + '\n'),
};

// Run command and handle errors
function runCommand(command, options = {}) {
  log.info(`Running: ${command}`);
  try {
    execSync(command, { 
      stdio: 'inherit',
      ...options 
    });
    return true;
  } catch (error) {
    log.error(`Command failed: ${command}`);
    log.error(error.message);
    return false;
  }
}

// Make scripts executable
function makeExecutable(scriptPath) {
  try {
    fs.chmodSync(scriptPath, '755');
    log.success(`Made ${scriptPath} executable`);
  } catch (error) {
    log.error(`Failed to make ${scriptPath} executable: ${error.message}`);
  }
}

// Main function
async function main() {
  log.title('TIME TRACKING PROJECT - MODERNIZATION FIXES');
  
  // Ensure scripts are executable
  const scripts = [
    'scripts/fix-query-types.js',
    'scripts/fix-dependencies.js',
    'scripts/fix-jest-dom.js'
  ];
  
  scripts.forEach(script => {
    if (fs.existsSync(script)) {
      makeExecutable(script);
    } else {
      log.warning(`Script not found: ${script}`);
    }
  });
  
  // Step 1: Install dependencies
  log.title('Step 1: Installing Dependencies');
  runCommand('pnpm install');
  
  // Step 2: Fix Jest-DOM issues
  log.title('Step 2: Fixing Jest-DOM');
  runCommand('node scripts/fix-jest-dom.js');
  
  // Step 3: Run React Query type fixes
  log.title('Step 3: Fixing React Query Types');
  runCommand('node scripts/fix-query-types.js');
  
  // Step 4: Fix ESLint configuration
  log.title('Step 4: Linting and Type Checking');
  runCommand('pnpm exec eslint --fix "packages/**/src/**/*.{ts,tsx}"', { stdio: 'pipe' });
  runCommand('pnpm exec tsc --noEmit');
  
  // Step 5: Run tests
  log.title('Step 5: Running Tests');
  runCommand('pnpm test', { stdio: 'pipe' });
  
  log.title('MODERNIZATION COMPLETE');
  log.info('All fixes have been applied to the project.');
  log.info('Next steps:');
  log.info('1. Review any remaining TypeScript errors');
  log.info('2. Update components using modern React patterns');
  log.info('3. Verify the application builds correctly');
  log.info('4. Run a comprehensive test suite');
}

// Run the main function
main().catch(error => {
  log.error('An error occurred during the fix process:');
  log.error(error.message);
  process.exit(1);
}); 