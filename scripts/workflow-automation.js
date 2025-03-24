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

/* global process, global, clearInterval, setInterval */

import { execSync } from 'child_process';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as logger from './core/logger.js';

// Add Promise-based utilities for parallel operations
const fsPromises = fs.promises;

// Process monitoring configuration
const PROCESS_MONITORING = {
  enabled: true,
  interval: 30000, // Check every 30 seconds
  memoryThreshold: 500 * 1024 * 1024, // 500MB warning threshold
  intervalId: null
};

/**
 * Run multiple operations in parallel
 * @param {Array<Function>} operations - Array of async functions to execute
 * @param {string} operationName - Name of the operation group for logging
 * @returns {Promise<Array>} - Results from all operations
 */
async function runParallel(operations, operationName = 'parallel operations') {
  if (!operations || operations.length === 0) return [];
  
  const startTime = logger.timeStart(`Running ${operations.length} ${operationName}`);
  try {
    const results = await Promise.all(operations);
    logger.timeEnd(`${operationName}`, startTime);
    return results;
  } catch (error) {
    logger.error(`Error in parallel ${operationName}: ${error.message}`);
    throw error;
  }
}

/**
 * Start monitoring process resources
 */
function startProcessMonitoring() {
  if (!PROCESS_MONITORING.enabled) return;
  
  // Clear any existing interval
  if (PROCESS_MONITORING.intervalId) {
    clearInterval(PROCESS_MONITORING.intervalId);
  }
  
  // Set up the new interval
  PROCESS_MONITORING.intervalId = setInterval(() => {
    const memoryUsage = process.memoryUsage();
    const usedMemoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    const totalMemoryMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
    
    if (memoryUsage.heapUsed > PROCESS_MONITORING.memoryThreshold) {
      logger.warn(`High memory usage: ${usedMemoryMB}MB used of ${totalMemoryMB}MB allocated`);
      // Force garbage collection if memory is high (Node.js needs to be started with --expose-gc)
      if (global.gc) {
        logger.info("Running garbage collection...");
        global.gc();
      }
    }
  }, PROCESS_MONITORING.interval);
}

/**
 * Stop monitoring process resources
 */
function stopProcessMonitoring() {
  if (PROCESS_MONITORING.intervalId) {
    clearInterval(PROCESS_MONITORING.intervalId);
    PROCESS_MONITORING.intervalId = null;
  }
}

/**
 * Clean up temporary resources
 */
async function cleanupTemporaryResources() {
  logger.info("Cleaning up temporary resources...");
  
  try {
    // Clear the command cache to free memory
    commandCache.clear();
    
    // Clean up any temp files older than 7 days
    const tempDir = path.join(rootDir, 'temp');
    if (fs.existsSync(tempDir)) {
      const now = Date.now();
      const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
      
      const files = await fsPromises.readdir(tempDir);
      let cleanedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        
        try {
          const stats = await fsPromises.stat(filePath);
          
          // If file is older than MAX_AGE, delete it
          if (now - stats.mtime.getTime() > MAX_AGE) {
            if (stats.isDirectory()) {
              await fsPromises.rm(filePath, { recursive: true, force: true });
            } else {
              await fsPromises.unlink(filePath);
            }
            cleanedCount++;
          }
        } catch (err) {
          // Skip errors for individual files
          logger.debug(`Error checking file ${file}: ${err.message}`);
        }
      }
      
      if (cleanedCount > 0) {
        logger.success(`Cleaned up ${cleanedCount} old temporary files`);
      }
    }
    
    return true;
  } catch (error) {
    logger.warn(`Error cleaning up temporary resources: ${error.message}`);
    return false;
  }
}

// Workflow steps configuration - centralized step tracking
const WORKFLOW_STEPS = [
  { id: 1, name: 'BRANCH MANAGEMENT', description: 'Setting up your working branch' },
  { id: 2, name: 'CODE CHANGES', description: 'Managing your code changes' },
  { id: 3, name: 'GITIGNORE CONFIGURATION', description: 'Ensuring proper file tracking' },
  { id: 4, name: 'PREVIEW DEPLOYMENT', description: 'Deploying preview environment' },
  { id: 5, name: 'PULL REQUEST', description: 'Creating or updating PR' },
  { id: 6, name: 'WORKFLOW COMPLETION', description: 'Finalizing the workflow' }
];

// Track current step
let _currentStep = 0;

/**
 * Updates the terminal window title
 * @param {string} title - The title to set
 */
function updateTerminalTitle(title) {
  // Escape sequence to set terminal title
  const titleEscape = `\u001B]0;${title}\u0007`;
  process.stdout.write(titleEscape);
}

/**
 * Reset the terminal title to the default
 */
function resetTerminalTitle() {
  updateTerminalTitle('Terminal');
}

/**
 * Show workflow progress
 * @param {number} stepId - The step ID to display
 */
function showWorkflowProgress(stepId) {
  _currentStep = stepId;
  const step = WORKFLOW_STEPS.find(s => s.id === stepId);
  if (!step) return;
  
  // Update terminal title with current step
  updateTerminalTitle(`${step.name}`);
  
  logger.info('\n');
  // Display the step without numbering, just the name and description
  logger.info(`${step.name}`);
  logger.info('='.repeat(50));
  logger.info(`${step.description}`);
}

// Get the root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const gitignoreFixerPath = path.join(__dirname, 'fix-gitignore.js');

// Command output cache for frequently used commands
const commandCache = new Map();
const CACHE_TTL = 3000; // 3 seconds TTL for cached commands

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
  // Check if command can be cached (status checks, branch info, etc.)
  const isCacheable = !options.stdio && 
                     !options.disableCache && 
                     (command.startsWith('git status') || 
                      command.startsWith('git branch') || 
                      command.startsWith('git diff'));
  
  // Return cached result if available and fresh
  if (isCacheable && commandCache.has(command)) {
    const cachedResult = commandCache.get(command);
    const isFresh = (Date.now() - cachedResult.timestamp) < CACHE_TTL;
    
    if (isFresh) {
      return cachedResult.result;
    }
  }
  
  // Show command being executed unless suppressed
  if (!options.silent) {
    logger.info(`\n> ${command}`);
  }
  
  try {
    // Handle timeout option separately
    const execOptions = { ...options };
    if (execOptions.timeout) {
      const timeout = execOptions.timeout;
      delete execOptions.timeout; // Remove from execSync options
      
      // For stdio: 'inherit' commands, we won't have access to the output
      // so we need to handle differently
      if (options.stdio === 'inherit') {
        try {
          const output = execSync(command, { 
            encoding: 'utf8', 
            ...execOptions,
            timeout
          });
          
          const result = { 
            success: true, 
            output: output || '', 
            error: null 
          };
          
          // Cache the result if cacheable
          if (isCacheable) {
            commandCache.set(command, { 
              result, 
              timestamp: Date.now() 
            });
          }
          
          return result;
        } catch (error) {
          // Special handling for timeout errors
          if (error.code === 'ETIMEDOUT') {
            logger.warn(`\nCommand timed out after ${timeout/1000} seconds: ${command}`);
          }
          
          // For stdio: 'inherit', we might still want to extract URLs even if the command failed
          return { 
            success: false, 
            output: error.stdout || '', 
            error: error,
            timedOut: error.code === 'ETIMEDOUT'
          };
        }
      }
    }
    
    const output = execSync(command, { encoding: 'utf8', ...execOptions });
    
    // Show success indicator (if not suppressed)
    if (!options.silent && !options.suppressSuccess) {
      logger.success(`Command completed`);
    }
    
    const result = { 
      success: true, 
      output, 
      error: null 
    };
    
    // Cache the result if cacheable
    if (isCacheable) {
      commandCache.set(command, { 
        result, 
        timestamp: Date.now() 
      });
    }
    
    return result;
  } catch (error) {
    if (!options.suppressErrors) {
      logger.error(`\nCommand failed: ${command}`);
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
    logger.warn(`Could not run gitignore fixer: ${error.message}`);
    return false;
  }
}

/**
 * Prefetch commonly used git information to speed up multiple calls
 * @returns {Object} Common git information
 */
async function prefetchGitInfo() {
  logger.info("Prefetching repository information...");
  
  // Run these operations in parallel
  const operations = [
    () => executeCommand('git branch', { suppressErrors: true }),
    () => executeCommand('git status --porcelain', { suppressErrors: true }),
    () => executeCommand('git remote -v', { suppressErrors: true }),
    () => executeCommand('git log -1 --pretty=format:"%h %s"', { suppressErrors: true })
  ];
  
  try {
    const startTime = Date.now();
    const [branchResult, statusResult, remoteResult, lastCommitResult] = await runParallel(
      operations.map(op => op()),
      'git info fetching'
    );
    
    // Return collected info
    return {
      branches: branchResult.success ? branchResult.output.trim().split('\n') : [],
      hasChanges: statusResult.success && statusResult.output.trim() !== '',
      remotes: remoteResult.success ? remoteResult.output.trim().split('\n') : [],
      lastCommit: lastCommitResult.success ? lastCommitResult.output.trim() : '',
      fetchTime: Date.now() - startTime
    };
  } catch (error) {
    logger.warn("Error prefetching git info:", error.message);
    return {};
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
 * @param {string} title - The PR title
 * @param {string} description - The PR description
 * @param {Object} workflowData - Workflow data object to update with PR info
 * @returns {boolean} - Whether PR creation was successful
 */
async function createPullRequest(title, description, workflowData) {
  logger.info('\nCREATING PULL REQUEST');
  logger.info('='.repeat(30));
  logger.info(`Creating PR with title: ${title}`);
  
  try {
    const result = executeCommand(`pnpm run pr:create-with-title "${title}" "${description}"`, { 
      stdio: 'inherit',
      suppressErrors: true,
      exitOnError: false
    });
    
    // Update workflow data with PR info
    if (workflowData) {
      workflowData.prTitle = title;
      
      // Try to extract PR URL from output
      const prUrl = result.output?.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/)?.[0];
      if (prUrl) {
        workflowData.prUrl = prUrl;
      }
    }
    
    if (!result.success) {
      // PR creation failed, check for specific errors
      if (result.output?.includes("You have uncommitted changes")) {
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
            
            // Update workflow data for successful PR
            if (workflowData) {
              workflowData.prCreated = true;
              
              // Try to extract PR URL from auto-commit result
              const prUrl = autoCommitResult.output?.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/)?.[0];
              if (prUrl) {
                workflowData.prUrl = prUrl;
              }
            }
            
            return true;
          } else {
            logger.error("Auto-commit failed. Please commit your changes manually.");
            return false;
          }
        } else {
          logger.info("You can manually commit your changes and then create a PR.");
          return false;
        }
      } else if (result.output?.includes("a pull request for branch") && result.output?.includes("already exists")) {
        // PR already exists
        const prUrl = result.output.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/)?.[0];
        
        logger.warn("A pull request already exists for this branch.");
        if (prUrl) {
          logger.info(`Existing PR: ${prUrl}`);
          
          // Save the existing PR URL to workflow data
          if (workflowData) {
            workflowData.prCreated = true;
            workflowData.prUrl = prUrl;
          }
          
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
      
      // Update workflow data for successful PR
      if (workflowData) {
        workflowData.prCreated = true;
      }
      
      return true;
    }
  } catch (error) {
    logger.error(`Failed to create PR: ${error.message}`);
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
 * Check if the main branch is already synced with remote
 * @returns {Promise<boolean>} - Whether the branch is already synced
 */
async function isMainBranchSynced() {
  logger.info("Checking if main branch is already in sync with remote...");
  
  try {
    // First, fetch the latest refs without merging
    const fetchResult = executeCommand('git fetch origin main', { 
      silent: true,
      ignoreError: true
    });
    
    if (!fetchResult.success) {
      logger.warn("Unable to fetch latest refs. Assuming main branch needs sync.");
      return false;
    }
    
    // Now compare local main with origin/main
    const diffResult = executeCommand('git rev-list --count main..origin/main', {
      silent: true,
      ignoreError: true
    });
    
    if (!diffResult.success) {
      logger.warn("Unable to compare with remote. Assuming main branch needs sync.");
      return false;
    }
    
    // Convert the output to a number
    const commitsBehind = parseInt(diffResult.output.trim(), 10);
    
    if (isNaN(commitsBehind)) {
      logger.warn("Unable to determine commit difference. Assuming main branch needs sync.");
      return false;
    }
    
    if (commitsBehind === 0) {
      logger.success("Main branch is already in sync with remote.");
      return true;
    } else {
      logger.info(`Main branch is ${commitsBehind} commit(s) behind the remote.`);
      return false;
    }
  } catch (error) {
    logger.warn(`Error checking main branch sync: ${error.message}`);
    return false;
  }
}

/**
 * Generates a workflow summary to show at the end
 * @param {Object} workflowData - Collected data during workflow execution
 * @returns {string} - Formatted summary
 */
function generateWorkflowSummary(workflowData) {
  const { 
    startTime, 
    branch, 
    commits, 
    previewUrls, 
    prCreated,
    prTitle,
    prUrl,
    workflowSuccess
  } = workflowData;
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  let summary = '\nWORKFLOW SUMMARY\n';
  summary += '='.repeat(30) + '\n\n';
  
  summary += `Branch: ${branch}\n`;
  summary += `Duration: ${duration} seconds\n`;
  
  // Add commit info if available
  if (commits && commits.length > 0) {
    summary += `\nCommits: ${commits.length}\n`;
    commits.forEach((commit, index) => {
      summary += `   ${index + 1}. ${commit}\n`;
    });
  }
  
  // Add preview URLs if available
  if (previewUrls) {
    summary += '\nPreview URLs:\n';
    if (previewUrls.admin) {
      summary += `   • Admin Dashboard: ${previewUrls.admin}\n`;
    }
    if (previewUrls.hours) {
      summary += `   • Hours App: ${previewUrls.hours}\n`;
    }
    if (previewUrls.urls && previewUrls.urls.length > 0) {
      previewUrls.urls.forEach(url => {
        summary += `   • ${url}\n`;
      });
    }
  }
  
  // Add PR info if a PR was created
  if (prCreated) {
    summary += '\nPull Request:\n';
    summary += `   • Title: ${prTitle}\n`;
    if (prUrl) {
      summary += `   • URL: ${prUrl}\n`;
    }
  }
  
  // Add status
  summary += '\nStatus: ';
  if (workflowSuccess) {
    summary += 'Complete';
  } else {
    summary += 'Completed with warnings/errors';
  }
  
  return summary;
}

/**
 * Display a formatted workflow summary
 * @param {Object} workflowData - Data collected during the workflow
 */
function displayWorkflowSummary(workflowData) {
  const summary = generateWorkflowSummary(workflowData);
  
  logger.info('\n');
  logger.info('WORKFLOW COMPLETED');
  logger.info('='.repeat(30));
  logger.info(summary);
  logger.info('\n');
}

// Function to check if a branch is a feature branch
function isFeatureBranch(branchName) {
  // Common feature branch prefixes
  const featurePrefixes = ['feature/', 'feat/', 'user/', 'story/', 'bugfix/', 'fix/', 'improvement/'];
  
  // Check if branch name starts with any of the feature prefixes
  return featurePrefixes.some(prefix => branchName.startsWith(prefix));
}

/**
 * Run the Firebase authentication check and refresh if needed
 * @returns {Promise<boolean>} - Whether authentication is successful
 */
async function checkFirebaseAuth(options = {}) {
  const { silent = false, autoReauth = true } = options;
  
  if (!silent) {
    logger.info("Verifying Firebase authentication...");
  }
  
  try {
    // Check for existence of Firebase config files first
    const firebaseRcPath = path.join(rootDir, '.firebaserc');
    const hasFirebaseConfig = fs.existsSync(firebaseRcPath);
    
    // Check for cached Firebase credentials
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const firebaseCredPath = path.join(homeDir, '.config', 'configstore', 'firebase-tools.json');
    const hasCachedCredentials = fs.existsSync(firebaseCredPath);
    
    // If both config and credentials exist, try to use them first
    if (hasFirebaseConfig && hasCachedCredentials) {
      try {
        // Read firebase credentials to check expiration
        const credContent = fs.readFileSync(firebaseCredPath, 'utf8');
        const credData = JSON.parse(credContent);
        
        // Check if tokens exist and aren't expired
        if (credData.tokens && credData.tokens.access_token) {
          const expiresAt = credData.tokens.expires_at;
          // If token expiration is in the future (with 5 min buffer), consider valid
          if (expiresAt && expiresAt > (Date.now() + 5 * 60 * 1000)) {
            if (!silent) {
              logger.success("Firebase authentication valid (cached credentials)");
            }
            return true;
          }
        }
      } catch (e) {
        // Error reading/parsing credentials, continue to CLI check
        if (!silent) {
          logger.debug("Could not verify cached Firebase credentials, checking with CLI");
        }
      }
    }
    
    // First try to get auth status with a simple list projects command
    // This command will fail if not authenticated but works across all Firebase CLI versions
    const statusResult = executeCommand('firebase projects:list --json', { 
      suppressErrors: true,
      silent: true 
    });
    
    if (statusResult.success) {
      // Check if the output is valid JSON and contains project data
      try {
        const projectData = JSON.parse(statusResult.output);
        if (Array.isArray(projectData) && projectData.length > 0) {
          if (!silent) {
            logger.success("Firebase authentication valid");
          }
          return true;
        }
      } catch (e) {
        // JSON parse error means output is not as expected
        // Continue to reauth
      }
    }
    
    // If we reach here, either the command failed or output wasn't valid
    if (autoReauth) {
      // Try a different check before forcing reauth
      const whoamiResult = executeCommand('firebase auth:export --json', { 
        suppressErrors: true,
        silent: true
      });
      
      // If this second check succeeds, we're authenticated
      if (whoamiResult.success) {
        if (!silent) {
          logger.success("Firebase authentication valid");
        }
        return true;
      }
      
      // Both checks failed, need to reauth
      if (!silent) {
        logger.warn("Firebase authentication expired, refreshing...");
      }
      
      const loginResult = executeCommand('firebase login --reauth', { 
        stdio: 'inherit',
        suppressErrors: true
      });
      
      if (loginResult.success) {
        if (!silent) {
          logger.success("Firebase authentication refreshed successfully!");
        }
        return true;
      } else {
        if (!silent) {
          logger.error("Firebase authentication failed. Preview deployments may not work.");
        }
        return false;
      }
    } else {
      if (!silent) {
        logger.warn("Firebase authentication invalid. Preview deployments may not work.");
      }
      return false;
    }
  } catch (error) {
    if (!silent) {
      logger.error(`Error checking Firebase authentication: ${error.message}`);
    }
    return false;
  }
}

/**
 * Generate a more intelligent commit message suggestion based on changed files
 * @returns {string} - Suggested commit message
 */
function suggestCommitMessage(branchName = '') {
  try {
    // Get a list of modified files
    const changesResult = executeCommand('git diff --name-status HEAD', { 
      suppressErrors: true,
      silent: true 
    });
    
    if (!changesResult.success) {
      // Fallback to branch name if we can't get file changes
      return getDefaultCommitMessage(branchName);
    }
    
    const changes = changesResult.output.trim().split('\n').filter(line => line.trim() !== '');
    
    // If no changes, fall back to branch name
    if (changes.length === 0) {
      return getDefaultCommitMessage(branchName);
    }
    
    // Categorize changes by type and directory
    const filesByType = new Map();
    const directoryCounts = new Map();
    
    changes.forEach(change => {
      const [status, file] = change.split(/\s+/);
      if (!file) return;
      
      // Count by directory
      const directory = path.dirname(file);
      directoryCounts.set(directory, (directoryCounts.get(directory) || 0) + 1);
      
      // Group by file extension
      const ext = path.extname(file).toLowerCase();
      if (!filesByType.has(ext)) {
        filesByType.set(ext, []);
      }
      filesByType.get(ext).push({ status, file });
    });
    
    // Find the most common directories and file types
    const topDirs = [...directoryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(entry => entry[0]);
    
    // Determine change type
    let changeType = 'update';
    
    // Count number of added, modified, and deleted files
    const addedCount = changes.filter(c => c.startsWith('A')).length;
    const modifiedCount = changes.filter(c => c.startsWith('M')).length;
    const deletedCount = changes.filter(c => c.startsWith('D')).length;
    
    if (addedCount > modifiedCount && addedCount > deletedCount) {
      changeType = 'add';
    } else if (deletedCount > addedCount && deletedCount > modifiedCount) {
      changeType = 'remove';
    } else if (changes.some(c => c.includes('test') || c.includes('spec'))) {
      changeType = 'test';
    } else if (changes.some(c => c.includes('fix') || c.includes('bug'))) {
      changeType = 'fix';
    } else if (topDirs.some(dir => dir.includes('docs') || dir.includes('README'))) {
      changeType = 'docs';
    } else if (topDirs.some(dir => dir.includes('style') || dir.includes('css'))) {
      changeType = 'style';
    }
    
    // Generate commit prefix based on change type
    const prefixMap = {
      'add': 'feat:',
      'remove': 'refactor:',
      'test': 'test:',
      'fix': 'fix:',
      'docs': 'docs:',
      'style': 'style:',
      'update': 'chore:'
    };
    
    const prefix = prefixMap[changeType] || 'chore:';
    
    // Generate description based on affected directories
    let description = '';
    
    if (topDirs[0] && topDirs[0] !== '.') {
      // Get the main component name from directory
      const component = topDirs[0].split('/').pop();
      
      if (filesByType.size === 1) {
        // If only one file type affected, mention it
        const fileType = [...filesByType.keys()][0].replace('.', '');
        description = `${component} ${fileType} files`;
      } else {
        description = component;
      }
    } else {
      // Fallback to branch description if no clear directory pattern
      description = getDefaultCommitMessage(branchName);
    }
    
    // Combine prefix and description
    const message = `${prefix} ${description}`;
    
    // Capitalize first letter after prefix and ensure proper spacing
    return message.replace(/: ([a-z])/, ': $1'.toUpperCase());
  } catch (error) {
    // If anything goes wrong, fall back to the default
    return getDefaultCommitMessage(branchName);
  }
}

/**
 * Get a default commit message based on branch name
 * @param {string} branchName - The current branch name
 * @returns {string} - A default commit message
 */
function getDefaultCommitMessage(branchName = '') {
  // Clean up branch name
  let defaultMessage = branchName.replace('feature/', '').replace(/-/g, ' ');
  defaultMessage = defaultMessage.charAt(0).toUpperCase() + defaultMessage.slice(1);
  
  // Add a prefix if we can determine one from the branch name
  if (branchName.startsWith('feature/')) {
    return `feat: ${defaultMessage}`;
  } else if (branchName.startsWith('fix/') || branchName.startsWith('bugfix/')) {
    return `fix: ${defaultMessage}`;
  } else if (branchName.startsWith('chore/')) {
    return `chore: ${defaultMessage}`;
  } else if (branchName.startsWith('docs/')) {
    return `docs: ${defaultMessage}`;
  }
  
  return defaultMessage;
}

/**
 * Open preview dashboard in the default browser
 * @param {object} previewUrls - Object containing preview URLs
 * @returns {boolean} - Whether dashboard was opened successfully
 */
function openPreviewDashboard() {
  logger.info("Opening preview dashboard in your browser...");
  
  const dashboardPath = path.join(rootDir, 'preview-dashboard.html');
  
  if (!fs.existsSync(dashboardPath)) {
    logger.warn("Preview dashboard HTML not found. Run a preview deployment first.");
    return false;
  }
  
  try {
    // Determine the right command based on OS
    const openCmd = process.platform === 'win32' ? 'start' : 
                    process.platform === 'darwin' ? 'open' : 'xdg-open';
                    
    // Convert to file URL format for browser compatibility
    const fileUrl = `file://${dashboardPath.replace(/\\/g, '/')}`;
    
    // Execute the command to open browser
    executeCommand(`${openCmd} "${fileUrl}"`, { 
      suppressErrors: true,
      silent: true
    });
    
    logger.success("Preview dashboard opened in browser");
    return true;
  } catch (error) {
    logger.error(`Failed to open preview dashboard: ${error.message}`);
    logger.info(`You can manually open: ${dashboardPath}`);
    return false;
  }
}

/**
 * Main workflow function
 */
async function runWorkflow() {
  // Start process monitoring
  startProcessMonitoring();
  
  // Set terminal title for the workflow
  updateTerminalTitle('Time-Tracking Workflow');
  
  // Initialize workflow data
  const workflowData = {
    startTime: Date.now(),
    branch: '',
    commits: [],
    previewUrls: null,
    prCreated: false,
    prTitle: '',
    prUrl: '',
    workflowSuccess: true
  };
  
  // Initialize gitInfo
  let gitInfo = null;
  
  try {
    logger.info('\nAUTOMATED DEVELOPMENT WORKFLOW\n');
    logger.info('='.repeat(50));
    
    // Run cleanup and prefetch in parallel to save time
    const [_, prefetchedGitInfo] = await Promise.all([
      cleanupTemporaryResources(),
      prefetchGitInfo()
    ]);
    
    // Store prefetched git info
    gitInfo = prefetchedGitInfo;
    if (gitInfo?.fetchTime) {
      logger.info(`Repository info prefetched in ${gitInfo.fetchTime}ms`);
    }
    
    // Step 1: Branch Management
    showWorkflowProgress(1);
    
    // Use prefetched info if available, otherwise fetch on demand
    const currentBranch = gitInfo?.branches 
      ? gitInfo.branches.find(b => b.startsWith('*'))?.substring(2) || getCurrentBranch() 
      : getCurrentBranch();
    
    logger.info(`Current branch: ${currentBranch}`);
    workflowData.branch = currentBranch;
    
    let branchName = currentBranch;
    let createdNewBranch = false;
    
    // Run Firebase authentication check automatically
    const firebaseAuthOk = await checkFirebaseAuth();
    
    // If firebase auth failed after auto-reauth, ask if they want to continue anyway
    if (!firebaseAuthOk) {
      const continueAnyway = await prompt("Continue with the workflow anyway? (Y/n): ");
      if (continueAnyway.toLowerCase() === 'n') {
        logger.info("Exiting workflow due to authentication issues.");
        rl.close();
        return;
      }
    }
    
    // Check if main is already synced before asking
    const isSynced = await isMainBranchSynced();
    
    if (!isSynced && currentBranch !== 'main' && currentBranch !== 'master') {
      const shouldSyncMain = await prompt("Your local main branch is not in sync with remote. Would you like to sync it now? (Y/n): ");
      if (shouldSyncMain.toLowerCase() !== 'n') {
        await syncMainBranch();
      }
    } else if (currentBranch !== 'main' && currentBranch !== 'master') {
      logger.info("Your local main branch is already in sync with remote.");
    }
    
    // If on main, create a new feature branch, otherwise offer workflow options
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
      // Check if we're already on a feature branch
      if (isFeatureBranch(currentBranch)) {
        logger.success(`Already on feature branch: ${currentBranch}`);
        logger.info("What would you like to do with your current branch?");
        logger.info("1. Continue working on this branch");
        logger.info("2. Create a preview deployment");
        logger.info("3. Switch to a different branch");
        logger.info("4. Create a pull request");
        
        const action = await prompt("Choose an option (1-4): ");
        
        if (action === "2") {
          // Skip to preview deployment step
          logger.info("Skipping to preview deployment...");
          // Set necessary data for the preview step
          workflowData.branch = currentBranch;
          
          // Jump directly to preview deployment step
          showWorkflowProgress(4); // Preview deployment step ID
          logger.info("Running preview deployment...");
          
          try {
            // Execute preview deployment command
            const previewCommand = 'pnpm run preview';
            logger.info(`Running preview deployment: ${previewCommand}`);
            
            // Execute the preview script directly
            const previewResult = executeCommand(previewCommand, { stdio: 'inherit' });
            
            if (previewResult.success) {
              logger.success("Preview deployment completed successfully!");
              
              // Try to extract preview URLs
              try {
                const reportModule = await import('./reports/report-collector.js');
                workflowData.previewUrls = reportModule.extractPreviewUrls({tempDir: path.join(process.cwd(), 'temp')});
                
                // Open preview dashboard automatically
                openPreviewDashboard();
              } catch (error) {
                logger.warn(`Could not extract preview URLs: ${error.message}`);
              }
            } else {
              logger.error("Preview deployment failed. Check the output for details.");
              workflowData.workflowSuccess = false;
            }
          } catch (error) {
            logger.error(`Error during preview deployment: ${error.message}`);
            workflowData.workflowSuccess = false;
          }
          
          // Show workflow summary and exit
          displayWorkflowSummary(workflowData);
          rl.close();
          return;
        } else if (action === "3") {
          // User wants to switch branches - will be handled by the branch switching code below
          logger.info("Proceeding to branch switching...");
        } else if (action === "4") {
          // Skip to PR creation step
          logger.info("Skipping to pull request creation...");
          
          // Get PR content
          const prContent = await suggestPRContent();
          const prTitle = await prompt(`Enter PR title [${prContent.title}]: `);
          const prDescription = await prompt("Enter PR description (optional, press Enter to use generated): ");
          
          // Create PR
          const _prResult = await createPullRequest(
            prTitle || prContent.title,
            prDescription || prContent.body,
            workflowData
          );
          
          // Show workflow summary and exit
          displayWorkflowSummary(workflowData);
          rl.close();
          return;
        } else {
          // Continue with current branch (option 1 or invalid input)
          logger.info(`Continuing work on branch: ${currentBranch}`);
          
          // Skip the branch switching prompt when choosing option 1
          if (action === "1") {
            // Skip directly to code changes step
            branchName = currentBranch;
            
            // Go directly to the Code Changes step
            showWorkflowProgress(2);
            
            // Check for uncommitted changes and offer to commit
            const hasChanges = gitInfo?.hasChanges !== undefined ? gitInfo.hasChanges : hasUncommittedChanges();
            
            if (hasChanges) {
              logger.info("You have uncommitted changes.");
              logger.info("Modified files:");
              logger.info(executeCommand('git status --short').output);
              
              const shouldCommit = await prompt("Would you like to commit these changes? (Y/n): ");
              if (shouldCommit.toLowerCase() !== 'n') {
                // Get an intelligent commit message suggestion
                const suggestedMessage = suggestCommitMessage(branchName);
                
                const commitMessage = await prompt(`Enter commit message [${suggestedMessage}]: `);
                const finalMessage = commitMessage || suggestedMessage;
                
                // Run git operations in parallel where possible
                const startTime = logger.timeStart("Committing changes");
                
                // First, stage all changes
                executeCommand('git add .');
                
                // Then commit
                executeCommand(`git commit -m "${finalMessage}"`);
                
                logger.timeEnd("Committing changes", startTime);
                logger.success("Changes committed successfully.");
              }
            } else {
              logger.info("No uncommitted changes detected.");
            }
            
            // Continue to gitignore step
            showWorkflowProgress(3);
            
            // Skip the rest of the branch management and go straight to gitignore
            const gitignoreStartTime = logger.timeStart("Checking and fixing gitignore configuration");
            
            // Run these operations in parallel, then continue with the normal workflow
            await Promise.all([
              fixGitignoreIssues(),
              commitGitignoreChanges()
            ]);
            
            logger.timeEnd("Checking and fixing gitignore configuration", gitignoreStartTime);
            
            // Continue with preview deployment step
            showWorkflowProgress(4);
            
            // The rest of the workflow continues as normal from the preview deployment step
            return;
          }
        }
      } else {
        logger.info(`Continuing work on existing branch: ${currentBranch}`);
      }
      
      // Option to switch to a different branch
      // This section only executes if we didn't select option 1 above
      const switchBranch = await prompt("Would you like to switch to a different branch? (y/N): ");
      if (switchBranch.toLowerCase() === 'y') {
        // List available branches
        logger.info("\nAvailable branches:");
        logger.info(executeCommand('git branch').output);
        
        const newBranch = await prompt("Enter branch name to switch to (or press enter to stay on current branch): ");
        if (newBranch && newBranch !== currentBranch) {
          // Check for uncommitted changes before switching
          if (hasUncommittedChanges()) {
            logger.warn("You have uncommitted changes that would be lost when switching branches.");
            logger.info("Modified files:");
            logger.info(executeCommand('git status --short').output);
            
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
    
    // Step 2: Code Changes
    showWorkflowProgress(2);
    
    // Check for uncommitted changes and offer to commit using prefetched info when available
    const hasChanges = gitInfo?.hasChanges !== undefined ? gitInfo.hasChanges : hasUncommittedChanges();
    
    if (hasChanges) {
      logger.info("You have uncommitted changes.");
      logger.info("Modified files:");
      logger.info(executeCommand('git status --short').output);
      
      const shouldCommit = await prompt("Would you like to commit these changes? (Y/n): ");
      if (shouldCommit.toLowerCase() !== 'n') {
        // Get an intelligent commit message suggestion
        const suggestedMessage = suggestCommitMessage(branchName);
        
        const commitMessage = await prompt(`Enter commit message [${suggestedMessage}]: `);
        const finalMessage = commitMessage || suggestedMessage;
        
        // Run git operations in parallel where possible
        const startTime = logger.timeStart("Committing changes");
        
        // First, stage all changes
        executeCommand('git add .');
        
        // Then commit
        executeCommand(`git commit -m "${finalMessage}"`);
        
        logger.timeEnd("Committing changes", startTime);
        logger.success("Changes committed successfully.");
      }
    } else if (createdNewBranch) {
      logger.info("No changes to commit on the new branch yet.");
    } else {
      logger.info("No uncommitted changes detected.");
    }
    
    // Step 3: Gitignore Configuration
    showWorkflowProgress(3);
    
    // Run gitignore operations in parallel
    const gitignoreStartTime = logger.timeStart("Checking and fixing gitignore configuration");
    
    // Run these operations in parallel
    const [_gitignoreFixed, _gitignoreChangesCommitted] = await Promise.all([
      fixGitignoreIssues(),
      commitGitignoreChanges()
    ]);
    
    logger.timeEnd("Checking and fixing gitignore configuration", gitignoreStartTime);
    
    // Step 4: Preview Deployment
    showWorkflowProgress(4);
    
    logger.info("Starting preview deployment. This may take a few minutes...");
    
    // Run the preview workflow with better error handling
    const previewCommand = 'pnpm run preview';
    logger.info("\nRunning preview deployment workflow...");
    
    // Track overall workflow success
    let workflowSuccess = true;
    let previewUrls = null;
    
    try {
      // Execute the preview command with dedicated handling for preview deployment
      // Use inherit for stdio to show real-time output, which is important for long-running commands
      const result = executeCommand(previewCommand, { 
        stdio: 'inherit', // Change from 'pipe' to 'inherit' to show real-time output
        suppressErrors: true,
        disableCache: true, // Ensure we don't use cached results for deployment
        timeout: 600000 // 10 minute timeout for preview deployment
      });
      
      // Since we're using stdio: 'inherit', we won't have output in the result object
      // Instead, we need to check if the command completed successfully based on exit code
      if (!result.success) {
        logger.warn("Preview deployment command exited with non-zero status");
        
        // Try to find deployment logs in the temp directory
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // Check if deployment actually completed despite errors
        logger.info("Checking for preview URLs in deployment logs...");
        
        try {
          // Import report collector functions dynamically
          const reportModule = await import('./reports/report-collector.js');
          
          // Try to extract URLs from logs
          previewUrls = reportModule.extractPreviewUrls({tempDir});
          
          if (previewUrls && (previewUrls.admin || previewUrls.hours)) {
            logger.success("Found preview URLs despite deployment warnings!");
            
            // Display the URLs
            if (previewUrls.admin) {
              logger.link("Admin Dashboard", previewUrls.admin);
            }
            
            if (previewUrls.hours) {
              logger.link("Hours App", previewUrls.hours);
            }
            
            // Mark as partial success
            logger.warn("Deployment completed with warnings. Preview URLs are available.");
            workflowSuccess = true;
            
            // Open preview dashboard in browser automatically
            openPreviewDashboard();
          } else {
            logger.error("Could not find valid preview URLs. Deployment likely failed.");
            workflowSuccess = false;
          }
        } catch (extractError) {
          logger.error(`Error extracting preview URLs: ${extractError.message}`);
          workflowSuccess = false;
        }
      } else {
        logger.success("Preview deployment command completed successfully!");
        
        // Import report collector functions dynamically
        const reportModule = await import('./reports/report-collector.js');
        
        // Extract URLs from logs
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // Extract URLs from the logs
        previewUrls = reportModule.extractPreviewUrls({tempDir});
        
        if (previewUrls && (previewUrls.admin || previewUrls.hours)) {
          logger.success("Preview URLs extracted successfully!");
          
          // Display the URLs
          if (previewUrls.admin) {
            logger.link("Admin Dashboard", previewUrls.admin);
          }
          
          if (previewUrls.hours) {
            logger.link("Hours App", previewUrls.hours);
          }
          
          workflowSuccess = true;
          
          // Open preview dashboard in browser automatically
          openPreviewDashboard();
        } else {
          logger.warn("Could not extract preview URLs from deployment logs.");
          logger.warn("Deployment may have succeeded, but no URLs were found.");
          workflowSuccess = true; // Command succeeded, but URL extraction failed
        }
      }
      
      if (!workflowSuccess) {
        logger.warn("The preview deployment encountered errors. Please address them before continuing.");
        logger.info("You might need to run 'firebase login' to refresh your authentication.");
        
        const shouldContinue = await prompt("Would you still like to continue with the workflow? (y/N): ");
        if (shouldContinue.toLowerCase() !== 'y') {
          logger.info("Exiting workflow. Please fix the issues and try again.");
          rl.close();
          return;
        }
      }
    } catch (error) {
      logger.error(`Error running preview: ${error.message}`);
      workflowSuccess = false;
      
      const shouldContinue = await prompt("Would you like to continue with the workflow despite the error? (y/N): ");
      if (shouldContinue.toLowerCase() !== 'y') {
        logger.info("Exiting workflow. Please fix the issues and try again.");
        rl.close();
        return;
      }
    }
    
    // Store preview URLs in workflow data
    workflowData.previewUrls = previewUrls;
    
    // Step 5: Pull Request
    showWorkflowProgress(5);
    
    const shouldCreatePR = await prompt("Would you like to create a pull request? (Y/n): ");
    if (shouldCreatePR.toLowerCase() !== 'n') {
      // Check for uncommitted changes that need to be committed before PR creation
      if (hasUncommittedChanges()) {
        logger.info("Uncommitted changes detected that should be committed before creating PR.");
        logger.info("Modified files:");
        logger.info(executeCommand('git status --short').output);
        
        // Offer to auto-commit all remaining changes
        const shouldAutoCommit = await prompt("Would you like to automatically commit these changes before creating PR? (Y/n): ");
        if (shouldAutoCommit.toLowerCase() !== 'n') {
          // Ask for commit message
          let defaultMessage = `Updates after successful preview deployment`;
          const commitMessage = await prompt(`Enter commit message [${defaultMessage}]: `);
          const finalMessage = commitMessage || defaultMessage;
          
          // Commit changes
          logger.info("Auto-committing changes...");
          executeCommand('git add .');
          const commitResult = executeCommand(`git commit -m "${finalMessage}"`);
          
          if (commitResult.success) {
            logger.success("Changes committed successfully!");
          } else {
            logger.error("Failed to commit changes. Please commit manually before creating PR.");
            const shouldContinue = await prompt("Would you like to continue with PR creation anyway? (y/N): ");
            if (shouldContinue.toLowerCase() !== 'y') {
              logger.info("PR creation canceled. Commit your changes manually and try again.");
              return;
            }
          }
        } else {
          // User chose not to auto-commit
          logger.warn("Proceeding with PR creation with uncommitted changes.");
          logger.warn("Note: You may encounter errors during PR creation due to uncommitted changes.");
        }
      }
      
      // Generate PR title and description suggestions
      logger.info("Generating PR title and description suggestions based on your changes...");
      const suggestion = suggestPRContent();
      
      // Enhance description with preview URLs if available
      if (previewUrls && (previewUrls.admin || previewUrls.hours)) {
        // Add preview links section to the suggested description
        suggestion.description += "\n\n## Preview Deployment\n";
        
        if (previewUrls.admin) {
          suggestion.description += `- [Admin Dashboard](${previewUrls.admin})\n`;
        }
        
        if (previewUrls.hours) {
          suggestion.description += `- [Hours App](${previewUrls.hours})\n`;
        }
        
        if (previewUrls.urls && previewUrls.urls.length > 0) {
          previewUrls.urls.forEach(url => {
            suggestion.description += `- [Preview](${url})\n`;
          });
        }
        
        logger.info("Enhanced description with preview URLs from successful deployment.");
      }
      
      // Ask for PR title with suggestion
      const prTitle = await prompt(`Enter PR title [${suggestion.title}]: `);
      const finalTitle = prTitle || suggestion.title;
      
      // Show suggested description
      logger.info("Suggested PR description:");
      logger.info("------------------------");
      logger.info(suggestion.description);
      logger.info("------------------------");
      
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
      const prSuccess = await createPullRequest(finalTitle, finalDescription, workflowData);
      
      // If PR was successful, offer guidance on post-PR workflow
      if (prSuccess) {
        logger.sectionHeader('AFTER PR IS MERGED');
        logger.info("After your PR is merged on GitHub, follow these steps:");
        logger.info("1. Switch to main branch: git checkout main");
        logger.info("2. Pull latest changes: git pull origin main");
        logger.info("3. Deploy to production: node scripts/deploy.js \"Deploy merged PR changes\"");
        logger.info("4. Start a new feature with: pnpm run workflow:new");
        logger.info("\nYou can run 'pnpm run sync-main' at any time to update your local main branch.");
        
        // Add a clearer deployment call-to-action
        logger.warning("\nIMPORTANT: After your PR is merged to main, remember to deploy to production!");
      }
    }
    
    // Step 6: Workflow Completion
    showWorkflowProgress(6);
    
    // Final status message
    if (workflowSuccess) {
      logger.success("\nWorkflow completed successfully!");
      workflowData.workflowSuccess = true;
    } else {
      logger.warn("\nWorkflow completed with warnings! Please review the log messages above.");
      workflowData.workflowSuccess = false;
    }
    
    // Display workflow summary
    displayWorkflowSummary(workflowData);
    
    // Provide next steps
    logger.info('\nNEXT STEPS');
    logger.info('='.repeat(30));
    logger.info(`You are on branch: ${branchName}`);
    logger.info("What would you like to do next?");
    logger.info("1. Continue working on this branch");
    logger.info("2. Run preview deployment again: pnpm run preview");
    logger.info("3. Create/update PR: pnpm run pr:create");
    logger.info("4. Switch to main branch: git checkout main");
    logger.info("5. Sync main with remote: pnpm run sync-main");
    logger.info("6. Deploy to production (from main): node scripts/deploy.js \"Your message\"");
    
    // Final prompt - this is just for UX completion, no action needed
    await prompt("Press Enter to exit...");
  } catch (error) {
    logger.error(`\nWorkflow error: ${error.message}`);
    workflowData.workflowSuccess = false;
    // Still show summary even if there was an error
    displayWorkflowSummary(workflowData);
  } finally {
    // Reset terminal title
    resetTerminalTitle();
    
    // Clean up and free resources
    stopProcessMonitoring();
    commandCache.clear();
    
    // Close the readline interface
    rl.close();
  }
}

// Run the workflow
runWorkflow(); 