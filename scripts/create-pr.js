#!/usr/bin/env node

/**
 * PR Creation Script
 * 
 * This script automates creating a pull request after a successful preview deployment.
 * It extracts preview URLs from the most recent preview and creates a GitHub PR.
 * 
 * Usage:
 *   node scripts/create-pr.js [PR-Title] [PR-Description]
 * 
 * Options:
 *   --test               Test mode - validate all checks without creating PR
 *   --dry-run            Show what would happen without executing commands
 *   --auto-commit        Automatically commit uncommitted changes
 *   --skip-push          Skip pushing to remote
 *   --skip-url-check     Skip checking for preview URLs
 *   --force              Force PR creation even from main branch
 * 
 * Examples:
 *   node scripts/create-pr.js "Fix navigation bug" "This fixes the responsive navigation issues on mobile"
 *   node scripts/create-pr.js "Update styles" 
 *   node scripts/create-pr.js --test
 *   node scripts/create-pr.js --dry-run "Test PR" "Testing PR creation"
 *   node scripts/create-pr.js --auto-commit "Quick fix" "Fixed typo in docs"
 */

/* global console, process */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './core/logger.js';
import getWorkflowState from './workflow/workflow-state.js';
import { progressTracker } from './core/progress-tracker.js';
import { performanceMonitor } from './core/performance-monitor.js';
import { handleError, ValidationError, WorkflowError } from './core/error-handler.js';

// Get the root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  test: args.includes('--test'),
  dryRun: args.includes('--dry-run'),
  autoCommit: args.includes('--auto-commit'),
  skipPush: args.includes('--skip-push'),
  skipUrlCheck: args.includes('--skip-url-check'),
  force: args.includes('--force'),
  help: args.includes('--help') || args.includes('-h')
};

// Filter out option flags from arguments
const filteredArgs = args.filter(arg => !arg.startsWith('--'));
const title = filteredArgs[0];
const description = filteredArgs[1];

/**
 * Display help information
 */
function showHelp() {
  logger.info(`
PR Creation Script

Usage:
  node scripts/create-pr.js [options] [PR-Title] [PR-Description]

Options:
  --test               Test mode - validate all checks without creating PR
  --dry-run            Show what would happen without executing commands
  --auto-commit        Automatically commit uncommitted changes
  --skip-push          Skip pushing to remote
  --skip-url-check     Skip checking for preview URLs
  --force              Force PR creation even from main branch
  --help, -h           Show this help message

Examples:
  node scripts/create-pr.js "Fix navigation bug" "This fixes the responsive navigation issues on mobile"
  node scripts/create-pr.js --test
  node scripts/create-pr.js --dry-run "Test PR" "Testing PR creation"
  node scripts/create-pr.js --auto-commit "Quick fix" "Fixed typo in docs"
`);
}

/**
 * Execute a shell command or simulate it in dry run mode
 * @param {string} command - Command to execute
 * @param {object} options - Options for execSync
 * @returns {string|null} Command output or null in dry run mode
 */
function executeCommand(command, options = {}) {
  if (options.dryRun || options.test) {
    logger.info(`DRY RUN: Would execute: ${command}`);
    return null;
  }
  try {
    return execSync(command, { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'], // Capture stderr as well
      ...options 
    });
  } catch (error) {
    // Log both stdout and stderr if available
    if (error.stdout) logger.debug('Command stdout:', error.stdout);
    if (error.stderr) logger.error('Command stderr:', error.stderr);
    throw error;
  }
}

function stageChanges() {
  try {
    logger.info('Staging changes...');
    const result = executeCommand('git add .');
    if (!result) {
      logger.warn('No changes to stage');
      return false;
    }
    return true;
  } catch (error) {
    if (error.message.includes('fatal: not a git repository')) {
      logger.error('Not a git repository. Please initialize git first.');
    } else {
      logger.error('Failed to stage changes:', error.message);
    }
    return false;
  }
}

function commitChanges(message) {
  try {
    logger.info('Committing changes...');
    // Escape special characters in the commit message
    const escapedMessage = message.replace(/"/g, '\\"');
    const result = executeCommand(`git commit -m "${escapedMessage}"`);
    if (!result) {
      logger.warn('No changes to commit');
      return false;
    }
    return true;
  } catch (error) {
    if (error.message.includes('nothing to commit')) {
      logger.warn('No changes to commit');
    } else if (error.message.includes('fatal: not a git repository')) {
      logger.error('Not a git repository. Please initialize git first.');
    } else {
      logger.error('Failed to commit changes:', error.message);
    }
    return false;
  }
}

function pushChanges() {
  try {
    logger.info('Pushing changes...');
    const result = executeCommand('git push');
    if (!result) {
      logger.warn('No changes to push');
      return false;
    }
    return true;
  } catch (error) {
    if (error.message.includes('fatal: not a git repository')) {
      logger.error('Not a git repository. Please initialize git first.');
    } else if (error.message.includes('no upstream branch')) {
      logger.error('No upstream branch set. Please set up tracking branch first.');
    } else {
      logger.error('Failed to push changes:', error.message);
    }
    return false;
  }
}

/**
 * Save preview URLs to a file for later use
 * 
 * @param {Object} urls - Object containing preview URLs
 * @returns {boolean} - Success or failure
 */
function savePreviewUrls(urls) {
  if (!urls || Object.keys(urls).length === 0) {
    return false;
  }

  try {
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const filePath = path.join(tempDir, 'preview-urls.json');
    fs.writeFileSync(filePath, JSON.stringify(urls, null, 2));
    logger.success(`Preview URLs saved to ${filePath}`);
    return true;
  } catch (error) {
    logger.error(`Failed to save preview URLs: ${error.message}`);
    return false;
  }
}

/**
 * Format duration in milliseconds to human readable string
 * @param {number} milliseconds - Duration in milliseconds
 * @returns {string} - Formatted duration
 */
function formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes === 0) {
    return `${seconds} seconds`;
  }
  
  return `${minutes} minute${minutes !== 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
}

/**
 * Get preview URLs from recent deployments
 * @returns {Promise<Object>} Object containing preview URLs
 */
async function getPreviewUrls() {
  const previewUrls = {};
  
  try {
    // Check for preview dashboard file
    const previewDashboardFile = 'preview-dashboard.html';
    if (fs.existsSync(previewDashboardFile)) {
      logger.info(`Found preview dashboard at ${previewDashboardFile}`);
    }
    
    // Check for preview URL in temp directory
    const tempDir = path.join(process.cwd(), 'temp');
    if (fs.existsSync(tempDir)) {
      // Look for reports with URLs
      const reportFiles = fs.readdirSync(tempDir)
        .filter(file => file.endsWith('.json') || file.endsWith('.txt'));
      
      for (const file of reportFiles) {
        try {
          const filePath = path.join(tempDir, file);
          const content = fs.readFileSync(filePath, 'utf8');
          
          // First check if it's a JSON file with URL info
          if (file.endsWith('.json')) {
            try {
              const jsonData = JSON.parse(content);
              // Check if it contains URL properties
              if (jsonData.previewUrl || jsonData.url || jsonData.adminUrl || 
                  jsonData.hoursUrl || jsonData.admin || jsonData.hours) {
                // Extract and store URLs
                if (jsonData.admin || jsonData.adminUrl) previewUrls.admin = jsonData.admin || jsonData.adminUrl;
                if (jsonData.hours || jsonData.hoursUrl) previewUrls.hours = jsonData.hours || jsonData.hoursUrl;
                if (jsonData.previewUrl) {
                  // If there's a generic preview URL, use it as a fallback
                  if (!previewUrls.admin) previewUrls.admin = jsonData.previewUrl;
                  if (!previewUrls.hours) previewUrls.hours = jsonData.previewUrl;
                }
              }
            } catch (e) {
              // Not a valid JSON file, will try regex instead
            }
          }
          
          // If we don't have URLs yet, try to extract them with regex
          if (!previewUrls.admin || !previewUrls.hours) {
            // Look for labeled URLs
            const adminMatch = content.match(/ADMIN:?\s+(https:\/\/[^\s,]+)/i);
            if (adminMatch && adminMatch[1]) {
              previewUrls.admin = adminMatch[1].trim();
            }
            
            const hoursMatch = content.match(/HOURS:?\s+(https:\/\/[^\s,]+)/i);
            if (hoursMatch && hoursMatch[1]) {
              previewUrls.hours = hoursMatch[1].trim();
            }
            
            // If still no labeled URLs, look for generic Firebase URLs
            if (!previewUrls.admin || !previewUrls.hours) {
              const genericUrlRegex = /(?:Project Console|Hosting URL|Web app URL):\s+(https:\/\/[^\s,]+)/gi;
              const urlMatches = [...content.matchAll(genericUrlRegex)];
              
              if (urlMatches.length > 0) {
                // Process the URLs and try to distinguish between admin and hours
                for (const match of urlMatches) {
                  const url = match[1].trim();
                  if (url.includes('admin') && !previewUrls.admin) {
                    previewUrls.admin = url;
                  } else if (url.includes('hours') && !previewUrls.hours) {
                    previewUrls.hours = url;
                  } else if (!previewUrls.admin) {
                    previewUrls.admin = url;
                  } else if (!previewUrls.hours) {
                    previewUrls.hours = url;
                  }
                }
              }
            }
          }
        } catch (error) {
          logger.debug(`Error processing file ${file}: ${error.message}`);
        }
      }
    }
    
    return previewUrls;
  } catch (error) {
    logger.error(`Error looking for preview URLs: ${error.message}`);
    return {};
  }
}

/**
 * Create a GitHub PR using the GitHub CLI
 * @param {string} title - PR title
 * @param {string} description - PR description
 * @returns {Promise<Object>} Result of PR creation
 */
async function createGitHubPR(title, description) {
  let branch;
  try {
    // Check if GitHub CLI is installed
    executeCommand('gh --version', { stdio: 'pipe' });
    
    // Get current branch
    branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    
    // Create full description
    const fullDescription = `${description}\n\n## Changes\n- Tested with preview deployment\n- Ready for review`;
    
    // Create PR command
    const createPrCommand = `gh pr create --base main --head ${branch} --title "${title}" --body "${fullDescription}"`;
    
    // Execute command
    executeCommand(createPrCommand, { 
      stdio: 'inherit',
      cwd: rootDir
    });
    
    // Get PR URL
    const prUrl = execSync('gh pr view --json url -q .url', { encoding: 'utf8' }).trim();
    
    // Open PR in browser
    logger.info('Opening PR in your browser...');
    executeCommand('gh pr view --web', { 
      stdio: 'inherit',
      cwd: rootDir
    });
    
    return {
      success: true,
      url: prUrl
    };
  } catch (error) {
    // Fallback to instructions if GitHub CLI is not available
    logger.warn('GitHub CLI not available or error creating PR.');
    logger.info('\nPlease create a PR manually:');
    logger.info('1. Go to: https://github.com/yourusername/time-tracking-2.0/pull/new/main');
    logger.info(`2. Select your branch: ${branch || 'your-feature-branch'}`);
    logger.info(`3. Use title: ${title}`);
    logger.info('4. Add preview URLs to the description');
    logger.info('5. Submit the PR');
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Main function to create the PR
 */
async function createPR() {
  const state = getWorkflowState();
  const startTime = Date.now();
  
  try {
    // Initialize state and monitoring
    state.startOperation('create-pr');
    performanceMonitor.startOperation('create-pr');
    progressTracker.initProgress(4, 'Pull Request Creation');
    
    // Show help and exit if requested
    if (options.help) {
      showHelp();
      return 0;
    }

    logger.sectionHeader('Creating Pull Request' + (options.test ? ' (TEST MODE)' : '') + (options.dryRun ? ' (DRY RUN)' : ''));
    
    // Get current branch
    progressTracker.startStep('Branch Validation');
    logger.info('Getting current branch...');
    const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    logger.success(`Current branch: ${branch}`);
    
    // Check if we're on main branch
    if (branch === 'main' || branch === 'master') {
      if (!options.force) {
        throw new Error('You are on the main branch. PRs should be created from feature branches.');
      } else {
        logger.warn('Creating PR from main branch because --force was specified.');
      }
    }
    progressTracker.completeStep(true, 'Branch validation passed');
    
    // Make sure we have latest changes committed
    progressTracker.startStep('Git State Check');
    logger.info('Checking for uncommitted changes...');
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    if (status) {
      logger.warn('You have uncommitted changes:');
      console.log(status);
      
      // Handle temp file changes
      const changes = status.split('\n');
      const tempFileChanges = changes.filter(change => {
        if (!change.startsWith('D')) return false;
        const filename = change.substring(2).trim();
        return filename === '.env.build' || 
               filename === 'preview-dashboard.html' || 
               filename.startsWith('temp/');
      });
      
      if (tempFileChanges.length > 0) {
        logger.info('Detected temporary file tracking changes from gitignore updates.');
        
        if (tempFileChanges.length !== changes.length) {
          logger.info('Will auto-commit only the temporary file changes, leaving other changes untouched.');
          
          if (!options.dryRun && !options.test) {
            try {
              for (const change of tempFileChanges) {
                const filename = change.substring(2).trim();
                execSync(`git add -u "${filename}"`, { stdio: 'pipe' });
              }
              
              execSync(`git commit -m "chore: Remove temporary files from Git tracking"`, { stdio: 'inherit' });
              logger.success('Temporary file changes committed automatically.');
              logger.info('Note: You still have other uncommitted changes that need handling.');
            } catch (error) {
              throw new Error(`Failed to commit temporary files: ${error.message}`);
            }
          }
        }
      }
      
      if (!options.autoCommit) {
        throw new Error('You have uncommitted changes. Use --auto-commit to commit them automatically.');
      }
    }
    progressTracker.completeStep(true, 'Git state validated');
    
    // Check for preview URLs
    progressTracker.startStep('Preview URL Check');
    if (!options.skipUrlCheck) {
      const previewUrls = await getPreviewUrls();
      if (!previewUrls || Object.keys(previewUrls).length === 0) {
        throw new Error('No preview URLs found. Please run the workflow first to generate previews.');
      }
      logger.success('Preview URLs found:', previewUrls);
    } else {
      logger.info('Skipping preview URL check as requested');
    }
    progressTracker.completeStep(true, 'Preview URLs validated');
    
    // Create the PR
    progressTracker.startStep('PR Creation');
    if (!options.dryRun && !options.test) {
      const prResult = await createGitHubPR(title, description);
      if (!prResult.success) {
        throw new Error(`Failed to create PR: ${prResult.error}`);
      }
      logger.success('Pull request created successfully!');
      logger.info(`PR URL: ${prResult.url}`);
    } else {
      logger.info('DRY RUN: Would create PR with:');
      logger.info(`Title: ${title}`);
      logger.info(`Description: ${description}`);
    }
    progressTracker.completeStep(true, 'PR created successfully');
    
    // Complete PR creation
    const duration = Date.now() - startTime;
    state.completeOperation('create-pr', {
      success: true,
      duration,
      metrics: performanceMonitor.getPerformanceSummary()
    });
    
    progressTracker.finishProgress(true, 'PR creation completed successfully');
    logger.success(`PR creation completed in ${formatDuration(duration)}`);
    return 0;

  } catch (error) {
    const duration = Date.now() - startTime;
    state.completeOperation('create-pr', {
      success: false,
      duration,
      error: error.message
    });
    
    progressTracker.finishProgress(false, `PR creation failed: ${error.message}`);
    logger.error('PR creation failed:', error.message);
    
    // Handle different error types
    if (error instanceof ValidationError) {
      logger.error('Validation error:', error.message);
    } else if (error instanceof WorkflowError) {
      logger.error('Workflow error:', error.message);
    }
    
    return 1;
  }
}

/**
 * Simple function to get user input
 * @returns {Promise<string>} User input
 */
function getUserInput(prompt, defaultValue) {
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (data) => {
      process.stdin.pause();
      const response = data.trim();
      resolve(response || defaultValue);
    });
  });
}

// Run the main function
try {
  const exitCode = await createPR();
  process.exit(exitCode);
} catch (error) {
  console.error('Unexpected error:', error);
  process.exit(1);
} 