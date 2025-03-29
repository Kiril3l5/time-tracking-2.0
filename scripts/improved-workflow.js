#!/usr/bin/env node

/* global process, console */

/**
 * Improved Workflow Orchestrator
 * 
 * A lightweight orchestrator that leverages existing modules to provide
 * a smooth development workflow without reinventing functionality.
 */

import { execSync } from 'child_process';
import readline from 'readline';
import { promisify } from 'util';
import * as logger from './core/logger.js';
import path from 'path';
import fs from 'fs';

// Simple state management
const state = {
  currentBranch: null,
  hasChanges: false,
  previewUrls: null,
  lastError: null
};

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
const question = promisify(rl.question).bind(rl);

/**
 * Main workflow orchestrator
 */
async function runWorkflow(options = {}) {
  try {
    logger.info('Starting development workflow...');

    // 1. Branch setup
    await ensureFeatureBranch();

    // 2. Sync main if needed
    await offerMainSync();

    // 3. Handle changes
    await handleChanges();

    // 4. Run preview deployment
    if (!options.skipPreview) {
      await runPreview();
    }

    // 5. Create PR if requested
    if (state.previewUrls && !options.skipPR) {
      await handlePRCreation();
    }

    logger.success('Workflow completed successfully!');
  } catch (error) {
    logger.error(`Workflow failed: ${error.message}`);
    if (error.hint) {
      logger.info(`Hint: ${error.hint}`);
    }
  } finally {
    rl.close();
  }
}

/**
 * Ensure we're on a feature branch
 */
async function ensureFeatureBranch() {
  state.currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();

  if (state.currentBranch === 'main') {
    const featureName = await question('What feature are you working on? ');
    const branchName = `feature/${featureName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
    
    logger.info(`Creating new branch: ${branchName}`);
    execSync(`git checkout -b ${branchName}`);
    state.currentBranch = branchName;
  }
}

/**
 * Offer to sync main branch
 */
async function offerMainSync() {
  const shouldSync = await question('Would you like to sync your main branch with remote? (y/N) ');
  if (shouldSync.toLowerCase() === 'y') {
    execSync('node scripts/sync-main.js', { stdio: 'inherit' });
  }
}

/**
 * Handle any uncommitted changes
 */
async function handleChanges() {
  const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
  if (!status) return;

  logger.info('Uncommitted changes detected:');
  console.log(status);

  // First handle gitignore-related changes
  execSync('node scripts/fix-gitignore.js', { stdio: 'inherit' });

  // Then handle remaining changes
  const remainingStatus = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
  if (remainingStatus) {
    const shouldCommit = await question('Would you like to commit these changes? (Y/n) ');
    if (shouldCommit.toLowerCase() !== 'n') {
      const message = await question('Enter commit message: ');
      execSync('git add .');
      execSync(`git commit -m "${message}"`);
    }
  }
}

/**
 * Run preview deployment
 */
async function runPreview() {
  logger.info('Starting preview deployment...');
  
  try {
    // Run preview script
    execSync('node scripts/preview.js', { stdio: 'inherit' });
    
    // Get preview URLs from the most recent preview
    const previewUrls = await getPreviewUrls();
    if (previewUrls) {
      state.previewUrls = previewUrls;
      logger.success('Preview deployment successful!');
    }
  } catch (error) {
    throw new Error(`Preview deployment failed: ${error.message}`);
  }
}

/**
 * Get preview URLs from the most recent preview
 */
async function getPreviewUrls() {
  try {
    const previewDir = path.join(process.cwd(), 'temp');
    const urlsFile = path.join(previewDir, 'preview-urls.json');
    
    if (fs.existsSync(urlsFile)) {
      const urls = JSON.parse(fs.readFileSync(urlsFile, 'utf8'));
      return urls;
    }
    return null;
  } catch (error) {
    logger.warn('Could not read preview URLs:', error.message);
    return null;
  }
}

/**
 * Handle PR creation
 */
async function handlePRCreation() {
  const shouldCreatePR = await question('Would you like to create a PR? (Y/n) ');
  if (shouldCreatePR.toLowerCase() !== 'n') {
    const title = await question('Enter PR title: ');
    const description = await question('Enter PR description (optional): ');
    
    // Create PR by executing the script directly
    execSync(`node scripts/create-pr.js "${title}" "${description}"`, { stdio: 'inherit' });
  }
}

/**
 * Show help information
 */
function showHelp() {
  logger.info(`
Improved Workflow Orchestrator

Usage:
  node scripts/improved-workflow.js [options]

Options:
  --skip-preview    Skip preview deployment
  --skip-pr        Skip PR creation
  --help, -h       Show this help message

This tool orchestrates the development workflow by:
1. Managing feature branches
2. Handling code changes
3. Running preview deployments
4. Creating pull requests

It leverages existing modules for each step rather than reimplementing functionality.
`);
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  skipPreview: args.includes('--skip-preview'),
  skipPR: args.includes('--skip-pr'),
  help: args.includes('--help') || args.includes('-h')
};

// Show help or run workflow
if (options.help) {
  showHelp();
} else {
  runWorkflow(options).catch(error => {
    logger.error(error);
    process.exit(1);
  });
} 