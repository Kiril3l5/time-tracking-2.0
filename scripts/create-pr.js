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
import * as logger from './core/logger.js';

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
  return execSync(command, { encoding: 'utf8', ...options });
}

/**
 * Main function to create the PR
 */
async function createPR() {
  try {
    // Show help and exit if requested
    if (options.help) {
      showHelp();
      return 0;
    }

    logger.sectionHeader('Creating Pull Request' + (options.test ? ' (TEST MODE)' : '') + (options.dryRun ? ' (DRY RUN)' : ''));
    
    // Get current branch
    logger.info('Getting current branch...');
    const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    logger.success(`Current branch: ${branch}`);
    
    // Check if we're on main branch
    if (branch === 'main' || branch === 'master') {
      if (!options.force) {
        logger.error('You are on the main branch. PRs should be created from feature branches.');
        logger.info('Options:');
        logger.info('1. Switch to a feature branch:');
        logger.info('   git checkout -b feature/your-feature-name');
        logger.info('2. Use --force to override this check:');
        logger.info('   node scripts/create-pr.js --force "Your PR title"');
        return 1;
      } else {
        logger.warn('Creating PR from main branch because --force was specified.');
      }
    }
    
    // Make sure we have latest changes committed
    logger.info('Checking for uncommitted changes...');
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    if (status) {
      logger.warn('You have uncommitted changes:');
      console.log(status);
      
      if (options.autoCommit) {
        logger.info('Auto-commit option detected, committing changes...');
        const commitMessage = title || `Auto-commit changes for PR from ${branch}`;
        
        if (!options.dryRun && !options.test) {
          try {
            execSync('git add .', { stdio: 'inherit' });
            execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
            logger.success('Changes committed successfully.');
          } catch (error) {
            logger.error(`Failed to commit changes: ${error.message}`);
            return 1;
          }
        } else {
          logger.info(`DRY RUN: Would auto-commit changes with message: "${commitMessage}"`);
        }
      } else {
        logger.error('You have uncommitted changes. Please commit them first:');
        logger.info('Tip: Run the following commands to commit your changes:');
        logger.info('  git add .');
        logger.info('  git commit -m "Your commit message"');
        logger.info('');
        logger.info('Alternatively, use --auto-commit to commit changes automatically:');
        logger.info('  node scripts/create-pr.js --auto-commit "Your PR title"');
        return 1;
      }
    } else {
      logger.success('No uncommitted changes found.');
    }
    
    // Push branch to remote if not skipped
    if (!options.skipPush) {
      logger.info(`Pushing branch '${branch}' to remote...`);
      try {
        executeCommand(`git push -u origin ${branch}`, { 
          stdio: 'inherit',
          dryRun: options.dryRun,
          test: options.test
        });
        
        if (!options.dryRun && !options.test) {
          logger.success('Branch pushed to remote.');
        }
      } catch (error) {
        if (!options.dryRun && !options.test) {
          logger.error(`Failed to push branch: ${error.message}`);
          logger.info('Please push your branch manually and try again:');
          logger.info(`  git push -u origin ${branch}`);
          return 1;
        }
      }
    } else {
      logger.info('Skipping push to remote (--skip-push specified)');
    }
    
    // Get PR title and description
    const prTitle = title || `Deploy ${branch} to production`;
    const prDescription = description || 'This PR has been tested with preview deployment and is ready for review.';
    
    // Extract preview URLs
    let previewUrls = '';
    let previewDashboardPath = '';
    
    if (!options.skipUrlCheck) {
      logger.info('Looking for preview URLs from recent deployments...');
      
      try {
        // First check if dashboard exists
        previewDashboardPath = path.join(rootDir, 'preview-dashboard.html');
        let dashboardExists = fs.existsSync(previewDashboardPath);
        
        // Next check temp directory
        const tempDir = path.join(rootDir, 'temp');
        if (fs.existsSync(tempDir)) {
          const files = fs.readdirSync(tempDir);
          
          // Look for JSON reports that might contain URLs
          const reportFiles = files.filter(f => f.endsWith('.json'));
          
          if (reportFiles.length > 0) {
            // Try to find preview URLs in reports
            for (const file of reportFiles) {
              try {
                const content = fs.readFileSync(path.join(tempDir, file), 'utf8');
                const data = JSON.parse(content);
                
                // Different reports may store URLs in different places
                // This is a simplified example - enhance based on your actual report structure
                if (data.previewUrls || data.urls) {
                  const urls = data.previewUrls || data.urls;
                  if (urls.admin && urls.hours) {
                    previewUrls = `\n\n## Preview URLs\n- Admin: ${urls.admin}\n- Hours: ${urls.hours}`;
                    logger.success('Found preview URLs in reports!');
                    break;
                  }
                }
              } catch (e) {
                // Continue if one report has issues
                continue;
              }
            }
          }
          
          // If URLs not found in reports, try log files
          if (!previewUrls) {
            const logFiles = files.filter(f => f.endsWith('.log'));
            if (logFiles.length > 0) {
              // Get most recent log file
              const latestLog = logFiles.sort().reverse()[0];
              const content = fs.readFileSync(path.join(tempDir, latestLog), 'utf8');
              
              // Extract URLs using regex
              const adminMatch = content.match(/ADMIN:\s*(https:\/\/admin-autonomyhero.*?\.web\.app)/);
              const hoursMatch = content.match(/HOURS:\s*(https:\/\/hours-autonomyhero.*?\.web\.app)/);
              
              if (adminMatch && hoursMatch) {
                previewUrls = `\n\n## Preview URLs\n- Admin: ${adminMatch[1]}\n- Hours: ${hoursMatch[1]}`;
                logger.success('Found preview URLs in logs!');
              }
            }
          }
        }
        
        // If no URLs found but dashboard exists, reference it
        if (!previewUrls && dashboardExists) {
          previewUrls = `\n\n## Preview Information\nA preview dashboard has been generated locally. Check the 'preview-dashboard.html' file in the project root.`;
          logger.info('No specific URLs found, but preview dashboard exists.');
        }
        
        if (!previewUrls) {
          logger.warn('Could not find any preview URLs.');
          logger.info('You may need to run the preview deployment first:');
          logger.info('  pnpm run preview');
          
          if (!options.test && !options.dryRun) {
            // Ask for confirmation
            logger.info('\nDo you want to continue without preview URLs? (y/N)');
            const response = await getUserInput();
            if (response.toLowerCase() !== 'y') {
              logger.info('Cancelled. Please run a preview deployment first.');
              return 1;
            }
          } else {
            logger.info('In test mode, skipping confirmation and continuing.');
          }
        }
      } catch (e) {
        logger.warn('Could not extract preview URLs, continuing without them');
      }
    } else {
      logger.info('Skipping preview URL check (--skip-url-check specified)');
    }
    
    // Create the full PR description
    const fullDescription = `${prDescription}${previewUrls}\n\n## Changes\n- Tested with preview deployment\n- Ready for review`;
    
    // Create PR
    logger.info('Creating pull request...');
    logger.info(`Title: ${prTitle}`);
    logger.info(`Target: main <- ${branch}`);
    
    // Check if GitHub CLI is installed
    try {
      executeCommand('gh --version', { stdio: 'pipe', dryRun: options.dryRun, test: options.test });
      
      // Use GitHub CLI to create PR if not in test mode
      if (!options.test) {
        logger.info('Using GitHub CLI to create PR...');
        
        const createPrCommand = `gh pr create --base main --head ${branch} --title "${prTitle}" --body "${fullDescription}"`;
        
        if (options.dryRun) {
          logger.info(`DRY RUN: Would create PR with command: ${createPrCommand}`);
          logger.success('Pull request would be created with the above details.');
        } else {
          executeCommand(createPrCommand, { 
            stdio: 'inherit',
            cwd: rootDir,
            dryRun: options.dryRun
          });
          
          logger.success('Pull request created successfully!');
          
          // Open PR in browser
          logger.info('Opening PR in your browser...');
          executeCommand('gh pr view --web', { 
            stdio: 'inherit',
            cwd: rootDir,
            dryRun: options.dryRun
          });
        }
      } else {
        logger.success('TEST MODE: GitHub CLI is installed, PR creation would succeed.');
      }
    } catch (e) {
      // Fallback to instructions if GitHub CLI is not available
      logger.warn('GitHub CLI not available or error creating PR.');
      logger.info('\nPlease create a PR manually:');
      logger.info('1. Go to: https://github.com/yourusername/time-tracking-2.0/pull/new/main');
      logger.info(`2. Select your branch: ${branch}`);
      logger.info(`3. Use title: ${prTitle}`);
      logger.info('4. Add preview URLs to the description');
      logger.info('5. Submit the PR');
      
      if (options.test) {
        logger.info('TEST MODE: GitHub CLI is not available, manual PR creation would be required.');
      }
      
      if (!options.test && !options.dryRun) {
        return 1;
      }
    }
    
    return 0;
  } catch (error) {
    logger.error('Error creating PR:', error.message);
    return 1;
  }
}

/**
 * Simple function to get user input
 * @returns {Promise<string>} User input
 */
function getUserInput() {
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (data) => {
      process.stdin.pause();
      resolve(data.trim());
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