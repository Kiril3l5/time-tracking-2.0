#!/usr/bin/env node

/**
 * Sync Main Branch Script
 * 
 * This script synchronizes your local main branch with the remote repository.
 * It handles uncommitted changes by offering to commit or stash them.
 * 
 * Usage:
 *   node scripts/sync-main.js
 *   # or use the npm script:
 *   # pnpm run sync-main
 */

import { execSync } from 'child_process';
import readline from 'readline';
import { logger } from './core/logger.js';

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
 * Main function to sync the main branch
 */
async function syncMainBranch() {
  logger.sectionHeader('SYNCING MAIN BRANCH');
  logger.info("This utility synchronizes your local main branch with the remote repository.");
  
  try {
    const currentBranch = getCurrentBranch();
    logger.info(`Current branch: ${currentBranch}`);
    
    // If already on main, just pull
    if (currentBranch === 'main' || currentBranch === 'master') {
      logger.info("You're already on the main branch, pulling latest changes...");
      const result = executeCommand('git pull origin main', { stdio: 'inherit' });
      if (result.success) {
        logger.success("Main branch updated successfully!");
      } else {
        logger.error("Failed to update main branch. Please check for errors above.");
      }
      return;
    }
    
    // Check for uncommitted changes before switching to main
    if (hasUncommittedChanges()) {
      logger.warn("You have uncommitted changes that would be affected by switching branches.");
      logger.info("Modified files:");
      console.log(executeCommand('git status --short').output);
      
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
          rl.close();
          return;
        }
        
        executeCommand('git add .');
        const commitResult = executeCommand(`git commit -m "${commitMessage}"`);
        
        if (!commitResult.success) {
          logger.error("Failed to commit changes.");
          rl.close();
          return;
        }
        logger.success("Changes committed successfully.");
      } else if (choice === "2") {
        // Stash changes
        const stashResult = executeCommand('git stash push -m "Stashed before syncing main"');
        if (!stashResult.success) {
          logger.error("Failed to stash changes.");
          rl.close();
          return;
        }
        logger.success("Changes stashed successfully.");
        logger.info("Use 'git stash pop' to restore them later.");
      } else {
        logger.info("Sync cancelled.");
        rl.close();
        return;
      }
    }
    
    // Switch to main and pull
    logger.info("Switching to main branch...");
    const checkoutResult = executeCommand('git checkout main');
    if (!checkoutResult.success) {
      logger.error("Failed to checkout main branch.");
      rl.close();
      return;
    }
    
    logger.info("Pulling latest changes from remote...");
    const pullResult = executeCommand('git pull origin main', { stdio: 'inherit' });
    if (!pullResult.success) {
      logger.error("Failed to pull latest changes from remote.");
      rl.close();
      return;
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
    
    logger.sectionHeader('NEXT STEPS');
    logger.info(`Current branch: ${goBackToBranch.toLowerCase() !== 'n' ? currentBranch : 'main'}`);
    logger.info("What would you like to do next?");
    logger.info("1. Continue development on current branch");
    logger.info("2. Start a new feature with: pnpm run workflow:new");
    logger.info("3. Run the complete workflow: pnpm run workflow");
    
  } catch (error) {
    logger.error("Failed to sync main branch:", error.message);
  } finally {
    rl.close();
  }
}

// Run the main function
syncMainBranch(); 