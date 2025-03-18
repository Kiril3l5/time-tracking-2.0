#!/usr/bin/env node

/**
 * Script to deploy a test/preview version of the application
 */

import { execSync } from 'child_process';

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
 * The main deploy function
 */
async function deploy() {
  console.log(`${colors.green}=== Starting test deployment process ===${colors.reset}`);
  
  try {
    // Step 1: Build all packages
    console.log(`${colors.magenta}Step 1: Building packages${colors.reset}`);
    runCommand('pnpm run build:all', { ignoreError: true });
    
    // Step 2: Create empty builds if the build failed
    console.log(`${colors.magenta}Step 2: Creating empty builds if needed${colors.reset}`);
    runCommand('pnpm run create:empty-builds', { ignoreError: true });
    
    // Step 3: Deploy to Firebase hosting
    console.log(`${colors.magenta}Step 3: Deploying to Firebase hosting${colors.reset}`);
    
    // Deploy both admin and hours apps
    runCommand('firebase deploy --only hosting');
    
    console.log(`${colors.green}=== Deployment completed successfully! ===${colors.reset}`);
    
  } catch (error) {
    console.error(`${colors.red}Deployment failed: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

deploy().catch(err => {
  console.error(err);
  process.exit(1);
}); 