#!/usr/bin/env node

/**
 * Preview Check Script
 * 
 * This script runs all the necessary checks locally first,
 * and if they all pass, triggers a Firebase preview deployment,
 * allowing you to fully validate your changes before pushing to GitHub.
 * 
 * Workflow:
 * 1. Run all local checks (cleanup, eslint, typescript, tests)
 * 2. If all checks pass, deploy to Firebase preview channels
 * 3. Open preview URLs to validate changes visually
 * 4. If everything looks good, push to Git (done manually)
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bold: '\x1b[1m'
};

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

/**
 * Run a command and return its output
 * @param {string} command - The command to execute
 * @param {Object} options - Options for execSync
 * @returns {Object} - Result object with success flag and output
 */
function runCommand(command, options = {}) {
  console.log(`${colors.blue}> ${command}${colors.reset}`);
  try {
    const defaultOptions = { 
      cwd: rootDir, 
      stdio: 'pipe',
      encoding: 'utf8'
    };
    const output = execSync(command, { ...defaultOptions, ...options });
    return { success: true, output };
  } catch (error) {
    return { 
      success: false, 
      output: error.stdout?.toString() || '', 
      error: error.stderr?.toString() || error.message 
    };
  }
}

/**
 * Print section header
 * @param {string} title - The section title
 */
function printSection(title) {
  const line = '='.repeat(title.length + 8);
  console.log(`\n${colors.cyan}${line}${colors.reset}`);
  console.log(`${colors.cyan}=== ${colors.bold}${title}${colors.reset}${colors.cyan} ===${colors.reset}`);
  console.log(`${colors.cyan}${line}${colors.reset}\n`);
}

/**
 * Ensure cleanup.js is using ES module syntax
 */
function fixCleanupScript() {
  printSection('Fixing Module Syntax');
  
  // Run the ci-cleanup-fix script
  const result = runCommand('node scripts/ci-cleanup-fix.js');
  
  if (result.success) {
    console.log(`${colors.green}✓ Cleanup script syntax check completed${colors.reset}`);
    return true;
  } else {
    console.error(`${colors.red}✗ Failed to fix cleanup script:${colors.reset}`);
    console.error(result.error || result.output);
    return false;
  }
}

/**
 * Run ESLint checks
 */
function runLinting() {
  printSection('Running ESLint');
  
  const result = runCommand('pnpm run lint');
  
  if (result.success) {
    console.log(`${colors.green}✓ Linting passed${colors.reset}`);
    return true;
  } else {
    console.error(`${colors.red}✗ Linting failed:${colors.reset}`);
    console.log(result.output);
    console.error(result.error || '');
    return false;
  }
}

/**
 * Run TypeScript type checking
 */
function runTypeCheck() {
  printSection('Running TypeScript Type Check');
  
  const result = runCommand('pnpm exec tsc --noEmit');
  
  if (result.success) {
    console.log(`${colors.green}✓ TypeScript type checking passed${colors.reset}`);
    return true;
  } else {
    console.error(`${colors.red}✗ TypeScript type checking failed:${colors.reset}`);
    console.log(result.output);
    console.error(result.error || '');
    return false;
  }
}

/**
 * Run unit tests
 */
function runTests() {
  printSection('Running Unit Tests');
  
  const result = runCommand('pnpm run test');
  
  if (result.success) {
    console.log(`${colors.green}✓ Tests passed${colors.reset}`);
    return true;
  } else {
    console.error(`${colors.red}✗ Tests failed:${colors.reset}`);
    console.log(result.output);
    console.error(result.error || '');
    return false;
  }
}

/**
 * Deploy to Firebase preview channels
 */
function deployPreview() {
  printSection('Deploying Preview');
  
  console.log(`${colors.yellow}Deploying to Firebase preview channels...${colors.reset}`);
  
  // Run the deploy-test.js script
  try {
    execSync('node scripts/deploy-test.js', { 
      cwd: rootDir, 
      stdio: 'inherit'
    });
    console.log(`${colors.green}✓ Preview deployment completed${colors.reset}`);
    return true;
  } catch (error) {
    console.error(`${colors.red}✗ Preview deployment failed${colors.reset}`);
    return false;
  }
}

/**
 * Run all checks and preview deployment
 */
function runAllChecks() {
  printSection('PREVIEW WORKFLOW');
  console.log(`${colors.yellow}Running verification checks before deployment${colors.reset}\n`);
  
  // Results object to track success/failure of each step
  const results = {
    cleanup: false,
    linting: false,
    typecheck: false,
    tests: false,
    preview: false
  };
  
  // Step 1: Fix cleanup script
  results.cleanup = fixCleanupScript();
  
  // Step 2: Run linting
  results.linting = runLinting();
  
  // Step 3: Run TypeScript type checking
  results.typecheck = runTypeCheck();
  
  // Step 4: Run tests
  results.tests = runTests();
  
  // Check if all verification steps passed
  const allVerificationPassed = results.cleanup && 
                                results.linting && 
                                results.typecheck && 
                                results.tests;
  
  // Step 5: Deploy preview if all checks passed
  if (allVerificationPassed) {
    console.log(`${colors.green}${colors.bold}All checks passed! Proceeding with preview deployment...${colors.reset}`);
    results.preview = deployPreview();
  } else {
    console.log(`${colors.red}${colors.bold}Some checks failed. Preview deployment skipped.${colors.reset}`);
    results.preview = false;
  }
  
  // Summary
  printSection('SUMMARY');
  console.log(`${colors.bold}Cleanup script fix:${colors.reset} ${results.cleanup ? `${colors.green}PASS` : `${colors.red}FAIL`}${colors.reset}`);
  console.log(`${colors.bold}Linting:${colors.reset} ${results.linting ? `${colors.green}PASS` : `${colors.red}FAIL`}${colors.reset}`);
  console.log(`${colors.bold}TypeScript check:${colors.reset} ${results.typecheck ? `${colors.green}PASS` : `${colors.red}FAIL`}${colors.reset}`);
  console.log(`${colors.bold}Tests:${colors.reset} ${results.tests ? `${colors.green}PASS` : `${colors.red}FAIL`}${colors.reset}`);
  console.log(`${colors.bold}Preview deployment:${colors.reset} ${results.preview ? `${colors.green}COMPLETE` : `${colors.red}SKIPPED`}${colors.reset}`);
  
  const allCompleted = Object.values(results).every(r => r);
  
  if (allCompleted) {
    console.log(`\n${colors.green}${colors.bold}✓ Complete workflow executed successfully!${colors.reset}`);
    console.log(`${colors.green}1. All checks passed${colors.reset}`);
    console.log(`${colors.green}2. Preview deployment complete${colors.reset}`);
    console.log(`${colors.green}3. You can now test the preview URLs above${colors.reset}`);
    console.log(`\n${colors.bold}Next steps:${colors.reset}`);
    console.log(`${colors.blue}1. Validate your changes in the preview URLs${colors.reset}`);
    console.log(`${colors.blue}2. When satisfied, commit and push to GitHub:${colors.reset}`);
    console.log(`   ${colors.cyan}git add .${colors.reset}`);
    console.log(`   ${colors.cyan}git commit -m "Your commit message"${colors.reset}`);
    console.log(`   ${colors.cyan}git push${colors.reset}`);
    return 0;
  } else {
    console.log(`\n${colors.red}${colors.bold}✗ Workflow did not complete successfully.${colors.reset}`);
    console.log(`${colors.yellow}Fix the failed checks before pushing to GitHub.${colors.reset}`);
    return 1;
  }
}

// Exit with the appropriate code
process.exit(runAllChecks()); 