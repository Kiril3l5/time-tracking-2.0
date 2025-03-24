#!/usr/bin/env node

/**
 * Git Authentication Module
 * 
 * Provides utilities for checking Git authentication, repository information,
 * and managing Git-related operations for the preview workflow.
 * 
 * Features:
 * - Check Git configuration (user name, email)
 * - Get current branch information
 * - Extract PR number from branch name
 * - Get commit information
 * - Add comments to GitHub PRs
 * - Generate branch-based identifiers
 * 
 * @module auth/git-auth
 * @example
 * // Basic usage example
 * import * as gitAuth from './auth/git-auth.js';
 * 
 * // Check git configuration
 * const configCheck = gitAuth.checkGitConfig();
 * console.log(`Git config valid: ${configCheck.valid}`);
 * 
 * // Get repository information
 * const branchName = gitAuth.getCurrentBranch();
 * const commitMessage = gitAuth.getLatestCommitMessage();
 * console.log(`Current branch: ${branchName}`);
 * console.log(`Latest commit: ${commitMessage}`);
 */

import * as commandRunner from '../core/command-runner.js';
import * as logger from '../core/logger.js';
import fs from 'fs';

/* global process */

/**
 * Get the current Git branch name
 * 
 * @function getCurrentBranch
 * @returns {string|null} Current branch name or null if not in a Git repository
 * @description Determines the name of the current Git branch by executing the
 * git rev-parse command. Returns null if not in a Git repository or if an error occurs.
 * @example
 * // Get the current branch
 * const branch = getCurrentBranch();
 * if (branch) {
 *   console.log(`Working on branch: ${branch}`);
 *   
 *   // Check if we're on a feature branch
 *   if (branch.startsWith('feature/')) {
 *     console.log('This is a feature branch');
 *   }
 * } else {
 *   console.warn('Not in a Git repository or Git is not installed');
 * }
 */
export function getCurrentBranch() {
  const result = commandRunner.runCommand('git rev-parse --abbrev-ref HEAD', {
    stdio: 'pipe',
    ignoreError: true
  });
  
  if (!result.success) {
    logger.error('Failed to get current Git branch');
    logger.debug(result.error || 'git rev-parse command failed');
    return null;
  }
  
  const branch = result.output.trim();
  
  if (branch === 'HEAD') {
    // Detached HEAD state, try to get the branch from a different command
    const refResult = commandRunner.runCommand('git symbolic-ref --short HEAD', {
      stdio: 'pipe',
      ignoreError: true
    });
    
    if (refResult.success) {
      return refResult.output.trim();
    }
    
    // If still in detached head, try to get the branch from CI environment variables
    if (process.env.GITHUB_REF) {
      // In GitHub Actions
      const refMatch = process.env.GITHUB_REF.match(/refs\/heads\/(.+)/);
      if (refMatch && refMatch[1]) {
        return refMatch[1];
      }
    }
    
    logger.warn('Cannot determine branch name, in detached HEAD state');
    return null;
  }
  
  return branch;
}

/**
 * Get the current commit hash
 * 
 * @function getCurrentCommit
 * @param {boolean} [short=false] - Whether to get the short commit hash
 * @returns {string|null} Commit hash or null if not in a Git repository
 * @description Retrieves the SHA-1 hash of the current commit, either in full form
 * or abbreviated (short) form. This is useful for identifying specific commits in
 * logs or deployment records.
 * @example
 * // Get full commit hash
 * const fullCommit = getCurrentCommit();
 * console.log(`Full commit: ${fullCommit}`);
 * 
 * // Get short commit hash for display
 * const shortCommit = getCurrentCommit(true);
 * console.log(`Deploying commit: ${shortCommit}`);
 */
export function getCurrentCommit(short = false) {
  const cmd = short ? 'git rev-parse --short HEAD' : 'git rev-parse HEAD';
  
  const result = commandRunner.runCommand(cmd, {
    stdio: 'pipe',
    ignoreError: true
  });
  
  if (!result.success) {
    logger.error('Failed to get current Git commit SHA');
    return null;
  }
  
  return result.output.trim();
}

/**
 * Extract PR number from branch name
 * 
 * @function extractPrNumber
 * @param {string} branch - The branch name to extract PR number from
 * @returns {string|null} PR number or null if not a PR branch
 * @description Attempts to extract a pull request number from a branch name
 * using common patterns like 'pr/123', 'PR-123', etc. Returns the PR number
 * as a string if found, or null if the branch doesn't follow a PR branch pattern.
 * @example
 * // Extract PR number from various branch formats
 * const branch = getCurrentBranch();
 * const prNumber = extractPrNumber(branch);
 * 
 * if (prNumber) {
 *   console.log(`This is PR #${prNumber}`);
 *   // Use the PR number to fetch PR information or post comments
 * } else {
 *   console.log('This is not a PR branch');
 * }
 * 
 * // Specific examples:
 * extractPrNumber('pr/123');          // returns '123'
 * extractPrNumber('PR-123');          // returns '123'
 * extractPrNumber('feature/PR-123');  // returns '123'
 * extractPrNumber('main');            // returns null
 */
export function extractPrNumber(branchName) {
  if (!branchName) return null;
  
  // Check for standard PR patterns
  const prPatterns = [
    /^pr[/-]?(\d+)$/i,         // pr-123, pr123, PR-123
    /issue[/-]?(\d+)$/i,       // issue-123, issue123
    /#(\d+)$/                   // branch-name-#123
  ];
  
  for (const pattern of prPatterns) {
    const match = branchName.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  // Check specifically for GitHub PR branch format
  // GitHub creates branches like 'pull/123/head' or 'pull/123/merge'
  const githubPrMatch = branchName.match(/^pull\/(\d+)(\/head|\/merge)?$/);
  if (githubPrMatch && githubPrMatch[1]) {
    return githubPrMatch[1];
  }
  
  return null;
}

/**
 * Check if the current branch is associated with a PR
 * @returns {Object} PR information or null if not a PR branch
 */
export function getPrInfo() {
  const branch = getCurrentBranch();
  if (!branch) {
    return null;
  }
  
  // Try to extract PR number from branch name first
  const prNumber = extractPrNumber(branch);
  
  if (prNumber) {
    return {
      branch,
      prNumber,
      source: 'branch-name'
    };
  }
  
  // Try to get PR info from GitHub API if in a GitHub Actions workflow
  if (process.env.GITHUB_EVENT_PATH) {
    try {
      // In GitHub Actions, event info is stored in this file
      const eventPath = process.env.GITHUB_EVENT_PATH;
      
      if (fs.existsSync(eventPath)) {
        const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
        
        if (eventData.pull_request && eventData.pull_request.number) {
          return {
            branch,
            prNumber: String(eventData.pull_request.number),
            source: 'github-event',
            url: eventData.pull_request.html_url
          };
        }
      }
    } catch (error) {
      logger.warn('Failed to read GitHub event data');
      logger.debug(error.message);
    }
  }
  
  return null;
}

/**
 * Check if the Git configuration is properly set up
 * @returns {Object} Git configuration status
 */
export function checkGitConfig() {
  logger.info('Checking Git configuration...');
  
  const checks = {
    userEmail: null,
    userName: null,
    remoteOrigin: null,
    hasUncommittedChanges: false
  };
  
  // Check user.email
  const emailResult = commandRunner.runCommand('git config user.email', {
    stdio: 'pipe',
    ignoreError: true
  });
  
  checks.userEmail = emailResult.success ? emailResult.output.trim() : null;
  
  // Check user.name
  const nameResult = commandRunner.runCommand('git config user.name', {
    stdio: 'pipe',
    ignoreError: true
  });
  
  checks.userName = nameResult.success ? nameResult.output.trim() : null;
  
  // Check remote origin
  const remoteResult = commandRunner.runCommand('git config --get remote.origin.url', {
    stdio: 'pipe',
    ignoreError: true
  });
  
  checks.remoteOrigin = remoteResult.success ? remoteResult.output.trim() : null;
  
  // Check for uncommitted changes
  const statusResult = commandRunner.runCommand('git status --porcelain', {
    stdio: 'pipe',
    ignoreError: true
  });
  
  checks.hasUncommittedChanges = statusResult.success && statusResult.output.trim() !== '';
  
  // Determine overall status
  const isConfigured = checks.userEmail && checks.userName && checks.remoteOrigin;
  
  if (isConfigured) {
    logger.success('Git configuration verified');
    logger.info(`User: ${checks.userName} <${checks.userEmail}>`);
    logger.info(`Remote: ${checks.remoteOrigin}`);
    
    if (checks.hasUncommittedChanges) {
      logger.warn('There are uncommitted changes in the repository');
    }
  } else {
    logger.error('Git configuration is incomplete');
    
    if (!checks.userEmail) {
      logger.info('Missing user.email. Set with: git config user.email "your.email@example.com"');
    }
    
    if (!checks.userName) {
      logger.info('Missing user.name. Set with: git config user.name "Your Name"');
    }
    
    if (!checks.remoteOrigin) {
      logger.info('No remote origin configured');
    }
  }
  
  return {
    configured: isConfigured,
    userEmail: checks.userEmail,
    userName: checks.userName,
    remoteOrigin: checks.remoteOrigin,
    hasUncommittedChanges: checks.hasUncommittedChanges
  };
}

/**
 * Check if GitHub token is available
 * 
 * @function hasGitHubToken
 * @returns {boolean} Whether a GitHub token is available
 * @description Checks if a GitHub token is available in the environment
 * variables or in a local configuration file. This token is required for
 * operations that interact with the GitHub API, such as posting comments.
 * @example
 * // Check for GitHub token before attempting API operations
 * if (hasGitHubToken()) {
 *   console.log('GitHub token is available, can use GitHub API');
 *   // Proceed with GitHub API operations
 * } else {
 *   console.warn('No GitHub token available, skipping GitHub API operations');
 *   // Skip or handle alternative paths
 * }
 */
export function hasGitHubToken() {
  // Check environment variables for token
  if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) {
    logger.debug('GitHub token found in environment variables');
    return true;
  }
  
  // Check for token file
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (homeDir) {
    const tokenPath = `${homeDir}/.github_token`;
    if (fs.existsSync(tokenPath)) {
      logger.debug('GitHub token file found');
      return true;
    }
  }
  
  logger.debug('No GitHub token found');
  return false;
}

/**
 * Get GitHub token from environment or file
 * 
 * @function getGitHubToken
 * @returns {string|null} GitHub token or null if not available
 * @description Retrieves the GitHub token from environment variables or a local
 * configuration file. The token is necessary for authenticating with the GitHub API.
 * Prioritizes tokens in the following order: GITHUB_TOKEN, GH_TOKEN, ~/.github_token.
 * @example
 * // Get GitHub token for API authentication
 * const token = getGitHubToken();
 * 
 * if (token) {
 *   // Use token to authenticate GitHub API request
 *   fetch('https://api.github.com/repos/owner/repo/issues/123/comments', {
 *     method: 'POST',
 *     headers: {
 *       'Authorization': `token ${token}`,
 *       'Content-Type': 'application/json'
 *     },
 *     body: JSON.stringify({ body: 'Deployment successful!' })
 *   });
 * } else {
 *   console.error('GitHub token not available, cannot post comment');
 * }
 */
export function getGitHubToken() {
  // Try environment variables first
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }
  
  if (process.env.GH_TOKEN) {
    return process.env.GH_TOKEN;
  }
  
  // Try to load from token file
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (homeDir) {
    const tokenPath = `${homeDir}/.github_token`;
    if (fs.existsSync(tokenPath)) {
      try {
        return fs.readFileSync(tokenPath, 'utf8').trim();
      } catch (error) {
        logger.warn(`Failed to read GitHub token file: ${error.message}`);
      }
    }
  }
  
  return null;
}

/**
 * Add a deployment comment to a PR
 * 
 * @async
 * @function addDeploymentComment
 * @param {string} prNumber - The PR number to comment on
 * @param {Object} deployInfo - Deployment information
 * @param {string} deployInfo.url - The deployment URL
 * @param {string} [deployInfo.environment='preview'] - The deployment environment
 * @param {string} [deployInfo.message] - Additional message to include
 * @returns {Promise<boolean>} Whether the comment was successfully added
 * @description Posts a comment to a GitHub pull request with information about a deployment,
 * including the URL and environment details. This helps team members quickly access
 * preview deployments directly from the PR. Requires a GitHub token with appropriate permissions.
 * @example
 * // After successful preview deployment, post a comment to the PR
 * const prNumber = extractPrNumber(getCurrentBranch());
 * if (prNumber) {
 *   const success = await addDeploymentComment(prNumber, {
 *     url: 'https://pr-123-myapp.web.app',
 *     environment: 'preview',
 *     message: 'Deployment includes latest UI changes'
 *   });
 *   
 *   if (success) {
 *     console.log('Added deployment comment to PR');
 *   } else {
 *     console.warn('Failed to add deployment comment');
 *   }
 * }
 */
export async function addDeploymentComment(prNumber, deployInfo) {
  if (!prNumber) {
    logger.warn('Cannot add PR comment: No PR number provided');
    return false;
  }
  
  if (!deployInfo || !deployInfo.url) {
    logger.warn('Cannot add PR comment: No deployment URL provided');
    return false;
  }
  
  const token = getGitHubToken();
  if (!token) {
    logger.warn('Cannot add PR comment: No GitHub token available');
    return false;
  }
  
  // Get repository information
  const repoInfo = getRepositoryInfo();
  if (!repoInfo) {
    logger.warn('Cannot add PR comment: Failed to get repository information');
    return false;
  }
  
  const { owner, repo } = repoInfo;
  const environment = deployInfo.environment || 'preview';
  const message = deployInfo.message ? `\n\n${deployInfo.message}` : '';
  
  const commentBody = `
## 🚀 Deployment Update

A new ${environment} deployment is available!

📱 **Preview URL**: [${deployInfo.url}](${deployInfo.url})

💻 **Environment**: ${environment}
⏱️ **Deployed at**: ${new Date().toISOString()}${message}

---
*Automatic comment from deployment workflow*
  `.trim();
  
  try {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'GitHub-Deployment-Bot'
      },
      body: JSON.stringify({ body: commentBody })
    });
    
    if (response.ok) {
      logger.success(`Added deployment comment to PR #${prNumber}`);
      return true;
    } else {
      const errorData = await response.text();
      logger.error(`Failed to add PR comment: ${response.status} ${response.statusText}`);
      logger.debug(`API response: ${errorData}`);
      return false;
    }
  } catch (error) {
    logger.error(`Failed to add PR comment: ${error.message}`);
    return false;
  }
}

/**
 * Get repository owner and name
 * 
 * @function getRepositoryInfo
 * @returns {Object|null} Repository information { owner, repo } or null if not available
 * @description Extracts the repository owner and name from the Git remote URL.
 * This information is needed for GitHub API operations. Returns null if the
 * repository information cannot be determined.
 * @example
 * // Get repository information for API requests
 * const repoInfo = getRepositoryInfo();
 * 
 * if (repoInfo) {
 *   console.log(`Repository: ${repoInfo.owner}/${repoInfo.repo}`);
 *   
 *   // Use in GitHub API URL
 *   const apiUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/pulls`;
 * } else {
 *   console.error('Could not determine repository information');
 * }
 */
export function getRepositoryInfo() {
  try {
    // Try to get from environment first (for CI)
    if (process.env.GITHUB_REPOSITORY) {
      const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
      if (owner && repo) {
        return { owner, repo };
      }
    }
    
    // Get remote URL from git config
    const result = commandRunner.runCommand('git config --get remote.origin.url', {
      stdio: 'pipe',
      ignoreError: true
    });
    
    if (!result.success || !result.output) {
      return null;
    }
    
    const url = result.output.trim();
    
    // Parse different git URL formats
    let match;
    
    // HTTPS format: https://github.com/owner/repo.git
    match = url.match(/https:\/\/github\.com\/([^\/]+)\/([^\/\.]+)(\.git)?$/);
    if (match) {
      return {
        owner: match[1],
        repo: match[2]
      };
    }
    
    // SSH format: git@github.com:owner/repo.git
    match = url.match(/git@github\.com:([^\/]+)\/([^\/\.]+)(\.git)?$/);
    if (match) {
      return {
        owner: match[1],
        repo: match[2]
      };
    }
    
    logger.warn(`Could not parse repository info from URL: ${url}`);
    return null;
  } catch (error) {
    logger.warn(`Failed to get repository info: ${error.message}`);
    return null;
  }
}

export default {
  getCurrentBranch,
  getCurrentCommit,
  extractPrNumber,
  getPrInfo,
  checkGitConfig,
  hasGitHubToken,
  getGitHubToken,
  addDeploymentComment,
  getRepositoryInfo
}; 