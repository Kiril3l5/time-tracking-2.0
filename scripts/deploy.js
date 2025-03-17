#!/usr/bin/env node

/**
 * Cross-platform deployment script for Time Tracking System
 * Works on Windows and Unix without requiring PowerShell or Bash
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get commit message from command line arguments
const commitMessage = process.argv[2];

// Check if commit message is provided
if (!commitMessage) {
  console.error('Error: Commit message is required');
  console.error('Usage: node deploy.js "Your commit message"');
  process.exit(1);
}

/**
 * Helper function to run shell commands
 * @param {string} command - Command to execute
 * @param {Object} options - Options for execSync
 */
function runCommand(command, options = {}) {
  const defaultOptions = {
    stdio: 'inherit',
    encoding: 'utf8',
  };
  
  try {
    return execSync(command, { ...defaultOptions, ...options });
  } catch (error) {
    console.error(`Error executing command: ${command}`);
    console.error(error.message);
    process.exit(1);
  }
}

// Main deployment steps
console.log('🧹 Step 1: Cleaning up the project...');
runCommand('pnpm run cleanup');

console.log('🔨 Step 2: Building the project...');
runCommand('pnpm run build:all');

console.log('📝 Step 3: Adding files to git...');
runCommand('git add .');

console.log('💾 Step 4: Committing changes...');
// Escape quotes in the commit message for shell safety
const escapedMessage = commitMessage.replace(/"/g, '\\"');
runCommand(`git commit -m "${escapedMessage}"`);

console.log('🚀 Step 5: Pushing to remote repository...');
runCommand('git push');

console.log('🔥 Step 6: Deploying to Firebase...');
runCommand('pnpm run deploy:all');

console.log('✅ Deployment completed successfully!');
console.log(`
==========================================
 Time Tracking System has been deployed!
 Commit message: "${commitMessage}"
 Deployment time: ${new Date().toLocaleString()}
==========================================
`); 