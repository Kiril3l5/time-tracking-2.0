/**
 * GitHub Manager Module
 * 
 * Handles GitHub operations including PR creation and updates.
 */

import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';
import { workflowState } from '../workflow/workflow-state.js';

/**
 * Create a pull request
 * @param {Object} options - PR options
 * @returns {Promise<Object>} PR result
 */
export async function createPR(options = {}) {
  try {
    const { title, body, draft = false } = options;
    
    // Get current branch
    const currentBranch = await commandRunner.runCommand('git rev-parse --abbrev-ref HEAD');
    
    // Create PR command
    const prCommand = `gh pr create --title "${title}" --body "${body}" ${draft ? '--draft' : ''}`;
    
    // Create PR
    const result = await commandRunner.runCommand(prCommand);
    
    if (!result.success) {
      throw new Error('Failed to create PR');
    }
    
    logger.success('Pull request created successfully');
    return {
      success: true,
      prUrl: result.output
    };
  } catch (error) {
    logger.error('Failed to create pull request:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update a pull request
 * @param {Object} options - PR update options
 * @returns {Promise<Object>} Update result
 */
export async function updatePR(options = {}) {
  try {
    const { title, body, prNumber } = options;
    
    // Update PR command
    const updateCommand = `gh pr edit ${prNumber} --title "${title}" --body "${body}"`;
    
    // Update PR
    const result = await commandRunner.runCommand(updateCommand);
    
    if (!result.success) {
      throw new Error('Failed to update PR');
    }
    
    logger.success('Pull request updated successfully');
    return {
      success: true,
      prUrl: result.output
    };
  } catch (error) {
    logger.error('Failed to update pull request:', error);
    return {
      success: false,
      error: error.message
    };
  }
} 