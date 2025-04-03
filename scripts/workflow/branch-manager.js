/**
 * Branch Manager Module
 * 
 * Handles Git branch operations, code changes, and commits.
 */

import { execSync } from 'child_process';
import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';
import fs from 'fs';

/**
 * Check if a branch is a feature branch
 * @param {string} branchName - Branch name to check
 * @returns {boolean} - True if it's a feature branch
 */
export function isFeatureBranch(branchName) {
  const featurePrefixes = ['feature/', 'feat/', 'fix/', 'bugfix/', 'improvement/', 'chore/', 'docs/'];
  return featurePrefixes.some(prefix => branchName.startsWith(prefix));
}

/**
 * Get the current branch name
 * @returns {string} - Current branch name
 */
export function getCurrentBranch() {
  try {
    return execSync('git branch --show-current', { encoding: 'utf8' }).trim();
  } catch (error) {
    logger.error(`Failed to get current branch: ${error.message}`);
    return '';
  }
}

/**
 * Check if there are uncommitted changes
 * @returns {boolean} - True if there are uncommitted changes
 */
export function hasUncommittedChanges() {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    return status.length > 0;
  } catch (error) {
    logger.error(`Failed to check for uncommitted changes: ${error.message}`);
    return false;
  }
}

/**
 * Create a feature branch name from description
 * @param {string} description - Description of the feature
 * @returns {string} - A valid branch name
 */
export function createBranchName(description) {
  return 'feature/' + description.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substr(0, 40);
}

/**
 * Create a new feature branch from main
 * @param {string} branchName - Name for the new branch
 * @returns {boolean} - Success status
 */
export function createFeatureBranch(branchName) {
  try {
    // Make sure main is up to date
    logger.info("Updating main branch from remote...");
    execSync('git pull origin main', { stdio: 'inherit' });
    
    // Create and checkout new branch
    execSync(`git checkout -b ${branchName}`, { stdio: 'inherit' });
    logger.success(`Created and switched to branch: ${branchName}`);
    return true;
  } catch (error) {
    logger.error(`Failed to create branch: ${error.message}`);
    return false;
  }
}

/**
 * Switch to an existing branch, handling uncommitted changes
 * @param {string} targetBranch - Branch to switch to
 * @param {Function} promptFn - Function to prompt the user
 * @returns {Promise<boolean>} - Success status
 */
export async function switchBranch(targetBranch, currentBranch, promptFn) {
  if (targetBranch === currentBranch) {
    logger.info(`Already on branch: ${currentBranch}`);
    return true;
  }
  
  // Handle uncommitted changes
  if (hasUncommittedChanges()) {
    logger.warn("You have uncommitted changes that would be affected when switching.");
    const action = await promptFn("1. Commit changes, 2. Stash changes, 3. Stay on current branch (1/2/3)", "3");
    
    if (action === "1") {
      const message = await promptFn(`Enter commit message`, `Changes before switching to ${targetBranch}`);
      try {
        execSync('git add .');
        execSync(`git commit -m "${message}"`);
      } catch (error) {
        logger.error(`Failed to commit changes: ${error.message}`);
        return false;
      }
    } else if (action === "2") {
      try {
        execSync(`git stash push -m "Stashed before switching to ${targetBranch}"`);
        logger.success("Changes stashed successfully.");
      } catch (error) {
        logger.error(`Failed to stash changes: ${error.message}`);
        return false;
      }
    } else {
      logger.info(`Staying on current branch: ${currentBranch}`);
      return false;
    }
  }
  
  // Switch to target branch
  try {
    execSync(`git checkout ${targetBranch}`, { stdio: 'inherit' });
    logger.success(`Switched to branch: ${targetBranch}`);
    return true;
  } catch (error) {
    logger.error(`Failed to switch branch: ${error.message}`);
    return false;
  }
}

/**
 * Sync main branch with remote
 * @param {Function} promptFn - Function to prompt the user
 * @returns {Promise<boolean>} - Success status
 */
export async function syncMainBranch(promptFn) {
  logger.sectionHeader('SYNCING MAIN BRANCH');
  
  const currentBranch = getCurrentBranch();
  
  // If already on main, just pull
  if (currentBranch === 'main' || currentBranch === 'master') {
    try {
      logger.info("Pulling latest changes from remote main...");
      execSync('git pull origin main', { stdio: 'inherit' });
      logger.success("Main branch updated successfully!");
      return true;
    } catch (error) {
      logger.error(`Failed to update main branch: ${error.message}`);
      return false;
    }
  }
  
  // Check for uncommitted changes
  if (hasUncommittedChanges()) {
    logger.warn("You have uncommitted changes that would be affected by switching branches.");
    
    const choice = await promptFn("1. Commit changes, 2. Stash changes, 3. Cancel sync (1/2/3)");
    
    if (choice === "1") {
      const commitMessage = await promptFn("Enter commit message");
      if (!commitMessage) {
        logger.error("Commit message is required.");
        return false;
      }
      
      try {
        execSync('git add .');
        execSync(`git commit -m "${commitMessage}"`);
      } catch (error) {
        logger.error(`Failed to commit changes: ${error.message}`);
        return false;
      }
    } else if (choice === "2") {
      try {
        execSync('git stash push -m "Stashed before syncing main"');
        logger.info("Changes stashed successfully.");
      } catch (error) {
        logger.error(`Failed to stash changes: ${error.message}`);
        return false;
      }
    } else {
      logger.info("Sync cancelled.");
      return false;
    }
  }
  
  // Switch to main and pull
  try {
    execSync('git checkout main', { stdio: 'inherit' });
    execSync('git pull origin main', { stdio: 'inherit' });
    logger.success("Main branch updated successfully!");
    
    // Ask if they want to go back to the previous branch
    if (currentBranch && currentBranch !== 'main' && currentBranch !== 'master') {
      const goBack = await promptFn(`Switch back to '${currentBranch}'? (Y/n)`, 'Y');
      if (goBack.toLowerCase() !== 'n') {
        execSync(`git checkout ${currentBranch}`, { stdio: 'inherit' });
        logger.success(`Switched back to branch: ${currentBranch}`);
      }
    }
    
    return true;
  } catch (error) {
    logger.error(`Failed during branch operations: ${error.message}`);
    return false;
  }
}

/**
 * Get the last edited files
 * @returns {string[]} Array of recently modified files
 */
function getLastEditedFiles() {
  try {
    // Get recently modified files
    const changedFiles = execSync('git diff --name-only', { encoding: 'utf8' }).trim();
    const stagedFiles = execSync('git diff --name-only --staged', { encoding: 'utf8' }).trim();
    
    // Also check untracked files
    const untrackedFiles = execSync('git ls-files --others --exclude-standard', { encoding: 'utf8' }).trim();
    
    // Combine and filter for uniqueness
    const allChangedFiles = [...new Set([
      ...changedFiles.split('\n').filter(f => f),
      ...stagedFiles.split('\n').filter(f => f),
      ...untrackedFiles.split('\n').filter(f => f)
    ])];
    
    return allChangedFiles;
  } catch (error) {
    logger.debug('Error getting last edited files:', error.message);
    return [];
  }
}

/**
 * Generate a descriptive commit message based on changed files
 * @param {string[]} files - Array of changed files
 * @param {string} branchName - Current branch name
 * @returns {string} Generated commit message
 */
function generateCommitMessage(files, branchName) {
  // Default prefix based on branch type
  let prefix = 'update';
  if (branchName.startsWith('feature/')) prefix = 'feat';
  else if (branchName.startsWith('fix/') || branchName.startsWith('bugfix/')) prefix = 'fix';
  else if (branchName.startsWith('docs/')) prefix = 'docs';
  else if (branchName.startsWith('chore/')) prefix = 'chore';
  
  // If no files changed, use branch name
  if (!files.length) {
    // Convert kebab-case to Title Case
    const branchTitle = branchName
      .replace(/^(feature\/|fix\/|bugfix\/|docs\/|chore\/)/, '')
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    return `${prefix}: ${branchTitle}`;
  }
  
  // Group files by directory
  const filesByDir = {};
  files.forEach(file => {
    const dir = file.split('/')[0];
    if (!filesByDir[dir]) filesByDir[dir] = [];
    filesByDir[dir].push(file);
  });
  
  // Generate description based on directories modified
  const dirNames = Object.keys(filesByDir);
  
  if (dirNames.length === 1) {
    // Single directory changed
    const dir = dirNames[0];
    const fileCount = filesByDir[dir].length;
    
    if (fileCount === 1) {
      // Single file in single directory
      const file = filesByDir[dir][0].split('/').pop();
      return `${prefix}: Update ${file} in ${dir}`;
    } else {
      // Multiple files in single directory
      return `${prefix}: Update ${fileCount} files in ${dir}`;
    }
  } else if (dirNames.length <= 3) {
    // 2-3 directories changed
    return `${prefix}: Update files in ${dirNames.join(', ')}`;
  } else {
    // Many directories changed
    return `${prefix}: Update ${files.length} files across ${dirNames.length} directories`;
  }
}

/**
 * Commit changes with a suggested message based on branch name
 * @param {string} branchName - Current branch name
 * @param {Function} promptFn - Function to prompt the user
 * @returns {Promise<{success: boolean, message?: string}>} - Success status and commit message
 */
export async function commitChanges(branchName, promptFn) {
  if (!hasUncommittedChanges()) {
    logger.info("No uncommitted changes detected.");
    return { success: true };
  }
  
  logger.info("You have uncommitted changes.");
  
  // Show detailed status including all files
  logger.info("Files to be committed:");
  execSync('git status --short', { stdio: 'inherit' });
  
  const shouldCommit = await promptFn("Would you like to commit these changes? (Y/n)", "Y");
  if (shouldCommit.toLowerCase() === 'n') {
    return { success: true };
  }
  
  try {
    // Always add ALL files first - this is critical to avoid missing files
    logger.info("Adding all changes...");
    execSync('git add --all', { stdio: 'inherit' });
    
    // Explicitly check for GitHub workflow files and add them if they exist
    const workflowsDir = '.github/workflows';
    if (fs.existsSync(workflowsDir)) {
      logger.info("Adding GitHub workflow files...");
      
      // Specifically add firebase-deploy.yml if it exists
      const firebaseDeployFile = `${workflowsDir}/firebase-deploy.yml`;
      if (fs.existsSync(firebaseDeployFile)) {
        logger.info("Explicitly adding firebase-deploy.yml...");
        execSync(`git add "${firebaseDeployFile}"`, { stdio: 'inherit' });
      }
      
      // Add all files in the workflows directory
      execSync(`git add "${workflowsDir}/"`, { stdio: 'inherit' });
    }
    
    // Verify what's been staged
    logger.info("Staged files:");
    execSync('git status --short', { stdio: 'inherit' });
    
    // Get last edited files for smart commit message
    const lastEditedFiles = getLastEditedFiles();
    
    // Generate commit message suggestion based on changed files
    const suggestedMessage = generateCommitMessage(lastEditedFiles, branchName);
    
    // Get commit message from user
    const commitMessage = await promptFn(`Enter commit message`, suggestedMessage);
    if (!commitMessage) {
      logger.error("Commit message is required.");
      return { success: false };
    }
    
    // Commit all staged changes
    logger.info("Committing changes...");
    execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
    
    // Verify commit actually happened
    const verifyCommit = execSync('git log -1 --pretty=%B', { encoding: 'utf8' }).trim();
    if (verifyCommit !== commitMessage) {
      logger.warn("Commit operation may not have completed successfully.");
    }
    
    // Check if we still have uncommitted changes
    if (hasUncommittedChanges()) {
      logger.warn("Some changes were not committed. You may need to run 'git add .' manually.");
    } else {
      logger.success("All changes committed successfully!");
    }
    
    // Push changes to remote repository
    logger.info("Pushing changes to remote repository...");
    try {
      // Check if branch exists on remote
      const remoteBranchExists = execSync(`git ls-remote --heads origin ${branchName}`, { encoding: 'utf8' }).trim();
      
      // Get local commit hash for verification
      const localCommitHash = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
      logger.debug(`Local commit hash: ${localCommitHash}`);
      
      if (remoteBranchExists) {
        // Branch exists on remote, do a regular push
        logger.info(`Branch ${branchName} exists on remote, pushing changes...`);
        execSync(`git push origin ${branchName}`, { stdio: 'inherit' });
      } else {
        // Branch doesn't exist on remote, set upstream
        logger.info(`Branch ${branchName} is new, setting upstream...`);
        execSync(`git push -u origin ${branchName}`, { stdio: 'inherit' });
      }
      
      // Verify push was successful by checking if the local commit exists on remote
      logger.info("Verifying push was successful...");
      try {
        // Pull the latest remote refs
        execSync('git fetch origin', { stdio: 'pipe' });
        
        // Get the remote hash after push
        const remoteCommitHash = execSync(`git rev-parse origin/${branchName}`, { encoding: 'utf8' }).trim();
        logger.debug(`Remote commit hash: ${remoteCommitHash}`);
        
        if (localCommitHash === remoteCommitHash) {
          logger.success(`Push verification successful - commit ${localCommitHash.substring(0, 7)} is on GitHub`);
        } else {
          logger.warn(`Push verification failed - local and remote commits don't match`);
          logger.info("Trying push with verbose output...");
          
          // Try again with more verbose output
          execSync(`git push -v origin ${branchName}`, { stdio: 'inherit' });
          
          // Check again
          const retryRemoteHash = execSync(`git rev-parse origin/${branchName}`, { encoding: 'utf8' }).trim();
          
          if (localCommitHash === retryRemoteHash) {
            logger.success(`Second push attempt successful - commit ${localCommitHash.substring(0, 7)} is on GitHub`);
          } else {
            throw new Error("Changes were committed but could not be pushed to GitHub");
          }
        }
        
        // Check if GitHub Actions workflow exists in the repo
        const workflowDir = '.github/workflows';
        if (fs.existsSync(workflowDir)) {
          logger.info("GitHub Actions workflows detected - checking for trigger events...");
          
          // List workflow files
          const workflows = fs.readdirSync(workflowDir)
            .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'));
          
          if (workflows.length > 0) {
            logger.info(`Found ${workflows.length} workflow files: ${workflows.join(', ')}`);
          } else {
            logger.warn("No workflow files found in .github/workflows");
          }
        }
        
        // Check recent GitHub activity to see if workflow was triggered
        try {
          logger.info("Checking for recently triggered GitHub Actions...");
          // Using git command to avoid third party dependencies
          const repoUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim()
            .replace('git@github.com:', 'https://github.com/')
            .replace(/\.git$/, '');
          
          logger.info(`GitHub repo URL: ${repoUrl}`);
          logger.info(`Check GitHub Actions at: ${repoUrl}/actions`);
        } catch (actionsError) {
          logger.debug(`Error checking GitHub Actions: ${actionsError.message}`);
        }
        
        logger.success(`Changes pushed to remote branch: ${branchName}`);
        return { success: true, message: commitMessage, pushed: true };
      } catch (verifyError) {
        logger.error(`Push verification failed: ${verifyError.message}`);
        logger.warn("Changes may not have been pushed to GitHub properly");
        logger.info(`Please check manually and run: git push -v origin ${branchName}`);
        
        return { 
          success: true, 
          message: commitMessage, 
          pushed: false,
          pushError: `Push verification failed: ${verifyError.message}`
        };
      }
    } catch (pushError) {
      logger.error(`Failed to push changes: ${pushError.message}`);
      logger.info(`You can manually push with: git push -u origin ${branchName}`);
      return { 
        success: true, 
        message: commitMessage, 
        pushed: false,
        pushError: pushError.message 
      };
    }
  } catch (error) {
    logger.error(`Failed to commit changes: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Get a list of modified files between current state and HEAD
 * @returns {string[]} - Array of modified file paths
 */
export function getModifiedFiles() {
  try {
    const output = execSync('git diff --name-only HEAD', { encoding: 'utf8' }).trim();
    return output.split('\n').filter(Boolean);
  } catch (error) {
    logger.error(`Failed to get modified files: ${error.message}`);
    return [];
  }
}

/**
 * Get a list of all local branches
 * @returns {string[]} - Array of branch names
 */
export function getLocalBranches() {
  try {
    const output = execSync('git branch', { encoding: 'utf8' }).trim();
    return output
      .split('\n')
      .map(line => line.trim().replace(/^\*\s*/, '')) // Remove the * from current branch
      .filter(Boolean);
  } catch (error) {
    logger.error(`Failed to get local branches: ${error.message}`);
    return [];
  }
}

/**
 * Handle uncommitted changes interactively
 * @returns {Promise<boolean>} Whether to continue with the workflow
 */
export async function handleUncommittedChanges() {
  const options = [
    'Stash changes and continue',
    'Commit changes',
    'Abort workflow'
  ];
  
  const choice = await commandRunner.promptWorkflowOptions(
    'Please choose how to handle your uncommitted changes:',
    options
  );
  
  let message;
  switch(choice) {
    case '1':
      await commandRunner.runCommand('git stash');
      logger.info('Changes stashed');
      return true;
    case '2':
      message = await commandRunner.promptText('Enter commit message: ');
      await commandRunner.runCommand(`git add . && git commit -m "${message}"`);
      logger.info('Changes committed');
      return true;
    case '3':
    default:
      return false;
  }
}

export default {
  isFeatureBranch,
  getCurrentBranch,
  hasUncommittedChanges,
  createBranchName,
  createFeatureBranch,
  switchBranch,
  syncMainBranch,
  commitChanges,
  getModifiedFiles,
  getLocalBranches,
  handleUncommittedChanges
}; 