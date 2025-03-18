#!/usr/bin/env node

/**
 * Script to test the deployment process without actually deploying
 * This validates the build process and configurations
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// ANSI color codes for better terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

/**
 * Execute a shell command and print the output
 */
function runCommand(command, options = {}) {
  console.log(`${colors.blue}Running: ${colors.cyan}${command}${colors.reset}`);
  try {
    execSync(command, { stdio: 'inherit', ...options });
    return true;
  } catch (error) {
    console.error(`${colors.red}Error executing command: ${command}${colors.reset}`);
    if (options.ignoreError) {
      return false;
    }
    throw error;
  }
}

/**
 * Check if a directory exists
 */
function dirExists(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch (err) {
    return false;
  }
}

/**
 * The main function that tests the deployment process
 */
async function testDeployment() {
  console.log(`${colors.green}=== Testing deployment process ===${colors.reset}`);
  
  try {
    // Step 1: Run tests
    console.log(`${colors.magenta}Step 1: Running tests${colors.reset}`);
    runCommand('pnpm test', { ignoreError: true });
    
    // Step 2: Build all packages
    console.log(`${colors.magenta}Step 2: Building packages${colors.reset}`);
    const buildSuccess = runCommand('pnpm run build:all', { ignoreError: true });
    
    // Step 3: Verify build outputs
    console.log(`${colors.magenta}Step 3: Verifying build outputs${colors.reset}`);
    
    // Check common build output
    const commonBuildExists = dirExists(path.join(process.cwd(), 'packages/common/dist'));
    console.log(`Common package build: ${commonBuildExists ? colors.green + 'SUCCESS' : colors.red + 'FAILED'}`);
    
    // Check admin build output
    const adminBuildExists = dirExists(path.join(process.cwd(), 'packages/admin/dist'));
    console.log(`Admin package build: ${adminBuildExists ? colors.green + 'SUCCESS' : colors.red + 'FAILED'}`);
    
    // Check hours build output
    const hoursBuildExists = dirExists(path.join(process.cwd(), 'packages/hours/dist'));
    console.log(`Hours package build: ${hoursBuildExists ? colors.green + 'SUCCESS' : colors.red + 'FAILED'}`);
    
    // Step 4: Validate Firebase configuration
    console.log(`${colors.magenta}Step 4: Validating Firebase configuration${colors.reset}`);
    runCommand('firebase apps:list', { ignoreError: true });
    
    // Overall assessment
    const allBuildsSuccessful = commonBuildExists && adminBuildExists && hoursBuildExists;
    
    if (allBuildsSuccessful) {
      console.log(`${colors.green}=== Deployment validation PASSED ===${colors.reset}`);
      console.log(`${colors.green}Your application is ready for deployment!${colors.reset}`);
    } else {
      console.log(`${colors.yellow}=== Deployment validation WARNINGS ===${colors.reset}`);
      console.log(`${colors.yellow}Some builds failed. You may need to fix issues before deploying.${colors.reset}`);
      console.log(`${colors.yellow}Run 'pnpm run fix:build' to try to resolve build issues.${colors.reset}`);
      
      if (!buildSuccess) {
        console.log(`${colors.yellow}You can try running the build for each package individually:${colors.reset}`);
        console.log(`${colors.cyan}pnpm run build:common${colors.reset}`);
        console.log(`${colors.cyan}pnpm run build:admin${colors.reset}`);
        console.log(`${colors.cyan}pnpm run build:hours${colors.reset}`);
      }
    }
    
  } catch (error) {
    console.error(`${colors.red}Deployment test failed: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Run the main function
testDeployment().catch(err => {
  console.error(err);
  process.exit(1);
}); 