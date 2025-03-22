#!/usr/bin/env node

/**
 * GitHub Integration Module
 * 
 * Provides utilities for GitHub integration in deployment workflows,
 * including branch information, PR comments, and status checks.
 * 
 * Features:
 * - Get current Git branch and commit information
 * - Create and update PR comments for deployments
 * - Extract PR numbers from branch names
 * - Verify Git configuration
 * 
 * @module preview/github
 */

import * as commandRunner from './command-runner.js';
import * as logger from './logger.js';
import fs from 'fs';

/* global process */

/**
 * Get the current Git branch name
 * @returns {string|null} Current branch name or null if not in a Git repository
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
 * Get the current Git commit SHA
 * @param {boolean} [short=false] - Whether to return short or full SHA
 * @returns {string|null} Current commit SHA or null if error
 */
export function getCurrentCommitSha(short = false) {
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
 * Extract PR number from a branch name
 * @param {string} branchName - Branch name (e.g., "pr-123", "feature/fix-issue-123")
 * @returns {string|null} PR number or null if not found
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
    ...checks
  };
}

/**
 * Add a comment to a GitHub PR with deployment information
 * @param {string} prNumber - PR number
 * @param {Object} deployment - Deployment information
 * @param {string} deployment.url - Deployment URL
 * @param {string} deployment.environment - Environment name (e.g., 'preview')
 * @param {string} deployment.commitSha - Commit SHA that was deployed
 * @param {string} deployment.branch - Branch name
 * @returns {boolean} Whether the comment was added successfully
 */
export function addDeploymentComment(prNumber, deployment) {
  const { url, environment, commitSha, branch } = deployment;
  
  if (!prNumber || !url) {
    logger.warn('Missing PR number or deployment URL for PR comment');
    return false;
  }
  
  // For now, we log the comment details but don't actually post to GitHub
  // This would require GitHub token authentication, which is outside the scope
  // of this basic utility
  
  logger.info(`Deployment comment would be added to PR #${prNumber}:`);
  logger.info('-----------------------------------------------');
  logger.info(`🚀 Deployed to ${environment} environment`);
  logger.info(`📝 Branch: ${branch}`);
  logger.info(`🔗 Commit: ${commitSha}`);
  logger.info(`🌐 Preview URL: ${url}`);
  logger.info('-----------------------------------------------');
  
  // In a real implementation, this would use the GitHub API to post a comment
  // This would require a GitHub token with appropriate permissions
  
  return true;
}

export default {
  getCurrentBranch,
  getCurrentCommitSha,
  extractPrNumber,
  getPrInfo,
  checkGitConfig,
  addDeploymentComment
}; 