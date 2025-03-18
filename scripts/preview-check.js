#!/usr/bin/env node

/**
 * Preview Check Script
 * 
 * This script runs all the necessary checks before pushing to ensure the build will pass
 * It's a wrapper around the preview:all script with more detailed information and progress tracking
 */

import { execSync } from 'child_process';
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
  magenta: '\x1b[35m',
};

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Header display
console.log('\n');
console.log(`${colors.bright}${colors.magenta}==============================================${colors.reset}`);
console.log(`${colors.bright}${colors.magenta}        PRE-PUSH VALIDATION CHECKS          ${colors.reset}`);
console.log(`${colors.bright}${colors.magenta}==============================================${colors.reset}`);
console.log('\n');

// Run a command and show its output
function runCommand(command, name, options = {}) {
  console.log(`${colors.bright}${colors.cyan}▶ RUNNING: ${name}${colors.reset}`);
  console.log(`${colors.blue}$ ${command}${colors.reset}`);
  console.log(`${colors.yellow}---------------------------------------------${colors.reset}`);
  
  try {
    execSync(command, { 
      stdio: 'inherit',
      ...options
    });
    console.log(`${colors.green}✓ ${name} PASSED${colors.reset}`);
    return true;
  } catch (error) {
    console.error(`${colors.red}✗ ${name} FAILED${colors.reset}`);
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    return false;
  } finally {
    console.log(`${colors.yellow}---------------------------------------------${colors.reset}\n`);
  }
}

// Main function to run all checks
async function runChecks() {
  let success = true;
  
  // Step 1: Fix module syntax
  if (!runCommand('pnpm run fix:module-syntax', 'MODULE SYNTAX CHECK')) {
    success = false;
  }
  
  // Step 2: Fix test dependencies
  if (!runCommand('pnpm run fix:test-deps', 'TEST DEPENDENCIES CHECK')) {
    success = false;
  }
  
  // Step 3: Linting
  if (!runCommand('pnpm run lint', 'LINTING CHECK')) {
    success = false;
  }
  
  // Step 4: Type checking
  if (!runCommand('pnpm exec tsc --noEmit', 'TYPESCRIPT CHECK')) {
    success = false;
  }
  
  // Step 5: Tests 
  if (!runCommand('pnpm run test', 'UNIT TESTS')) {
    success = false;
  }
  
  // Step 6: Build common
  if (!runCommand('pnpm run build:common', 'BUILD: COMMON PACKAGE')) {
    success = false;
  }
  
  // Step 7: Build admin
  if (!runCommand('pnpm run build:admin', 'BUILD: ADMIN PACKAGE')) {
    success = false;
  }
  
  // Step 8: Build hours
  if (!runCommand('pnpm run build:hours', 'BUILD: HOURS PACKAGE')) {
    success = false;
  }
  
  // Summary
  console.log(`${colors.bright}${colors.magenta}==============================================${colors.reset}`);
  if (success) {
    console.log(`${colors.bright}${colors.green}✓ ALL CHECKS PASSED - READY TO PUSH${colors.reset}`);
    console.log(`${colors.green}You can safely push your changes to GitHub.${colors.reset}`);
  } else {
    console.log(`${colors.bright}${colors.red}✗ SOME CHECKS FAILED - NOT READY TO PUSH${colors.reset}`);
    console.log(`${colors.red}Please fix the issues before pushing to GitHub.${colors.reset}`);
    console.log(`${colors.yellow}Try running specific fix scripts:${colors.reset}`);
    console.log(`${colors.blue}- pnpm run fix:all${colors.reset} - Run all fixers`);
    console.log(`${colors.blue}- pnpm run lint:fix${colors.reset} - Fix linting issues`);
    console.log(`${colors.blue}- pnpm run fix:build${colors.reset} - Fix build issues`);
  }
  console.log(`${colors.bright}${colors.magenta}==============================================${colors.reset}`);
  
  // Exit with appropriate code
  process.exit(success ? 0 : 1);
}

// Run the checks
runChecks().catch(error => {
  console.error(`${colors.red}Unexpected error in preview check script:${colors.reset}`, error);
  process.exit(1);
}); 