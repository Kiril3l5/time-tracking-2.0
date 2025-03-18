#!/usr/bin/env node

/**
 * Centralized cleanup script for the Time Tracking 2.0 project
 * 
 * This script detects the current platform and runs the appropriate cleanup script
 * (cleanup.sh for Unix/Linux/macOS or cleanup.ps1 for Windows).
 */

const { execSync } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

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

console.log(`${colors.bright}${colors.cyan}=== Project Cleanup Script ===${colors.reset}`);
console.log(`${colors.yellow}Detecting platform for cleanup...${colors.reset}`);

// Get the directory where this script is located
const scriptDir = __dirname;

try {
  // Check if we're on Windows or Unix
  const isWindows = os.platform() === 'win32';
  const isCI = process.env.CI === 'true';

  if (isCI) {
    // In CI environments, perform a simplified cleanup
    console.log(`${colors.yellow}CI environment detected, performing simplified cleanup...${colors.reset}`);
    
    const cleanupTasks = [
      // Clean build artifacts
      'rm -rf packages/*/dist',
      // Clean coverage reports
      'rm -rf coverage',
      // Clean any temporary files
      'rm -rf .temp',
      // Clean Firebase cache
      'rm -rf .firebase'
    ];
    
    cleanupTasks.forEach(task => {
      try {
        console.log(`${colors.blue}Running: ${task}${colors.reset}`);
        execSync(task, { stdio: 'inherit' });
      } catch (err) {
        // Don't fail if a command fails - just continue with the next one
        console.log(`${colors.yellow}Warning: Command failed but continuing: ${task}${colors.reset}`);
      }
    });
  } else if (isWindows) {
    // Windows - run the PowerShell script
    console.log(`${colors.yellow}Windows platform detected, running PowerShell cleanup script...${colors.reset}`);
    const psScriptPath = path.join(scriptDir, 'cleanup.ps1');
    
    // Verify the script exists
    if (!fs.existsSync(psScriptPath)) {
      throw new Error(`PowerShell cleanup script not found at: ${psScriptPath}`);
    }
    
    execSync(`powershell -ExecutionPolicy Bypass -File "${psScriptPath}"`, { stdio: 'inherit' });
  } else {
    // Unix - run the Bash script
    console.log(`${colors.yellow}Unix platform detected, running Bash cleanup script...${colors.reset}`);
    const shScriptPath = path.join(scriptDir, 'cleanup.sh');
    
    // Verify the script exists
    if (!fs.existsSync(shScriptPath)) {
      throw new Error(`Bash cleanup script not found at: ${shScriptPath}`);
    }
    
    // Make sure the script is executable
    try {
      fs.chmodSync(shScriptPath, '755');
    } catch (err) {
      console.log(`${colors.yellow}Warning: Could not set execute permissions on cleanup.sh${colors.reset}`);
    }
    
    execSync(`"${shScriptPath}"`, { stdio: 'inherit' });
  }

  console.log(`${colors.green}${colors.bright}Cleanup completed successfully!${colors.reset}`);
} catch (error) {
  console.error(`${colors.red}Error during cleanup:${colors.reset}`, error.message);
  process.exit(1);
} 