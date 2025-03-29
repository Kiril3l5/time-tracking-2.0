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

// Import Firebase deployment utilities
import * as deployment from './firebase/deployment.js';
import * as channelCleanup from './firebase/channel-cleanup.js';
import * as urlExtractor from './firebase/url-extractor.js';

// Import documentation quality checker
import * as docQuality from './checks/doc-quality.js';

// Import command runner for executing shell commands
import * as commandRunner from './core/command-runner.js';

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

    // 6. Run quality checks
    await runQualityChecks();

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
 * Check if main branch needs syncing
 * @returns {Promise<boolean>} - Whether main needs syncing
 */
async function needsMainSync() {
  try {
    // Fetch latest refs without merging
    execSync('git fetch origin main', { stdio: 'pipe' });
    
    // Check if main is behind remote
    const diffResult = execSync('git rev-list --count main..origin/main', { encoding: 'utf8' }).trim();
    const commitsBehind = parseInt(diffResult, 10);
    
    return commitsBehind > 0;
  } catch (error) {
    // If we can't check, assume sync is needed
    return true;
  }
}

/**
 * Offer to sync main branch
 */
async function offerMainSync() {
  // Skip if we're already on main
  if (state.currentBranch === 'main') {
    return;
  }

  // Check if main needs syncing
  const needsSync = await needsMainSync();
  
  if (!needsSync) {
    logger.info('Main branch is already in sync with remote');
    return;
  }

  const shouldSync = await question('Your local main branch is behind remote. Would you like to sync it? (y/N) ');
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
    logger.info('\nHow would you like to handle these changes?');
    logger.info('1. Commit changes (create a new commit)');
    logger.info('2. Stash changes (save for later)');
    logger.info('3. Discard changes (revert all changes)');
    logger.info('4. Skip for now (keep working)');
    
    const choice = await question('Choose an option (1-4): ');
    let message;
    let confirm;
    
    switch (choice) {
      case '1':
        message = await question('Enter commit message: ');
        execSync('git add .');
        execSync(`git commit -m "${message}"`);
        logger.success('Changes committed successfully!');
        break;
        
      case '2':
        message = await question('Enter stash message (optional): ');
        execSync(`git stash push -m "${message || 'Stashed changes'}"`);
        logger.success('Changes stashed successfully! Use "git stash pop" to restore later.');
        break;
        
      case '3':
        confirm = await question('Are you sure you want to discard all changes? (yes/NO): ');
        if (confirm.toLowerCase() === 'yes') {
          execSync('git reset --hard HEAD');
          logger.success('Changes discarded successfully!');
        } else {
          logger.info('Discarding changes cancelled.');
        }
        break;
        
      case '4':
        logger.info('Skipping changes. You can commit them later with "git add . && git commit -m your message"');
        break;
        
      default:
        logger.info('Invalid option. Skipping changes.');
    }
  }
}

/**
 * Run preview deployment
 */
async function runPreview() {
  logger.sectionHeader('Deploying preview');
  
  try {
    // Generate a unique channel ID
    const channelId = deployment.generateChannelId({
      prefix: 'feature',
      timestamp: Date.now()
    });
    
    // Deploy to preview channel
    const deployResult = await deployment.deployToPreviewChannel({
      projectId: 'autonomy-heroes',
      site: ['admin-autonomyhero-2024', 'hours-autonomyhero-2024'],
      channelId,
      skipBuild: true // Skip build since we already built in the build step
    });
    
    if (!deployResult.success) {
      throw new Error(`Deployment failed: ${deployResult.error}`);
    }
    
    // Clean up old channels if needed
    const cleanupResult = await channelCleanup.checkAndCleanupIfNeeded({
      projectId: 'autonomy-heroes',
      site: ['admin-autonomyhero-2024', 'hours-autonomyhero-2024'],
      threshold: 5,
      autoCleanup: true
    });
    
    if (cleanupResult.needsCleanup) {
      logger.info('Channel cleanup completed');
    }
    
    return deployResult;
  } catch (error) {
    logger.error(`Preview deployment failed: ${error.message}`);
    throw error;
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
 * Run quality checks
 */
async function runQualityChecks() {
  logger.sectionHeader('Quality Checks');
  
  try {
    // Run ESLint
    logger.info('Running ESLint...');
    execSync('pnpm run lint', { stdio: 'inherit' });
    
    // Run TypeScript checks
    logger.info('Running TypeScript checks...');
    execSync('pnpm run typecheck', { stdio: 'inherit' });
    
    // Run unit tests
    logger.info('Running unit tests...');
    execSync('pnpm run test', { stdio: 'inherit' });
    
    // Check documentation quality
    logger.info('Checking documentation quality...');
    const docResults = await docQuality.analyzeDocumentation({
      docsDir: 'docs',
      requiredDocs: ['setup', 'deployment', 'architecture', 'api', 'configuration'],
      minCoverage: 80,
      generateReport: true
    });
    
    if (!docResults.success) {
      logger.warn('Documentation quality check found issues:', docResults.issues);
    }
    
    logger.success('All quality checks completed!');
  } catch (error) {
    logger.error(`Quality checks failed: ${error.message}`);
    throw error;
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