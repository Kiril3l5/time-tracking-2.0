#!/usr/bin/env node

/**
 * Firebase Channel CLI
 * 
 * Command-line interface for Firebase channel operations.
 * This provides a unified entry point for various channel management operations
 * like listing channels, showing the dashboard, and cleaning up old channels.
 * 
 * Usage:
 *   node scripts/firebase/channel-cli.js <command> [options]
 * 
 * Commands:
 *   dashboard    Display a dashboard of all channels
 *   list         List all channels
 *   cleanup      Clean up old channels
 *   get <id>     Get details of a specific channel
 * 
 * Options:
 *   --project    Firebase project ID (overrides config)
 *   --site       Firebase site ID (overrides config)
 *   --prefix     Filter channels by prefix
 *   --verbose    Show verbose output
 *   --help       Show help information
 */

import process from 'node:process';
import { parseArgs } from 'node:util';
import { logger } from '../core/logger.js';
import { config } from '../core/config.js';
import { channelManager } from './channel-manager.js';
import { channelCleanup } from './channel-cleanup.js';

// Parse command-line arguments
function parseArguments() {
  const options = {
    'project': { type: 'string' },
    'site': { type: 'string' },
    'prefix': { type: 'string' },
    'auto': { type: 'boolean', default: false },
    'verbose': { type: 'boolean', default: false },
    'help': { type: 'boolean', default: false }
  };
  
  const { values, positionals } = parseArgs({
    options,
    allowPositionals: true,
    strict: false
  });
  
  // Get command (first positional argument)
  const command = positionals.length > 0 ? positionals[0] : 'dashboard';
  
  // Get channel ID for 'get' command
  const channelId = command === 'get' && positionals.length > 1 ? positionals[1] : null;
  
  return { ...values, command, channelId };
}

// Display help information
function showHelp() {
  const colors = logger.getColors();
  
  logger.log(`
${colors.cyan.bold}Firebase Channel CLI${colors.reset}

Command-line interface for Firebase channel operations.

${colors.bold}Usage:${colors.reset}
  node scripts/firebase/channel-cli.js <command> [options]

${colors.bold}Commands:${colors.reset}
  dashboard    Display a dashboard of all channels (default)
  list         List all channels in JSON format
  cleanup      Clean up old channels
  get <id>     Get details of a specific channel

${colors.bold}Options:${colors.reset}
  --project    Firebase project ID (overrides config)
  --site       Firebase site ID (overrides config)
  --prefix     Filter channels by prefix
  --auto       Automatically clean up channels (for cleanup command)
  --verbose    Show verbose output
  --help       Show help information

${colors.bold}Examples:${colors.reset}
  ${colors.blue}# Show dashboard of all channels${colors.reset}
  node scripts/firebase/channel-cli.js dashboard

  ${colors.blue}# List channels in JSON format${colors.reset}
  node scripts/firebase/channel-cli.js list

  ${colors.blue}# Clean up old channels${colors.reset}
  node scripts/firebase/channel-cli.js cleanup --auto

  ${colors.blue}# Get details for a specific channel${colors.reset}
  node scripts/firebase/channel-cli.js get my-channel-id
  `);
}

// Show dashboard
async function showDashboard(args) {
  // Load config if not already loaded
  if (!config.isConfigLoaded()) {
    config.loadConfig();
  }
  
  // Get Firebase config
  const firebaseConfig = config.getFirebaseConfig();
  
  // Use provided args or fallback to config
  const projectId = args.project || firebaseConfig.projectId;
  const site = args.site || firebaseConfig.site;
  
  if (!projectId || !site) {
    logger.error('Project ID and site are required');
    return false;
  }
  
  // Show dashboard
  const result = await channelManager.listChannels({
    projectId,
    site,
    format: 'dashboard',
    displayUrls: true,
    verbose: args.verbose
  });
  
  if (!result.success) {
    logger.error(`Error showing dashboard: ${result.error}`);
    return false;
  }
  
  // Dashboard is already logged by the listChannels function
  return true;
}

// List channels
async function listChannels(args) {
  // Load config if not already loaded
  if (!config.isConfigLoaded()) {
    config.loadConfig();
  }
  
  // Get Firebase config
  const firebaseConfig = config.getFirebaseConfig();
  
  // Use provided args or fallback to config
  const projectId = args.project || firebaseConfig.projectId;
  const site = args.site || firebaseConfig.site;
  
  if (!projectId || !site) {
    logger.error('Project ID and site are required');
    return false;
  }
  
  // List channels
  const result = await channelManager.listChannels({
    projectId,
    site,
    format: 'json',
    verbose: args.verbose
  });
  
  if (!result.success) {
    logger.error(`Error listing channels: ${result.error}`);
    return false;
  }
  
  // Filter by prefix if specified
  let channels = result.channels;
  if (args.prefix) {
    channels = channelManager.filterChannelsByPrefix(channels, args.prefix);
    logger.info(`Filtered to ${channels.length} channels with prefix '${args.prefix}'`);
  }
  
  // Display channels as JSON
  logger.log(JSON.stringify(channels, null, 2));
  
  return true;
}

// Clean up channels
async function cleanupChannels(args) {
  // Load config if not already loaded
  if (!config.isConfigLoaded()) {
    config.loadConfig();
  }
  
  // Get Firebase config
  const firebaseConfig = config.getFirebaseConfig();
  const previewConfig = config.getPreviewConfig();
  
  // Use provided args or fallback to config
  const projectId = args.project || firebaseConfig.projectId;
  const site = args.site || firebaseConfig.site;
  const prefix = args.prefix || previewConfig.prefix || 'pr';
  
  if (!projectId || !site) {
    logger.error('Project ID and site are required');
    return false;
  }
  
  // Get channel threshold and keep count from config
  const { channelKeepCount = 5, channelThreshold = 8 } = previewConfig;
  
  // Check and clean up channels
  const cleanupResult = await channelCleanup.checkAndCleanupIfNeeded({
    projectId,
    site,
    threshold: channelThreshold,
    keepCount: channelKeepCount,
    prefix,
    autoCleanup: args.auto
  });
  
  if (!cleanupResult.success) {
    logger.error(`Error cleaning up channels: ${cleanupResult.error}`);
    return false;
  }
  
  return true;
}

// Get channel details
async function getChannelDetails(args) {
  if (!args.channelId) {
    logger.error('Channel ID is required for the get command');
    return false;
  }
  
  // Load config if not already loaded
  if (!config.isConfigLoaded()) {
    config.loadConfig();
  }
  
  // Get Firebase config
  const firebaseConfig = config.getFirebaseConfig();
  
  // Use provided args or fallback to config
  const projectId = args.project || firebaseConfig.projectId;
  const site = args.site || firebaseConfig.site;
  
  if (!projectId || !site) {
    logger.error('Project ID and site are required');
    return false;
  }
  
  // Get channel details
  const result = await channelManager.getChannel({
    channelId: args.channelId,
    projectId,
    site
  });
  
  if (!result.success) {
    logger.error(`Error getting channel details: ${result.error}`);
    return false;
  }
  
  // Display channel details
  logger.log(JSON.stringify(result.channel, null, 2));
  
  return true;
}

// Main function
async function main() {
  try {
    // Parse command-line arguments
    const args = parseArguments();
    
    // Show help if requested
    if (args.help) {
      showHelp();
      process.exit(0);
    }
    
    // Enable verbose logging if requested
    if (args.verbose) {
      logger.setLevel('debug');
    }
    
    // Execute the requested command
    let success = false;
    
    switch (args.command) {
      case 'dashboard':
        success = await showDashboard(args);
        break;
      case 'list':
        success = await listChannels(args);
        break;
      case 'cleanup':
        success = await cleanupChannels(args);
        break;
      case 'get':
        success = await getChannelDetails(args);
        break;
      default:
        logger.error(`Unknown command: ${args.command}`);
        showHelp();
        process.exit(1);
    }
    
    // Exit with appropriate code
    process.exit(success ? 0 : 1);
  } catch (error) {
    logger.error(`Unhandled error: ${error.message}`);
    logger.debug(error.stack);
    process.exit(1);
  }
}

// Run the main function
main(); 