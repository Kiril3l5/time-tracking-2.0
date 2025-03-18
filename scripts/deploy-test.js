#!/usr/bin/env node

/**
 * Test deployment script
 * 
 * This script creates a Firebase preview deployment for testing.
 * It only deploys if the build succeeds, allowing you to validate 
 * your changes before deploying to production.
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

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

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log(`${colors.cyan}${colors.bold}=== Starting test deployment process ===${colors.reset}`);

/**
 * Run a command and handle errors
 * @param {string} command - The command to execute
 * @param {string} description - Description of the command for logging
 * @returns {boolean} - Whether the command was successful
 */
function runCommand(command, description) {
  console.log(`${colors.blue}Running: ${command}${colors.reset}`);
  
  try {
    execSync(command, { 
      cwd: rootDir,
      stdio: 'inherit'
    });
    return true;
  } catch (error) {
    console.error(`${colors.red}Error executing command: ${command}${colors.reset}`);
    return false;
  }
}

/**
 * Run the deployment process
 */
function deploy() {
  // Step 1: Build all packages
  console.log(`${colors.bold}Step 1: Building all packages${colors.reset}`);
  const buildSuccess = runCommand('pnpm run build:all');
  
  if (!buildSuccess) {
    console.error(`${colors.red}${colors.bold}Build failed. Deployment aborted.${colors.reset}`);
    console.error(`${colors.yellow}Fix build errors before attempting deployment.${colors.reset}`);
    process.exit(1);
  }
  
  // Step 2: Deploy to Firebase preview channels
  console.log(`${colors.bold}Step 2: Deploying to Firebase preview channels${colors.reset}`);
  
  // Generate unique channel name based on timestamp
  const timestamp = new Date().getTime();
  const adminChannelName = `admin-preview-${timestamp}`;
  const hoursChannelName = `hours-preview-${timestamp}`;
  
  // Deploy admin app to preview channel
  console.log(`${colors.bold}Deploying admin app to preview channel: ${adminChannelName}${colors.reset}`);
  const adminDeploySuccess = runCommand(
    `firebase hosting:channel:deploy ${adminChannelName} --only hosting:admin`
  );
  
  // Deploy hours app to preview channel
  console.log(`${colors.bold}Deploying hours app to preview channel: ${hoursChannelName}${colors.reset}`);
  const hoursDeploySuccess = runCommand(
    `firebase hosting:channel:deploy ${hoursChannelName} --only hosting:hours`
  );
  
  if (adminDeploySuccess && hoursDeploySuccess) {
    console.log(`${colors.green}${colors.bold}=== Deployment completed successfully! ===${colors.reset}`);
    console.log(`${colors.green}Preview URLs should be available in the Firebase output above.${colors.reset}`);
    console.log(`${colors.yellow}These preview channels will expire automatically after 7 days.${colors.reset}`);
    console.log(`${colors.blue}To view all active preview channels:${colors.reset}`);
    console.log(`${colors.blue}firebase hosting:channel:list${colors.reset}`);
    return 0;
  } else {
    console.error(`${colors.red}${colors.bold}=== Deployment encountered errors ===${colors.reset}`);
    console.error(`${colors.yellow}Please check the Firebase output for details.${colors.reset}`);
    return 1;
  }
}

// Run the deployment process
try {
  process.exit(deploy());
} catch (error) {
  console.error(`${colors.red}Unexpected error:${colors.reset}`, error);
  process.exit(1);
} 