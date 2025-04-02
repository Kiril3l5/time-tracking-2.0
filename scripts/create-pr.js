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
let prDescription = filteredArgs[1]; // Make this mutable for later changes

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
 * Check if GitHub CLI is installed and authenticated
 * @returns {boolean} Whether GitHub CLI is ready to use
 */
function checkGitHubAuth() {
  try {
    // Check if gh is installed
    executeCommand('gh --version', { stdio: 'pipe' });
    
    // Check if user is authenticated
    const authStatus = executeCommand('gh auth status', { stdio: 'pipe' });
    return authStatus && authStatus.includes('Logged in to');
  } catch (error) {
    logger.error('GitHub CLI error:', error.message);
    logger.info('To fix: Install GitHub CLI and authenticate with `gh auth login`');
    return false;
  }
}

/**
 * Creates a GitHub PR using the GitHub CLI
 * 
 * @param {string} title - PR title
 * @param {string} body - PR description
 * @returns {Promise<boolean>} - Success status
 */
async function createGitHubPR(title, body) {
  try {
    logger.info('Creating PR on GitHub...');
    
    // Verify authentication
    if (!checkGitHubAuth()) {
      throw new Error('GitHub authentication required');
    }
    
    // Push changes to remote
    logger.info('Pushing changes to remote...');
    if (!options.skipPush) {
      const branch = executeCommand('git branch --show-current', { encoding: 'utf8' }).trim();
      executeCommand(`git push -u origin ${branch}`, { stdio: 'inherit' });
    }
    
    // Create PR using GitHub CLI
    logger.info('Creating pull request...');
    const result = executeCommand(
      `gh pr create --title "${title}" --body "${body.replace(/"/g, '\\"')}"`, 
      { stdio: 'pipe' }
    );
    
    // Extract PR URL from result
    const prUrl = result.match(/(https:\/\/github\.com\/.*\/pull\/\d+)/);
    if (prUrl && prUrl[1]) {
      logger.success(`PR created successfully: ${prUrl[1]}`);
      
      // Open PR in browser if not in CI
      if (!process.env.CI) {
        executeCommand(`gh pr view --web`, { stdio: 'pipe' });
      }
    }
    
    return true;
  } catch (error) {
    logger.error('Failed to create PR:', error.message);
    
    if (error.message.includes('authentication')) {
      logger.info('Run `gh auth login` to authenticate with GitHub');
    } else if (error.message.includes('push')) {
      logger.info('Failed to push to remote. Check your network connection and GitHub access.');
    } else {
      logger.info('You can create the PR manually through the GitHub web interface.');
    }
    
    return false;
  }
}

/**
 * Main PR creation function
 */
async function createPR() {
  const startTime = Date.now();
  
  try {
    // Initialize monitoring
    performanceMonitor.startOperation('create-pr');
    progressTracker.initProgress(4, 'Pull Request Creation');
    
    // Show help and exit if requested
    if (options.help) {
      showHelp();
      return 0;
    }
    
    // Verify requirements
    progressTracker.updateProgress(1, 'Verifying requirements');
    
    // Check if title is provided
    if (!title && !options.test && !options.dryRun) {
      logger.error('PR title is required. Use --test or --dry-run to skip this check.');
      logger.info('Usage: node scripts/create-pr.js "Your PR title" "Optional description"');
      return 1;
    }
    
    // Ensure we're on a feature branch
    const currentBranch = executeCommand('git branch --show-current', { encoding: 'utf8' }).trim();
    if (!currentBranch) {
      logger.error('Could not determine current branch.');
      return 1;
    }
    
    if ((currentBranch === 'main' || currentBranch === 'master') && !options.force) {
      logger.error(`Cannot create PR from ${currentBranch} branch. Switch to a feature branch first or use --force.`);
      return 1;
    }
    
    // Check for uncommitted changes
    progressTracker.updateProgress(2, 'Checking for uncommitted changes');
    if (options.autoCommit) {
      const hasChanges = executeCommand('git status --porcelain', { encoding: 'utf8' }).trim();
      if (hasChanges) {
        logger.info('Auto-committing changes...');
        executeCommand('git add .', { stdio: 'inherit' });
        executeCommand(`git commit -m "Auto-commit for PR: ${title || 'Updates'}"`, { stdio: 'inherit' });
      }
    }
    
    // Get preview URLs if needed
    progressTracker.updateProgress(3, 'Checking for preview URLs');
    if (!options.skipUrlCheck) {
      const previewUrls = await getPreviewUrls();
      if (Object.keys(previewUrls).length > 0) {
        logger.success('Found preview URLs:');
        for (const [key, url] of Object.entries(previewUrls)) {
          logger.info(`  ${key}: ${url}`);
        }
        
        // Add preview URLs to description if not already present
        if (prDescription && !prDescription.includes('preview') && !prDescription.includes('Preview')) {
          const urlsText = Object.entries(previewUrls)
            .map(([key, url]) => `- ${key}: ${url}`)
            .join('\n');
          prDescription += `\n\nPreview URLs:\n${urlsText}`;
        }
      } else {
        logger.warn('No preview URLs found. Consider running a preview deployment first.');
      }
    }
    
    // Create PR
    progressTracker.updateProgress(4, 'Creating pull request');
    if (options.dryRun) {
      logger.info(`DRY RUN: Would create PR with title: "${title || 'No Title'}"`);
      logger.info(`DRY RUN: Description: "${prDescription || 'No Description'}"`);
      
      progressTracker.finishProgress(true, 'Dry run completed successfully');
      logger.success('PR creation simulation completed successfully');
      return 0;
    }
    
    if (options.test) {
      logger.info('TEST MODE: All checks passed, but PR will not be created.');
      
      progressTracker.finishProgress(true, 'Test completed successfully');
      logger.success('PR creation test completed successfully');
      return 0;
    }
    
    // Actually create the PR
    const success = await createGitHubPR(title, prDescription || '');
    
    // Complete PR creation
    const duration = Date.now() - startTime;
    
    progressTracker.finishProgress(success, success ? 'PR created successfully' : 'PR creation failed');
    logger.info(`PR creation ${success ? 'completed' : 'failed'} in ${formatDuration(duration)}`);
    return success ? 0 : 1;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    progressTracker.finishProgress(false, `PR creation failed: ${error.message}`);
    logger.error('PR creation failed:', error.message);
    
    // Handle different error types
    if (error instanceof ValidationError) {
      logger.error('Validation error:', error.message);
    } else if (error instanceof WorkflowError) {
      logger.error('Workflow error:', error.message);
    }
    
    return 1;
  } finally {
    performanceMonitor.endOperation('create-pr');
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