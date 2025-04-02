/**
 * GitHub PR Manager Module
 * 
 * Handles GitHub Pull Request operations including creation, updates, and status checks.
 */

import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';
import getWorkflowState from '../workflow/workflow-state.js';
import { setTimeout } from 'timers/promises';

/**
 * Check GitHub authentication
 * @private
 * @returns {Promise<boolean>} Whether authenticated
 */
async function checkGitHubAuth() {
  try {
    const result = await commandRunner.runCommand('gh auth status', { stdio: 'pipe' });
    return result.success;
  } catch (error) {
    return false;
  }
}

/**
 * Create a new Pull Request with auth check
 * @param {Object} options - PR options
 * @param {string} options.title - PR title
 * @param {string} options.body - PR description
 * @param {string} options.baseBranch - Base branch name
 * @param {string} options.headBranch - Head branch name
 * @returns {Promise<Object>} PR creation result
 */
export async function createPR(options) {
  const { title, body, baseBranch, headBranch } = options;
  
  try {
    // Check GitHub authentication first
    if (!await checkGitHubAuth()) {
      throw new Error('GitHub authentication required. Please run "gh auth login" first.');
    }

    // Validate required fields
    if (!title || !baseBranch || !headBranch) {
      throw new Error('Missing required PR fields');
    }

    // Create PR using GitHub CLI with retries
    const maxRetries = 2;
    const retryDelay = 1000;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await commandRunner.runCommand(
          `gh pr create --title "${title}" --body "${body || ''}" --base ${baseBranch} --head ${headBranch}`,
          { stdio: 'pipe' }
        );

        if (!result.success) {
          throw new Error(`Failed to create PR: ${result.error}`);
        }

        // Extract PR URL from output
        const prUrl = result.stdout.trim();
        
        // Update workflow state
        const workflowState = getWorkflowState();
        workflowState.updateState({
          prUrl,
          prStatus: 'created'
        });

        return {
          success: true,
          prUrl,
          prNumber: prUrl.split('/').pop()
        };
      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw error;
        }
        logger.warn(`PR creation attempt ${attempt + 1} failed, retrying in ${retryDelay}ms...`);
        await setTimeout(retryDelay);
      }
    }
  } catch (error) {
    logger.error('Failed to create PR:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update an existing Pull Request
 * @param {Object} options - PR update options
 * @param {string} options.prNumber - PR number
 * @param {string} [options.title] - New PR title
 * @param {string} [options.body] - New PR description
 * @param {string} [options.baseBranch] - New base branch
 * @returns {Promise<Object>} PR update result
 */
export async function updatePR(options) {
  const { prNumber, title, body, baseBranch } = options;
  
  try {
    if (!prNumber) {
      throw new Error('PR number is required');
    }

    // Build update command
    const updateArgs = [];
    if (title) updateArgs.push(`--title "${title}"`);
    if (body) updateArgs.push(`--body "${body}"`);
    if (baseBranch) updateArgs.push(`--base ${baseBranch}`);

    if (updateArgs.length === 0) {
      throw new Error('No update fields provided');
    }

    // Update PR using GitHub CLI
    const result = await commandRunner.runCommand(
      `gh pr edit ${prNumber} ${updateArgs.join(' ')}`,
      { stdio: 'pipe' }
    );

    if (!result.success) {
      throw new Error(`Failed to update PR: ${result.error}`);
    }

    // Update workflow state
    const workflowState = getWorkflowState();
    workflowState.updateState({
      prStatus: 'updated'
    });

    return {
      success: true,
      prNumber
    };
  } catch (error) {
    logger.error('Failed to update PR:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check PR status
 * @param {string} prNumber - PR number
 * @returns {Promise<Object>} PR status
 */
export async function checkPRStatus(prNumber) {
  try {
    if (!prNumber) {
      throw new Error('PR number is required');
    }

    // Get PR status using GitHub CLI
    const result = await commandRunner.runCommand(
      `gh pr view ${prNumber} --json state,mergeable,reviewDecision,checks`,
      { stdio: 'pipe' }
    );

    if (!result.success) {
      throw new Error(`Failed to check PR status: ${result.error}`);
    }

    const status = JSON.parse(result.stdout);

    // Update workflow state
    const workflowState = getWorkflowState();
    workflowState.updateState({
      prStatus: status.state,
      prMergeable: status.mergeable,
      prReviewDecision: status.reviewDecision
    });

    return {
      success: true,
      status
    };
  } catch (error) {
    logger.error('Failed to check PR status:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Merge a Pull Request
 * @param {Object} options - Merge options
 * @param {string} options.prNumber - PR number
 * @param {boolean} [options.deleteBranch=true] - Whether to delete the branch after merge
 * @returns {Promise<Object>} Merge result
 */
export async function mergePR(options) {
  const { prNumber, deleteBranch = true } = options;
  
  try {
    if (!prNumber) {
      throw new Error('PR number is required');
    }

    // Check PR status first
    const statusResult = await checkPRStatus(prNumber);
    if (!statusResult.success) {
      throw new Error('Failed to check PR status before merge');
    }

    const { status } = statusResult;
    if (status.state !== 'OPEN') {
      throw new Error(`PR is not open (current state: ${status.state})`);
    }

    if (!status.mergeable) {
      throw new Error('PR is not mergeable');
    }

    // Merge PR using GitHub CLI
    const mergeArgs = ['--merge'];
    if (deleteBranch) mergeArgs.push('--delete-branch=false');

    const result = await commandRunner.runCommand(
      `gh pr merge ${prNumber} ${mergeArgs.join(' ')}`,
      { stdio: 'pipe' }
    );

    if (!result.success) {
      throw new Error(`Failed to merge PR: ${result.error}`);
    }

    // Update workflow state
    const workflowState = getWorkflowState();
    workflowState.updateState({
      prStatus: 'merged'
    });

    return {
      success: true,
      prNumber
    };
  } catch (error) {
    logger.error('Failed to merge PR:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export default {
  createPR,
  updatePR,
  checkPRStatus,
  mergePR
}; 