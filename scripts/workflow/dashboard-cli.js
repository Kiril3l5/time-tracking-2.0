#!/usr/bin/env node

/**
 * Dashboard CLI
 * 
 * A command line interface for the dashboard generator.
 * This script allows for direct interaction with dashboard generation and management.
 */

// Core imports
import { logger } from '../core/logger.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { generateDashboard } from './dashboard-generator.js';
import process from 'process';

// Get the script's directory for resolving paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0] || 'generate';
  
  const options = {
    command,
    help: args.includes('--help') || args.includes('-h'),
    verbose: args.includes('--verbose'),
    skipOpen: args.includes('--skip-open'),
    cleanup: args.includes('--cleanup')
  };
  
  return options;
}

// Show help information
function showHelp() {
  logger.info(`
Dashboard CLI
==============

Generate and manage consolidated dashboard reports.

Usage: node scripts/workflow/dashboard-cli.js [command] [options]

Commands:
  generate    Generate a dashboard report (default)
  open        Open an existing dashboard
  cleanup     Clean up dashboard and report files

Options:
  --help, -h   Show this help message
  --verbose    Show verbose output
  --skip-open  Don't open dashboard in browser
  --cleanup    Clean up old reports before generating new ones

Examples:
  node scripts/workflow/dashboard-cli.js
  node scripts/workflow/dashboard-cli.js generate
  node scripts/workflow/dashboard-cli.js open
  node scripts/workflow/dashboard-cli.js cleanup
  node scripts/workflow/dashboard-cli.js generate --skip-open
  `);
}

// Handle generate command
async function handleGenerate(options) {
  logger.info("Generating dashboard...");
  
  if (options.cleanup) {
    await generateDashboard.cleanupDashboard();
  }
  
  const result = await generateDashboard.generateDashboard({
    openInBrowser: !options.skipOpen,
    verbose: options.verbose
  });
  
  if (result.success) {
    logger.success("Dashboard generated successfully!");
    logger.info(`Dashboard path: ${result.dashboardPath}`);
    return true;
  } else {
    logger.error(`Dashboard generation failed: ${result.error}`);
    return false;
  }
}

// Handle open command
async function handleOpen() {
  logger.info("Opening dashboard...");
  
  // Load preview URLs
  const previewUrls = generateDashboard.loadPreviewUrls();
  
  const result = await generateDashboard.generateDashboard({
    previewUrls,
    openInBrowser: true
  });
  
  if (result.success) {
    logger.success("Dashboard opened successfully!");
    return true;
  } else {
    logger.error(`Failed to open dashboard: ${result.error}`);
    return false;
  }
}

// Handle cleanup command
async function handleCleanup() {
  logger.info("Cleaning up dashboard and report files...");
  
  const result = await generateDashboard.cleanupDashboard();
  
  if (result.success) {
    logger.success("Dashboard and reports cleaned up successfully!");
    return true;
  } else {
    logger.error(`Cleanup failed: ${result.error}`);
    return false;
  }
}

// Main function
async function main() {
  const options = parseArgs();
  
  if (options.help) {
    showHelp();
    return;
  }
  
  let success = false;
  
  switch (options.command) {
    case 'generate':
      success = await handleGenerate(options);
      break;
    case 'open':
      success = await handleOpen();
      break;
    case 'cleanup':
      success = await handleCleanup();
      break;
    default:
      logger.error(`Unknown command: ${options.command}`);
      showHelp();
      process.exit(1);
  }
  
  process.exit(success ? 0 : 1);
}

// Run if executed directly
if (__filename === process.argv[1]) {
  main().catch(error => {
    logger.error(`Uncaught error: ${error.message}`);
    logger.debug(error.stack || error);
    process.exit(1);
  });
}

export default main; 