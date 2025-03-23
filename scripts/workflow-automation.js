#!/usr/bin/env node

/**
 * Workflow Automation Script
 * 
 * This script automates the complete development workflow:
 * 1. Creates a new feature branch from main
 * 2. Prompts for commit message and commits changes
 * 3. Runs preview deployment
 * 4. Suggests PR title and description based on changes
 * 5. Creates a PR if desired
 * 
 * Usage:
 *   node scripts/workflow-automation.js
 *   # or use the npm script:
 *   # pnpm run workflow
 */

/* global console, process */

import { execSync } from 'child_process';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as logger from './core/logger.js';

// Get the root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const gitignoreFixerPath = path.join(__dirname, 'fix-gitignore.js');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Prompt the user with a question and return their answer
 * @param {string} question - The question to ask
 * @returns {Promise<string>} - The user's answer
 */
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Execute a shell command and return its output
 * @param {string} command - The command to execute
 * @param {object} options - Options for execSync
 * @returns {object} - The command output and success status
 */
function executeCommand(command, options = {}) {
  try {
    const output = execSync(command, { encoding: 'utf8', ...options });
    return { 
      success: true, 
      output, 
      error: null 
    };
  } catch (error) {
    if (!options.suppressErrors) {
      logger.error(`Command failed: ${command}`);
      logger.error(error.message);
    }
    
    // Don't exit process on error unless explicitly requested
    if (options.exitOnError === true) {
      process.exit(1);
    }
    
    return { 
      success: false, 
      output: error.stdout || '', 
      error: error 
    };
  }
}

/**
 * Check if there are uncommitted changes
 * @returns {boolean} - True if there are uncommitted changes
 */
function hasUncommittedChanges() {
  const result = executeCommand('git status --porcelain', { suppressErrors: true });
  return result.success && result.output.trim() !== '';
}

/**
 * Get the current branch name
 * @returns {string} - The current branch name
 */
function getCurrentBranch() {
  const result = executeCommand('git branch --show-current', { suppressErrors: true });
  return result.success ? result.output.trim() : 'unknown';
}

/**
 * Create a feature branch name from description
 * @param {string} description - Description of the feature
 * @returns {string} - A valid branch name
 */
function createBranchName(description) {
  // Convert to lowercase, replace spaces with dashes, remove special chars
  return 'feature/' + description.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')  // Remove special characters
    .replace(/\s+/g, '-')          // Replace spaces with dashes
    .replace(/-+/g, '-')           // Replace multiple dashes with single dash
    .substr(0, 40);                // Limit length
}

/**
 * Generate a PR description suggestion based on changed files
 * @returns {object} - Suggested title and description
 */
function suggestPRContent() {
  try {
    // Get modified files
    const filesResult = executeCommand('git diff --name-only HEAD', { suppressErrors: true });
    const modifiedFiles = filesResult.success ? filesResult.output.trim().split('\n') : [];
    
    // Get commit messages since branching from main
    const commitsResult = executeCommand('git log --pretty=format:"%s" HEAD ^main', { suppressErrors: true });
    const commitMessages = commitsResult.success ? commitsResult.output.trim().split('\n') : [];
    
    // Find most affected directories or file types
    const directories = {};
    const fileTypes = {};
    
    modifiedFiles.forEach(file => {
      // Skip empty lines
      if (!file) return;
      
      // Count directories
      const dir = path.dirname(file);
      directories[dir] = (directories[dir] || 0) + 1;
      
      // Count file types
      const ext = path.extname(file);
      if (ext) {
        fileTypes[ext] = (fileTypes[ext] || 0) + 1;
      }
    });
    
    // Find most frequent directory and file type
    const topDir = Object.entries(directories).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const topFileType = Object.entries(fileTypes).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    
    // Generate title suggestion
    let titleSuggestion = '';
    if (commitMessages.length === 1 && commitMessages[0] !== '') {
      // Use the single commit message
      titleSuggestion = commitMessages[0];
    } else if (topDir && topDir !== '.') {
      // Base it on directory
      titleSuggestion = `Update ${topDir} ${topFileType ? `(${topFileType.replace('.', '')})` : ''}`;
    } else if (topFileType) {
      // Base it on file type
      titleSuggestion = `Update ${topFileType.replace('.', '')} files`;
    } else {
      titleSuggestion = "Update project files";
    }
    
    // Generate description suggestion
    let descriptionSuggestion = "## Changes\n\n";
    
    // Add file changes summary
    if (modifiedFiles.length > 0 && modifiedFiles[0] !== '') {
      descriptionSuggestion += "### Modified Files\n";
      // Group by directory for cleaner presentation
      const filesByDir = {};
      modifiedFiles.forEach(file => {
        if (!file) return;
        const dir = path.dirname(file);
        if (!filesByDir[dir]) filesByDir[dir] = [];
        filesByDir[dir].push(path.basename(file));
      });
      
      // Add files grouped by directory
      Object.entries(filesByDir).forEach(([dir, files]) => {
        descriptionSuggestion += `- ${dir === '.' ? 'Root' : dir}: ${files.join(', ')}\n`;
      });
    }
    
    // Add commit messages if there are multiple
    if (commitMessages.length > 1 && commitMessages[0] !== '') {
      descriptionSuggestion += "\n### Commit History\n";
      commitMessages.forEach(msg => {
        if (msg) descriptionSuggestion += `- ${msg}\n`;
      });
    }
    
    return {
      title: titleSuggestion,
      description: descriptionSuggestion
    };
  } catch (error) {
    logger.warn("Could not generate PR suggestion:", error.message);
    return {
      title: "Update project files",
      description: "## Changes\n\nImplemented new features and fixed issues."
    };
  }
}

/**
 * Check for and fix .gitignore issues
 */
async function fixGitignoreIssues() {
  logger.info("Checking .gitignore configuration...");
  
  try {
    // Check if the fixer script exists
    if (fs.existsSync(gitignoreFixerPath)) {
      await import('./fix-gitignore.js');
      return true;
    } else {
      logger.warn("Gitignore fixer script not found. Temp files may not be properly ignored.");
      return false;
    }
  } catch (error) {
    logger.warn("Could not run gitignore fixer:", error.message);
    return false;
  }
}

/**
 * Check for and commit gitignore-related changes
 * This ensures that temporary files removed from git tracking are committed
 * before proceeding with PR creation
 */
async function commitGitignoreChanges() {
  // Check if there are uncommitted changes
  if (hasUncommittedChanges()) {
    // Get status to see what kind of changes we have
    const statusResult = executeCommand('git status --porcelain');
    const changes = statusResult.output.trim().split('\n');
    
    // Filter for temp file deletions
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
    
    // If we have temp file changes, commit them automatically
    if (tempFileChanges.length > 0) {
      // If there are other changes, we need to stage only the temp files
      if (tempFileChanges.length !== changes.length) {
        logger.info("Auto-committing only temporary file tracking changes...");
        
        // Stage only the temporary files for deletion
        for (const change of tempFileChanges) {
          const filename = change.substring(2).trim();
          executeCommand(`git add -u "${filename}"`, { suppressErrors: true });
        }
        
        // Commit only the staged changes
        executeCommand('git commit -m "chore: Update gitignore and remove temporary files from tracking"');
        
        logger.success("Temporary file changes committed automatically");
        logger.info("Note: Other uncommitted changes were left untouched");
      } else {
        // All changes are temp files, can commit everything
        logger.info("Auto-committing temporary file tracking changes...");
        
        // Commit the changes
        executeCommand('git add .');
        executeCommand('git commit -m "chore: Update gitignore and remove temporary files from tracking"');
        
        logger.success("Temporary file changes committed automatically");
      }
      return true;
    }
  }
  
  return false;
}

/**
 * Create PR with better error handling
 */
async function createPullRequest(title, description) {
  logger.sectionHeader('CREATING PULL REQUEST');
  logger.info(`Creating PR with title: ${title}`);
  
  try {
    const result = executeCommand(`pnpm run pr:create-with-title "${title}" "${description}"`, { 
      stdio: 'inherit',
      suppressErrors: true,
      exitOnError: false
    });
    
    if (!result.success) {
      // PR creation failed, check for specific errors
      if (result.output.includes("You have uncommitted changes")) {
        logger.error("PR creation failed due to uncommitted changes.");
        
        // Offer to auto-commit
        const shouldAutoCommit = await prompt("Would you like to automatically commit these changes? (Y/n): ");
        
        if (shouldAutoCommit.toLowerCase() !== 'n') {
          logger.info("Auto-committing changes...");
          const autoCommitResult = executeCommand(`pnpm run pr:auto-commit "${title}" "${description}"`, { 
            stdio: 'inherit',
            suppressErrors: false
          });
          
          if (autoCommitResult.success) {
            logger.success("PR created successfully with auto-commit!");
            return true;
          } else {
            logger.error("Auto-commit failed. Please commit your changes manually.");
            return false;
          }
        } else {
          logger.info("You can manually commit your changes and then create a PR.");
          return false;
        }
      } else if (result.output.includes("a pull request for branch") && result.output.includes("already exists")) {
        // PR already exists
        const prUrl = result.output.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/)?.[0];
        
        logger.warn("A pull request already exists for this branch.");
        if (prUrl) {
          logger.info(`Existing PR: ${prUrl}`);
          
          // Offer to update the PR title/description
          const shouldUpdate = await prompt("Would you like to update the existing PR? (y/N): ");
          
          if (shouldUpdate.toLowerCase() === 'y') {
            logger.info("Use the GitHub website to update the PR details.");
            
            // Try to open the PR URL in browser
            try {
              const openCmd = process.platform === 'win32' ? 'start' : 
                process.platform === 'darwin' ? 'open' : 'xdg-open';
              executeCommand(`${openCmd} ${prUrl}`);
              logger.success("Opened PR in browser for editing.");
            } catch (error) {
              logger.info(`Please visit ${prUrl} to update the PR.`);
            }
          }
        }
        return true; // PR exists, so technically "success"
      } else {
        logger.error("PR creation failed for an unknown reason.");
        return false;
      }
    } else {
      logger.success("PR created successfully!");
      return true;
    }
  } catch (error) {
    logger.error("Failed to create PR:", error.message);
    return false;
  }
}

/**
 * Sync main branch with remote
 */
async function syncMainBranch() {
  logger.sectionHeader('SYNCING MAIN BRANCH');
  logger.info("Updating local 'main' branch with remote changes...");
  
  const currentBranch = getCurrentBranch();
  
  // If already on main, just pull
  if (currentBranch === 'main' || currentBranch === 'master') {
    const result = executeCommand('git pull origin main', { stdio: 'inherit' });
    if (result.success) {
      logger.success("Main branch updated successfully!");
      return true;
    } else {
      logger.error("Failed to update main branch.");
      return false;
    }
  }
  
  // Check for uncommitted changes before switching to main
  if (hasUncommittedChanges()) {
    logger.warn("You have uncommitted changes that would be affected by switching branches.");
    
    // Offer to commit, stash, or abort
    logger.info("\nOptions:");
    logger.info("1. Commit changes before switching");
    logger.info("2. Stash changes temporarily");
    logger.info("3. Cancel syncing main branch");
    
    const choice = await prompt("Choose an option (1/2/3): ");
    
    if (choice === "1") {
      // Commit changes
      const commitMessage = await prompt("Enter commit message: ");
      if (!commitMessage) {
        logger.error("Commit message is required.");
        return false;
      }
      
      executeCommand('git add .');
      const commitResult = executeCommand(`git commit -m "${commitMessage}"`);
      
      if (!commitResult.success) {
        logger.error("Failed to commit changes.");
        return false;
      }
    } else if (choice === "2") {
      // Stash changes
      const stashResult = executeCommand('git stash push -m "Stashed before syncing main"');
      if (!stashResult.success) {
        logger.error("Failed to stash changes.");
        return false;
      }
      logger.info("Changes stashed successfully. Use 'git stash pop' to restore them later.");
    } else {
      logger.info("Sync cancelled.");
      return false;
    }
  }
  
  // Switch to main and pull
  const checkoutResult = executeCommand('git checkout main');
  if (!checkoutResult.success) {
    logger.error("Failed to checkout main branch.");
    return false;
  }
  
  const pullResult = executeCommand('git pull origin main', { stdio: 'inherit' });
  if (!pullResult.success) {
    logger.error("Failed to pull latest changes from remote.");
    return false;
  }
  
  logger.success("Main branch updated successfully!");
  
  // Ask if they want to go back to the previous branch
  const goBackToBranch = await prompt(`Would you like to switch back to '${currentBranch}'? (Y/n): `);
  if (goBackToBranch.toLowerCase() !== 'n') {
    const switchBackResult = executeCommand(`git checkout ${currentBranch}`);
    if (switchBackResult.success) {
      logger.success(`Switched back to branch: ${currentBranch}`);
    } else {
      logger.error(`Failed to switch back to branch: ${currentBranch}`);
    }
  }
  
  return true;
}

/**
 * Main workflow function
 */
async function runWorkflow() {
  try {
    logger.sectionHeader('AUTOMATED DEVELOPMENT WORKFLOW');
    
    // Step 1: Check current branch
    const currentBranch = getCurrentBranch();
    logger.info(`Current branch: ${currentBranch}`);
    
    let branchName = currentBranch;
    let createdNewBranch = false;
    
    // Check if they want to sync main first
    if (currentBranch !== 'main' && currentBranch !== 'master') {
      const shouldSyncMain = await prompt("Would you like to sync your local main branch with remote first? (y/N): ");
      if (shouldSyncMain.toLowerCase() === 'y') {
        await syncMainBranch();
      }
    }
    
    // If on main, create a new feature branch
    if (currentBranch === 'main' || currentBranch === 'master') {
      logger.info("You're on the main branch. Let's create a feature branch.");
      
      // Ask for feature description
      const featureDescription = await prompt("What are you working on? (brief description for branch name): ");
      if (!featureDescription) {
        logger.error("Feature description is required to create a branch name.");
        rl.close();
        return;
      }
      
      // Create branch name
      branchName = createBranchName(featureDescription);
      logger.info(`Creating new branch: ${branchName}`);
      
      // Create and checkout branch
      try {
        // Make sure main is up to date
        logger.info("Updating main branch from remote...");
        executeCommand('git pull origin main');
        
        // Create and checkout new branch
        executeCommand(`git checkout -b ${branchName}`);
        logger.success(`Created and switched to branch: ${branchName}`);
        createdNewBranch = true;
      } catch (error) {
        logger.error("Failed to create branch:", error.message);
        rl.close();
        return;
      }
    } else {
      logger.info(`Continuing work on existing branch: ${branchName}`);
      
      // Option to switch to a different branch
      const switchBranch = await prompt("Would you like to switch to a different branch? (y/N): ");
      if (switchBranch.toLowerCase() === 'y') {
        // List available branches
        logger.info("\nAvailable branches:");
        console.log(executeCommand('git branch'));
        
        const newBranch = await prompt("Enter branch name to switch to (or press enter to stay on current branch): ");
        if (newBranch && newBranch !== currentBranch) {
          // Check for uncommitted changes before switching
          if (hasUncommittedChanges()) {
            logger.warn("You have uncommitted changes that would be lost when switching branches.");
            logger.info("Modified files:");
            console.log(executeCommand('git status --short'));
            
            logger.info("\nOptions:");
            logger.info("1. Commit changes before switching");
            logger.info("2. Stash changes temporarily");
            logger.info("3. Stay on current branch");
            
            const handleChanges = await prompt("Choose an option (1/2/3): ");
            
            if (handleChanges === "1") {
              // Commit changes first
              let defaultMessage = `Changes before switching to ${newBranch}`;
              const commitMessage = await prompt(`Enter commit message [${defaultMessage}]: `);
              const finalMessage = commitMessage || defaultMessage;
              
              // Commit changes
              executeCommand('git add .');
              executeCommand(`git commit -m "${finalMessage}"`);
              logger.success("Changes committed successfully.");
              
              // Now safe to switch
              try {
                executeCommand(`git checkout ${newBranch}`);
                branchName = newBranch;
                logger.success(`Switched to branch: ${branchName}`);
              } catch (error) {
                logger.error("Failed to switch branch:", error.message);
              }
            } else if (handleChanges === "2") {
              // Stash changes
              const stashName = `Stashed changes before switching to ${newBranch}`;
              try {
                executeCommand(`git stash push -m "${stashName}"`);
                logger.success("Changes stashed successfully.");
                
                // Switch branch
                executeCommand(`git checkout ${newBranch}`);
                branchName = newBranch;
                logger.success(`Switched to branch: ${branchName}`);
                
                // Ask if user wants to apply stash
                const applyStash = await prompt("Would you like to apply your stashed changes to this branch? (y/N): ");
                if (applyStash.toLowerCase() === 'y') {
                  try {
                    executeCommand('git stash apply stash@{0}');
                    logger.success("Stashed changes applied successfully.");
                    
                    // Warn if there are conflicts
                    if (executeCommand('git status').includes('Unmerged')) {
                      logger.warn("There are merge conflicts. Please resolve them before continuing.");
                    }
                  } catch (error) {
                    logger.error("Failed to apply stash:", error.message);
                    logger.info("You can apply it manually later with 'git stash apply'");
                  }
                } else {
                  logger.info("Your changes remain stashed. Use 'git stash list' to see stashed changes");
                  logger.info("and 'git stash apply' to apply them later.");
                }
              } catch (error) {
                logger.error("Failed to stash changes:", error.message);
              }
            } else {
              // Stay on current branch
              logger.info(`Staying on current branch: ${currentBranch}`);
            }
          } else {
            // No uncommitted changes, safe to switch
            try {
              executeCommand(`git checkout ${newBranch}`);
              branchName = newBranch;
              logger.success(`Switched to branch: ${branchName}`);
            } catch (error) {
              logger.error("Failed to switch branch:", error.message);
            }
          }
        }
      }
    }
    
    // Step 2: Check for uncommitted changes and offer to commit
    if (hasUncommittedChanges()) {
      logger.info("You have uncommitted changes.");
      logger.info("Modified files:");
      console.log(executeCommand('git status --short'));
      
      const shouldCommit = await prompt("Would you like to commit these changes? (Y/n): ");
      if (shouldCommit.toLowerCase() !== 'n') {
        // Default commit message based on branch name
        let defaultMessage = branchName.replace('feature/', '').replace(/-/g, ' ');
        defaultMessage = defaultMessage.charAt(0).toUpperCase() + defaultMessage.slice(1);
        
        const commitMessage = await prompt(`Enter commit message [${defaultMessage}]: `);
        const finalMessage = commitMessage || defaultMessage;
        
        // Commit changes
        executeCommand('git add .');
        executeCommand(`git commit -m "${finalMessage}"`);
        logger.success("Changes committed successfully.");
      }
    } else if (createdNewBranch) {
      logger.info("No changes to commit on the new branch yet.");
    } else {
      logger.info("No uncommitted changes detected.");
    }
    
    // Step 3: Fix gitignore issues
    await fixGitignoreIssues();
    
    // New Step: Auto-commit any changes made by gitignore fixer
    await commitGitignoreChanges();
    
    // Step 4: Run preview deployment
    logger.sectionHeader('RUNNING PREVIEW DEPLOYMENT');
    logger.info("Starting preview deployment. This may take a few minutes...");
    
    try {
      // Run preview with output streaming to console
      executeCommand('pnpm run preview', { stdio: 'inherit' });
      
      // Check if preview was successful
      logger.success("Preview deployment completed!");
      
      // Open dashboard if available
      if (fs.existsSync(path.join(rootDir, 'preview-dashboard.html'))) {
        logger.info("Opening preview dashboard...");
        
        // Different commands based on OS
        try {
          if (process.platform === 'win32') {
            executeCommand('start preview-dashboard.html');
          } else if (process.platform === 'darwin') {
            executeCommand('open preview-dashboard.html');
          } else {
            executeCommand('xdg-open preview-dashboard.html');
          }
        } catch (error) {
          logger.warn("Could not automatically open dashboard. Please open preview-dashboard.html manually.");
        }
      }
      
      // Step 5: Offer to create a PR
      const shouldCreatePR = await prompt("Would you like to create a pull request? (Y/n): ");
      if (shouldCreatePR.toLowerCase() !== 'n') {
        // Generate PR title and description suggestions
        logger.info("Generating PR title and description suggestions based on your changes...");
        const suggestion = suggestPRContent();
        
        // Ask for PR title with suggestion
        const prTitle = await prompt(`Enter PR title [${suggestion.title}]: `);
        const finalTitle = prTitle || suggestion.title;
        
        // Show suggested description
        logger.info("Suggested PR description:");
        console.log("------------------------");
        console.log(suggestion.description);
        console.log("------------------------");
        
        // Ask if user wants to use suggestion or provide custom
        const useDefault = await prompt("Use this description? (Y/n): ");
        let finalDescription = suggestion.description;
        
        if (useDefault.toLowerCase() === 'n') {
          logger.info("Enter your PR description (end with a line containing only 'END'):");
          let customDescription = "";
          let line;
          while ((line = await prompt("")) !== "END") {
            customDescription += line + "\n";
          }
          finalDescription = customDescription;
        }
        
        // Create PR with better error handling
        const prSuccess = await createPullRequest(finalTitle, finalDescription);
        
        // If PR was successful, offer guidance on post-PR workflow
        if (prSuccess) {
          logger.sectionHeader('AFTER PR IS MERGED');
          logger.info("After your PR is merged on GitHub, follow these steps:");
          logger.info("1. Switch to main branch: git checkout main");
          logger.info("2. Pull latest changes: git pull origin main");
          logger.info("3. Start a new feature with: pnpm run workflow:new");
          logger.info("\nYou can run 'pnpm run sync-main' at any time to update your local main branch.");
        }
      }
    } catch (error) {
      logger.error("Preview deployment failed:", error.message);
      logger.info("Review the error message above and fix any issues before trying again.");
    }
    
    // Provide next steps
    logger.sectionHeader('NEXT STEPS');
    logger.info(`You are on branch: ${branchName}`);
    logger.info("What would you like to do next?");
    logger.info("1. Continue working on this branch");
    logger.info("2. Run preview deployment again: pnpm run preview");
    logger.info("3. Create/update PR: pnpm run pr:create");
    logger.info("4. Switch to main branch: git checkout main");
    logger.info("5. Sync main with remote: pnpm run sync-main");
    
    // Final prompt - this is just for UX completion, no action needed
    await prompt("Press Enter to exit...");
    
    rl.close();
  } catch (error) {
    logger.error("Workflow automation failed:", error.message);
    rl.close();
    process.exit(1);
  }
}

// Run the workflow
runWorkflow(); 