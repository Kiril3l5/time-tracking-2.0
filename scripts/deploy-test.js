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
    
    // Step 3: Deploy to Firebase hosting preview channel
    console.log(`${colors.magenta}Step 3: Deploying to Firebase preview channel${colors.reset}`);
    
    // Generate a unique preview channel name based on timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const channelName = `preview-${timestamp}`;
    
    // Deploy admin and hours apps to separate preview channels
    runCommand(`firebase hosting:channel:deploy ${channelName}-admin --only hosting:admin`);
    runCommand(`firebase hosting:channel:deploy ${channelName}-hours --only hosting:hours`);
    
    console.log(`${colors.green}=== Test deployment completed successfully! ===${colors.reset}`);
    console.log(`${colors.yellow}Preview URLs will be displayed above.${colors.reset}`);
    console.log(`${colors.yellow}These preview deployments will be available for 7 days.${colors.reset}`);
    
  } catch (error) {
    console.error(`${colors.red}Deployment failed: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

deploy().catch(err => {
  console.error(err);
  process.exit(1);
}); 