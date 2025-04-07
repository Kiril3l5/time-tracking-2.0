#!/usr/bin/env node

/**
 * Dashboard CLI
 * 
 * A command line interface for the dashboard generator.
 * This script allows for direct interaction with dashboard generation and management.
 * 
 * Features:
 * - Generate dashboard from workflow data file
 * - Customize output path
 * - Control browser opening
 * - Verbose logging
 * 
 * @module dashboard-cli
 */

// Core imports
import { logger } from '../core/logger.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { generateWorkflowDashboard } from './dashboard-integration.js';
import process from 'process';

// Get the script's directory for resolving paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Parse command line arguments
 * 
 * @param {string[]} args - Command line arguments
 * @returns {Object} Parsed options
 * @returns {boolean} options.verbose - Whether to enable verbose logging
 * @returns {string} options.input - Path to input workflow data file
 * @returns {string} options.output - Path to output dashboard file
 * @returns {boolean} options.open - Whether to open the dashboard in browser
 * @throws {Error} If required arguments are missing
 */
function parseArgs(args) {
  const options = {
    verbose: false,
    input: null,
    output: null,
    open: true
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--input' || arg === '-i') {
      options.input = args[++i];
    } else if (arg === '--output' || arg === '-o') {
      options.output = args[++i];
    } else if (arg === '--no-open') {
      options.open = false;
    } else if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    }
  }
  
  return options;
}

/**
 * Show help information
 */
function showHelp() {
  logger.info(`
Dashboard Generator CLI

Usage: node scripts/workflow/dashboard-cli.js [options]

Options:
  --verbose, -v       Enable verbose logging
  --input, -i         Input JSON file with workflow data
  --output, -o        Output HTML file path (default: dashboard.html)
  --no-open           Don't open the dashboard in browser
  --help, -h          Show this help information

Examples:
  node scripts/workflow/dashboard-cli.js --input workflow-data.json
  node scripts/workflow/dashboard-cli.js --input workflow-data.json --output custom-dashboard.html
  node scripts/workflow/dashboard-cli.js --verbose
  `);
}

/**
 * Load workflow data from file
 * 
 * @param {string} filePath - Path to workflow data file
 * @returns {Promise<Object>} Parsed workflow data
 * @throws {Error} If file cannot be read or parsed
 */
async function loadWorkflowData(filePath) {
  try {
    const data = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    logger.error(`Failed to load workflow data from ${filePath}:`, error);
    process.exit(1);
  }
}

/**
 * Main CLI function
 * 
 * @returns {Promise<void>}
 * @throws {Error} If dashboard generation fails
 */
async function main() {
  // Parse command line arguments
  const options = parseArgs(process.argv.slice(2));
  
  // Set up logger
  logger.setVerbose(options.verbose);
  
  // Check if input file is provided
  if (!options.input) {
    logger.error('Input file is required. Use --input to specify a JSON file with workflow data.');
    showHelp();
    process.exit(1);
  }
  
  // Load workflow data
  logger.info(`Loading workflow data from ${options.input}...`);
  const workflowData = await loadWorkflowData(options.input);
  
  // Generate dashboard using the integration module
  logger.info('Generating dashboard...');
  const result = await generateWorkflowDashboard(workflowData, {
    verbose: options.verbose,
    noOpen: !options.open,
    outputPath: options.output
  });
  
  if (!result.success) {
    logger.error('Failed to generate dashboard:', result.error);
    process.exit(1);
  }
  
  logger.success(`Dashboard generated at: ${result.path}`);
  process.exit(0);
}

// Run CLI if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    logger.error('CLI failed:', error);
    process.exit(1);
  });
}

export default main; 