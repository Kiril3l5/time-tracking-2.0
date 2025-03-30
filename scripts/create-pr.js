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
      
      // Check if all changes are related to temporary files
      const changes = status.split('\n');
      const tempFileChanges = changes.filter(change => {
        // Look for deletions (lines starting with D)
        if (!change.startsWith('D')) return false;
        
        // Extract filename
        const filename = change.substring(2).trim();
        
        // Check if it's a temporary file
        return filename === '.env.build' || 
               filename === 'preview-dashboard.html' || 
               filename.startsWith('temp/');
      });
      
      // Handle temp file changes intelligently
      if (tempFileChanges.length > 0) {
        logger.info('Detected temporary file tracking changes from gitignore updates.');
        
        // If there are other non-temp changes, only commit the temp files
        if (tempFileChanges.length !== changes.length) {
          logger.info('Will auto-commit only the temporary file changes, leaving other changes untouched.');
          
          if (!options.dryRun && !options.test) {
            try {
              // Add only the temp files for deletion
              for (const change of tempFileChanges) {
                const filename = change.substring(2).trim();
                execSync(`git add -u "${filename}"`, { stdio: 'pipe' });
              }
              
              execSync(`git commit -m "chore: Remove temporary files from Git tracking"`, { stdio: 'inherit' });
              logger.success('Temporary file changes committed automatically.');
              logger.info('Note: You still have other uncommitted changes that need handling.');
              
              // Show remaining changes
              const remainingStatus = execSync('git status --short', { encoding: 'utf8' }).trim();
              if (remainingStatus) {
                logger.info('Remaining uncommitted changes:');
                console.log(remainingStatus);
                
                if (options.autoCommit) {
                  logger.info('Auto-commit option detected, also committing remaining changes...');
                  const commitMessage = title || `Auto-commit changes for PR from ${branch}`;
                  
                  execSync('git add .', { stdio: 'inherit' });
                  execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
                  logger.success('All changes committed successfully.');
                } else {
                  logger.error('Please commit your remaining changes before creating PR:');
                  logger.info('Tip: Run the following commands to commit your changes:');
                  logger.info('  git add .');
                  logger.info('  git commit -m "Your commit message"');
                  logger.info('');
                  logger.info('Alternatively, use --auto-commit to commit all changes automatically:');
                  logger.info('  node scripts/create-pr.js --auto-commit "Your PR title"');
                  return 1;
                }
              }
            } catch (error) {
              logger.error(`Failed to commit temporary file changes: ${error.message}`);
              return 1;
            }
          } else {
            logger.info(`DRY RUN: Would auto-commit only temporary file changes`);
            logger.warn('DRY RUN: Would still need to handle other uncommitted changes');
          }
        }
        // If all changes are temp files, commit everything
        else {
          logger.info('These changes will be auto-committed for convenience.');
          
          const commitMessage = "chore: Remove temporary files from Git tracking";
          
          if (!options.dryRun && !options.test) {
            try {
              execSync('git add .', { stdio: 'inherit' });
              execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
              logger.success('Temporary file changes committed automatically.');
            } catch (error) {
              logger.error(`Failed to commit temporary file changes: ${error.message}`);
              return 1;
            }
          } else {
            logger.info(`DRY RUN: Would auto-commit temporary file changes with message: "${commitMessage}"`);
          }
        }
      }
      else if (options.autoCommit) {
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
    
    // Look for preview URLs
    logger.info('Looking for preview URLs...');
    let foundPreviewUrls = false;
    
    // Try to find preview URLs from recent deployments
    const previewUrls = {};
    
    try {
      // Check for preview dashboard file
      const previewDashboardFile = 'preview-dashboard.html';
      if (fs.existsSync(previewDashboardFile)) {
        logger.info(`Found preview dashboard at ${previewDashboardFile}`);
        foundPreviewUrls = true;
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
                  foundPreviewUrls = true;
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
                foundPreviewUrls = true;
              }
              
              const hoursMatch = content.match(/HOURS:?\s+(https:\/\/[^\s,]+)/i);
              if (hoursMatch && hoursMatch[1]) {
                previewUrls.hours = hoursMatch[1].trim();
                foundPreviewUrls = true;
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
                      foundPreviewUrls = true;
                    } else if (url.includes('hours') && !previewUrls.hours) {
                      previewUrls.hours = url;
                      foundPreviewUrls = true;
                    } else if (!previewUrls.admin) {
                      previewUrls.admin = url;
                      foundPreviewUrls = true;
                    } else if (!previewUrls.hours) {
                      previewUrls.hours = url;
                      foundPreviewUrls = true;
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
      
      // If we found any preview URLs, save them
      if (Object.keys(previewUrls).length > 0) {
        logger.success('Found preview URLs:');
        if (previewUrls.admin) logger.info(`ADMIN: ${previewUrls.admin}`);
        if (previewUrls.hours) logger.info(`HOURS: ${previewUrls.hours}`);
        
        // Save the URLs for use in the dashboard
        savePreviewUrls(previewUrls);
      } else if (!foundPreviewUrls && !options.skipUrlCheck) {
        logger.warn('No preview URLs found.');
        if (!options.dryRun && !options.test) {
          const continueWithoutUrls = await getUserInput(
            'No preview URLs found. Continue with PR creation? (y/N): ',
            'n'
          );
          if (continueWithoutUrls.toLowerCase() !== 'y') {
            logger.error('PR creation aborted: No preview URLs found.');
            return 1;
          }
        }
      }
    } catch (error) {
      logger.error(`Error looking for preview URLs: ${error.message}`);
      if (!options.skipUrlCheck && !options.dryRun && !options.test) {
        const continueAfterError = await getUserInput(
          'Error looking for preview URLs. Continue with PR creation? (y/N): ',
          'n'
        );
        if (continueAfterError.toLowerCase() !== 'y') {
          logger.error('PR creation aborted due to URL check error.');
          return 1;
        }
      }
    }
    
    // Create the full PR description
    const fullDescription = `${prDescription}\n\n## Changes\n- Tested with preview deployment\n- Ready for review`;
    
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