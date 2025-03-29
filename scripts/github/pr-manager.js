/**
 * PR Manager Module
 * 
 * Handles creation and management of GitHub pull requests.
 * Provides a consistent interface for PR operations.
 */

import { execSync } from 'child_process';
import * as logger from '../core/logger.js';
import { promises as fs } from 'fs';
import { fileURLToPath, URLSearchParams } from 'url';
import * as path from 'path';

// Try to import optional dependencies
let open;
try {
  // Dynamic import of optional dependency
  const openModule = await import('open');
  open = openModule.default;
} catch (error) {
  // Will use fallback if open is not available
}

/**
 * Get the repository URL from Git configuration
 * @returns {Promise<string|null>} Repository URL or null if not found
 */
export async function getRepoUrl() {
  try {
    // Get the remote URL
    const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
    
    // Handle different URL formats (HTTPS vs SSH)
    if (remoteUrl.startsWith('https://')) {
      // https://github.com/username/repo.git → https://github.com/username/repo
      return remoteUrl.replace(/\.git$/, '');
    } else if (remoteUrl.startsWith('git@')) {
      // git@github.com:username/repo.git → https://github.com/username/repo
      return remoteUrl
        .replace(/^git@([^:]+):/, 'https://$1/')
        .replace(/\.git$/, '');
    }
    
    return null;
  } catch (error) {
    logger.error(`Failed to get repository URL: ${error.message}`);
    return null;
  }
}

/**
 * Create a pull request for the current branch
 * @param {Object} options - Options for creating the PR
 * @param {string} options.branch - Branch name
 * @param {string} options.title - PR title
 * @param {boolean} options.draft - Whether to create a draft PR
 * @param {Object} options.previewUrls - Preview URLs to include in the PR description
 * @param {boolean} options.verbose - Whether to show verbose output
 * @returns {Promise<{success: boolean, prUrl?: string, error?: string}>} Result
 */
export async function createPullRequest(options) {
  const { branch, title = null, draft = false, previewUrls = null, verbose = false } = options;
  
  logger.info(`Preparing pull request for branch: ${branch}`);
  
  try {
    // Get main branch name
    const mainBranch = 'main'; // Could be configurable
    
    // Skip if we're on the main branch
    const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    if (currentBranch === mainBranch) {
      logger.warn(`You are on the ${mainBranch} branch. Pull request creation skipped.`);
      return { success: true, skipped: true };
    }
    
    // Generate PR title if not provided
    const prTitle = title || `Update from branch ${branch}`;
    
    // Generate PR description with preview URLs
    let prDescription = '';
    
    if (previewUrls) {
      prDescription += `## Preview URLs\n\n`;
      
      if (previewUrls.admin) {
        prDescription += `- **Admin Dashboard**: ${previewUrls.admin}\n`;
      }
      
      if (previewUrls.hours) {
        prDescription += `- **Hours App**: ${previewUrls.hours}\n`;
      }
      
      prDescription += `\n`;
    }
    
    prDescription += `## Changes\n\nUpdates from branch \`${branch}\`\n`;
    
    // Get repo URL
    const repoUrl = await getRepoUrl();
    if (!repoUrl) {
      logger.error("Could not determine repository URL for PR creation.");
      return { success: false, error: "Could not determine repository URL" };
    }
    
    // Create the PR URL
    const prUrlParams = new URLSearchParams({
      quick_pull: '1',
      title: prTitle,
      body: prDescription
    });
    
    if (draft) {
      prUrlParams.append('draft', '1');
    }
    
    const prUrl = `${repoUrl}/compare/${mainBranch}...${branch}?${prUrlParams.toString()}`;
    
    // Try to open the URL in the browser
    if (open) {
      logger.info("Opening browser to create a new pull request...");
      await open(prUrl);
      logger.success("Browser opened for PR creation!");
    } else {
      logger.info("The 'open' package is not available. Please manually open this URL:");
      logger.info(prUrl);
    }
    
    return { success: true, prUrl };
  } catch (error) {
    logger.error(`Failed to create pull request: ${error.message}`);
    if (verbose) {
      logger.debug(error.stack || error);
    }
    return { success: false, error: error.message };
  }
}

export default {
  createPullRequest,
  getRepoUrl
}; 