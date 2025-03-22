#!/usr/bin/env node

/**
 * Preview Channel Cleanup Script
 * 
 * This script provides a standalone entry point for cleaning up old Firebase preview channels.
 * It can be run independently of the main preview deployment workflow to manage
 * the lifecycle of preview environments and maintain resource efficiency.
 * 
 * Features:
 * - Interactive or automatic cleanup of old preview channels
 * - Configurable thresholds and retention policies
 * - Detailed reporting of cleanup actions
 * - Support for multiple Firebase sites
 * - Integration with Firebase Hosting API
 * - Channel expiration based on creation date
 * 
 * Usage:
 *   node scripts/preview-cleanup.js [options]
 * 
 * Options:
 *   --auto                 Run cleanup automatically without prompts
 *   --threshold=<number>   Minimum number of channels before cleanup (default: 5)
 *   --keep=<number>        Number of recent channels to keep (default: 3)
 *   --prefix=<string>      Only clean channels with this prefix
 *   --site=<string>        Override the site from config
 *   --project=<string>     Override the project from config
 *   --verbose              Enable verbose logging
 *   --help                 Show help information
 * 
 * Examples:
 *   node scripts/preview-cleanup.js
 *   node scripts/preview-cleanup.js --auto --keep=5
 *   node scripts/preview-cleanup.js --prefix=pr --threshold=10
 * 
 * @module preview/cleanup
 */

import * as logger from './core/logger.js';
import * as commandRunner from './core/command-runner.js';
import * as config from './core/config.js';
import * as firebaseAuth from './auth/firebase-auth.js';
import readline from 'readline';

/* global process */

/**
 * Parse command line arguments
 * 
 * @function parseArguments
 * @returns {Object} Parsed arguments with default values applied
 * @description Parses the command line arguments passed to the script and combines
 * them with default values. Supports various argument formats, including
 * --key=value, --flag, and --key value.
 * @example
 * // Parse arguments from command line 
 * const args = parseArguments();
 * 
 * console.log(`Auto mode: ${args.auto}`);
 * console.log(`Threshold: ${args.threshold}`);
 * console.log(`Keep count: ${args.keep}`);
 * 
 * if (args.help) {
 *   showHelp();
 *   process.exit(0);
 * }
 */
function parseArguments() {
  const args = process.argv.slice(2);
  const parsedArgs = {
    auto: false,
    threshold: 5,
    keep: 3,
    prefix: null,
    site: null,
    project: null,
    verbose: false,
    help: false
  };
  
  args.forEach(arg => {
    if (arg === '--auto') parsedArgs.auto = true;
    else if (arg === '--verbose') parsedArgs.verbose = true;
    else if (arg === '--help') parsedArgs.help = true;
    else if (arg.startsWith('--threshold=')) parsedArgs.threshold = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--keep=')) parsedArgs.keep = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--prefix=')) parsedArgs.prefix = arg.split('=')[1];
    else if (arg.startsWith('--site=')) parsedArgs.site = arg.split('=')[1];
    else if (arg.startsWith('--project=')) parsedArgs.project = arg.split('=')[1];
  });
  
  return parsedArgs;
}

/**
 * Display help information
 * 
 * @function showHelp
 * @description Displays detailed help information for the script, including
 * usage syntax, available options with descriptions, and usage examples.
 * @example
 * // Show help and exit
 * showHelp();
 * process.exit(0);
 */
function showHelp() {
  console.log(`
Preview Channel Cleanup Script
------------------------------

This script helps you clean up old Firebase hosting preview channels to manage
your preview environments and stay within quota limits.

Usage:
  node scripts/preview-cleanup.js [options]

Options:
  --auto                 Run cleanup automatically without prompts
  --threshold=<number>   Minimum number of channels before cleanup (default: 5)
  --keep=<number>        Number of recent channels to keep (default: 3)
  --prefix=<string>      Only clean channels with this prefix
  --site=<string>        Override the site from config
  --project=<string>     Override the project from config
  --verbose              Enable verbose logging
  --help                 Show this help information

Examples:
  # Interactive mode (asks for confirmation)
  node scripts/preview-cleanup.js
  
  # Automatic mode, keep 5 most recent channels
  node scripts/preview-cleanup.js --auto --keep=5
  
  # Only clean channels with "pr-" prefix, run when more than 10 exist
  node scripts/preview-cleanup.js --prefix=pr --threshold=10
  
  # Override project and site
  node scripts/preview-cleanup.js --project=my-project --site=my-site
  `.trim());
}

/**
 * Verify Firebase authentication
 * 
 * @async
 * @function verifyAuthentication
 * @returns {Promise<boolean>} Whether authentication is valid
 * @description Verifies that the user is authenticated with Firebase and has
 * access to the specified project. This is required before performing any
 * cleanup operations that interact with Firebase Hosting.
 * @example
 * // Check authentication before proceeding
 * async function main() {
 *   const isAuthenticated = await verifyAuthentication();
 *   
 *   if (!isAuthenticated) {
 *     console.error('Authentication failed, cannot proceed');
 *     process.exit(1);
 *   }
 *   
 *   // Continue with cleanup
 *   // ...
 * }
 */
async function verifyAuthentication() {
  logger.info('Verifying Firebase authentication...');
  
  // Check Firebase CLI authentication
  const authStatus = firebaseAuth.checkFirebaseAuth();
  
  if (!authStatus.authenticated) {
    logger.error('Firebase authentication required');
    firebaseAuth.showLoginInstructions();
    return false;
  }
  
  // Verify project access
  const projectId = config.firebaseConfig.projectId;
  if (!firebaseAuth.verifyProjectAccess(projectId)) {
    logger.error(`No access to Firebase project: ${projectId}`);
    return false;
  }
  
  return true;
}

/**
 * Run the cleanup process
 * 
 * @async
 * @function runCleanup
 * @param {Object} args - Command line arguments
 * @returns {Promise<boolean>} Whether cleanup was successful
 * @description Executes the main cleanup logic, listing preview channels,
 * filtering based on criteria, and deleting channels that meet the cleanup
 * conditions. Handles both interactive and automatic modes.
 * @example
 * // Parse args and run cleanup
 * async function main() {
 *   const args = parseArguments();
 *   
 *   if (args.help) {
 *     showHelp();
 *     process.exit(0);
 *   }
 *   
 *   // Set verbose logging if requested
 *   logger.setVerbose(args.verbose);
 *   
 *   // Run cleanup with parsed arguments
 *   const success = await runCleanup(args);
 *   
 *   if (success) {
 *     console.log('Cleanup completed successfully');
 *   } else {
 *     console.error('Cleanup failed or was cancelled');
 *     process.exit(1);
 *   }
 * }
 */
async function runCleanup(args) {
  // Get Firebase project and site from config, with overrides from args
  const projectId = args.project || config.firebaseConfig.projectId;
  const site = args.site || config.firebaseConfig.site || projectId;
  
  logger.info(`Listing preview channels for site: ${site} (project: ${projectId})`);
  
  // List all channels for the site
  const result = commandRunner.runCommand(`firebase hosting:channel:list --project=${projectId} --site=${site}`, {
    stdio: 'pipe',
    ignoreError: true
  });
  
  if (!result.success) {
    logger.error('Failed to list channels');
    logger.error(result.stderr);
    return false;
  }
  
  // Parse output to extract channels
  const lines = result.output.split('\n');
  
  // Find channels
  const channelRegex = /│\s+([^\s]+)\s+│\s+[^\s]+\s+│\s+([^\s]+)\s+/;
  const channels = [];
  
  for (const line of lines) {
    const match = line.match(channelRegex);
    if (match) {
      // Get channel name and creation date
      const channelName = match[1];
      const createdAt = match[2];
      
      // Apply prefix filter if specified
      if (args.prefix && !channelName.startsWith(args.prefix)) {
        continue;
      }
      
      channels.push({
        name: channelName,
        createdAt: new Date(createdAt)
      });
    }
  }
  
  // Sort channels by creation date (newest first)
  channels.sort((a, b) => b.createdAt - a.createdAt);
  
  logger.info(`Found ${channels.length} preview channels${args.prefix ? ` with prefix "${args.prefix}"` : ''}`);
  
  // Check if cleanup is needed
  if (channels.length <= args.threshold) {
    logger.info(`Cleanup not needed. Channel count (${channels.length}) is below threshold (${args.threshold})`);
    return true;
  }
  
  // Identify channels to keep vs. delete
  const toKeep = channels.slice(0, args.keep);
  const toDelete = channels.slice(args.keep);
  
  if (toDelete.length === 0) {
    logger.info('No channels to delete');
    return true;
  }
  
  // Show details
  logger.info(`Will keep ${toKeep.length} recent channels:`);
  for (const channel of toKeep) {
    logger.info(`  - ${channel.name} (created: ${channel.createdAt.toISOString()})`);
  }
  
  logger.info(`Will delete ${toDelete.length} older channels:`);
  for (const channel of toDelete) {
    logger.info(`  - ${channel.name} (created: ${channel.createdAt.toISOString()})`);
  }
  
  // If not in auto mode, ask for confirmation
  if (!args.auto) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise(resolve => {
      rl.question('\nProceed with cleanup? (y/N): ', resolve);
    });
    
    rl.close();
    
    if (answer.toLowerCase() !== 'y') {
      logger.info('Cleanup cancelled by user');
      return false;
    }
  }
  
  // Perform deletion
  logger.info('Starting channel deletion...');
  
  let successCount = 0;
  let failCount = 0;
  
  for (const channel of toDelete) {
    logger.info(`Deleting channel: ${channel.name}`);
    
    const deleteResult = commandRunner.runCommand(
      `firebase hosting:channel:delete ${channel.name} --project=${projectId} --site=${site} --force`,
      { ignoreError: true }
    );
    
    if (deleteResult.success) {
      logger.success(`Deleted channel: ${channel.name}`);
      successCount++;
    } else {
      logger.error(`Failed to delete channel: ${channel.name}`);
      failCount++;
    }
  }
  
  // Summary
  logger.info('\nCleanup Summary:');
  logger.info(`Total channels processed: ${toDelete.length}`);
  logger.info(`Successfully deleted: ${successCount}`);
  
  if (failCount > 0) {
    logger.error(`Failed to delete: ${failCount}`);
  }
  
  return successCount > 0;
}

/**
 * Main entry point
 * 
 * @async
 * @function main
 * @description Main entry point of the script. Parses command line arguments,
 * verifies authentication, and runs cleanup based on the provided arguments.
 * @example
 * // Invoke the main function
 * main().catch(error => {
 *   console.error('Unhandled error:', error);
 *   process.exit(1);
 * });
 */
async function main() {
  const args = parseArguments();
  
  if (args.help) {
    showHelp();
    return;
  }
  
  // Set verbose logging if requested
  logger.setVerbose(args.verbose);
  
  // Load configuration
  logger.info('Preview Channel Cleanup');
  logger.info('=====================');
  
  if (args.verbose) {
    config.logConfig();
  }
  
  // Make sure user is authenticated
  const isAuthenticated = await verifyAuthentication();
  if (!isAuthenticated) {
    process.exit(1);
  }
  
  // Run cleanup
  const success = await runCleanup(args);
  
  if (success) {
    logger.success('Cleanup completed');
  } else {
    logger.warn('Cleanup failed or was cancelled');
    process.exit(1);
  }
}

// Execute main function
main().catch(error => {
  logger.error('Unhandled error:');
  logger.error(error);
  process.exit(1);
}); 