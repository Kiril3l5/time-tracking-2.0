#!/usr/bin/env node

/**
 * Fix Build Script
 * 
 * This script addresses common build issues in the time-tracking-2.0 project,
 * particularly related to module resolution problems with immer and zustand.
 * 
 * It performs the following actions:
 * 1. Cleans node_modules
 * 2. Clears the pnpm store cache
 * 3. Reinstalls dependencies 
 * 4. Builds packages in the correct order
 */

const { execSync } = require('child_process');

// ANSI color codes for better terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Helper function to run commands and handle errors
function runCommand(command, options = {}) {
  console.log(`${colors.blue}Running: ${colors.bright}${command}${colors.reset}`);
  try {
    const output = execSync(command, { 
      encoding: 'utf8',
      stdio: 'inherit',
      ...options 
    });
    return { success: true, output };
  } catch (error) {
    console.error(`${colors.red}Error executing command: ${command}${colors.reset}`);
    console.error(`${colors.dim}${error.message}${colors.reset}`);
    return { success: false, error };
  }
}

async function fixBuild() {
  console.log(`${colors.bright}${colors.cyan}=== Starting build fix process ===${colors.reset}`);
  
  // Step 1: Clean node_modules
  console.log(`${colors.yellow}Step 1: Cleaning node_modules${colors.reset}`);
  runCommand('rm -rf node_modules');
  runCommand('rm -rf packages/*/node_modules');
  
  // Step 2: Clear pnpm store cache for problematic packages
  console.log(`${colors.yellow}Step 2: Clearing pnpm cache${colors.reset}`);
  runCommand('pnpm store prune');
  
  // Step 3: Reinstall dependencies
  console.log(`${colors.yellow}Step 3: Reinstalling dependencies${colors.reset}`);
  runCommand('pnpm install');
  
  // Step 4: Build packages in the correct order
  console.log(`${colors.yellow}Step 4: Building packages in the correct order${colors.reset}`);
  
  // Build common package first
  console.log(`${colors.magenta}Building common package...${colors.reset}`);
  const commonBuild = runCommand('pnpm run build:common');
  if (!commonBuild.success) {
    console.error(`${colors.red}Failed to build common package. Aborting.${colors.reset}`);
    process.exit(1);
  }
  
  // Build admin and hours packages
  console.log(`${colors.magenta}Building admin package...${colors.reset}`);
  runCommand('pnpm run build:admin');
  
  console.log(`${colors.magenta}Building hours package...${colors.reset}`);
  runCommand('pnpm run build:hours');
  
  console.log(`${colors.green}${colors.bright}=== Build fix process completed! ===${colors.reset}`);
  console.log(`${colors.cyan}If you still experience issues with specific packages, try building them individually:${colors.reset}`);
  console.log(`${colors.bright}pnpm run build:common${colors.reset}`);
  console.log(`${colors.bright}pnpm run build:admin${colors.reset}`);
  console.log(`${colors.bright}pnpm run build:hours${colors.reset}`);
}

// Execute the function
fixBuild().catch(error => {
  console.error(`${colors.red}Unhandled error:${colors.reset}`, error);
  process.exit(1);
}); 