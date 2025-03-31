/**
 * Deployment Manager Module
 * 
 * Handles deployment to Firebase preview environments.
 */

import { commandRunner } from '../core/command-runner.js';
import { logger } from '../core/logger.js';
import { getCurrentBranch } from './branch-manager.js';

/**
 * Deploy a package to Firebase preview
 * 
 * @param {Object} options - Deployment options
 * @param {string} options.target - Target hosting site (hours, admin)
 * @param {string} options.channelId - Channel ID for preview
 * @returns {Promise<Object>} Deployment result
 */
export async function deployPackage(options) {
  const { target, channelId } = options;
  
  try {
    logger.info(`Deploying ${target} to preview channel: ${channelId}`);
    
    // Validate channel ID length
    if (channelId.length > 63) {
      throw new Error(`Channel ID '${channelId}' exceeds Firebase's 63 character limit`);
    }
    
    // Validate target
    if (!target || (target !== 'hours' && target !== 'admin')) {
      throw new Error(`Invalid target '${target}'. Must be 'hours' or 'admin'`);
    }
    
    // Run Firebase deploy command
    const result = await commandRunner.runCommandAsync(
      `firebase hosting:channel:deploy ${channelId} --only ${target}`, 
      { 
        stdio: 'inherit',
        timeout: 120000 // 2 minute timeout
      }
    );
    
    if (!result.success) {
      // Try to provide more specific error message
      let errorMessage = `Deployment failed: ${result.error || 'Unknown error'}`;
      
      if (result.error && result.error.includes('not authenticated')) {
        errorMessage = 'Firebase authentication failed. Please run "firebase login" first.';
      } else if (result.error && result.error.includes('not detected') || result.error && result.error.includes('not found')) {
        errorMessage = `Hosting target '${target}' not found. Run 'firebase target:apply hosting ${target} ${target}-autonomyhero-2024'.`;
      } else if (result.error && result.error.includes('limit')) {
        errorMessage = 'Channel limit reached. Try running "firebase hosting:channel:list" and delete old channels.';
      }
      
      throw new Error(errorMessage);
    }
    
    // Get channel URL from the list command since we can't reliably extract it from deploy output
    const siteName = `${target}-autonomyhero-2024`;
    const channelListResult = await commandRunner.runCommandAsync(
      `firebase hosting:channel:list --site ${siteName}`, 
      { stdio: 'pipe' }
    );
    
    let previewUrl = null;
    
    if (channelListResult.success) {
      // Parse output to find the URL for our channel
      const channelListOutput = channelListResult.output || '';
      const channelLines = channelListOutput.split('\n');
      
      // Look for our channel ID and extract the URL
      for (const line of channelLines) {
        if (line.includes(channelId)) {
          // Extract URL from the line using regex
          const urlMatch = line.match(/https:\/\/[^\s]+/);
          if (urlMatch) {
            previewUrl = urlMatch[0];
            break;
          }
        }
      }
    }
    
    if (!previewUrl) {
      logger.warn(`Could not extract preview URL for ${target} from Firebase output. ` +
                  `Run 'firebase hosting:channel:list --site ${siteName}' to view URLs.`);
    }
    
    return {
      success: true,
      target,
      channelId,
      url: previewUrl
    };
  } catch (error) {
    logger.error(`Deployment failed: ${error.message}`);
    
    return {
      success: false,
      target,
      error: error.message
    };
  }
}

/**
 * Create a unique channel ID based on branch and timestamp
 * 
 * @returns {Promise<string>} Channel ID
 */
export async function createChannelId() {
  const branch = await getCurrentBranch();
  // Take only the first 20 characters of the branch name to avoid excessive length
  const truncatedBranch = branch.substring(0, 20);
  const sanitizedBranch = truncatedBranch.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
  
  // Ensure the total length is reasonable (Firebase has limits on channel ID length)
  const channelId = `preview-${sanitizedBranch}-${timestamp}`;
  
  // Firebase has a 63 character limit for channel IDs
  if (channelId.length > 63) {
    // Further truncate the branch name if needed
    const maxBranchLength = Math.max(8, 20 - (channelId.length - 63));
    const shorterBranch = branch.substring(0, maxBranchLength);
    const shorterSanitizedBranch = shorterBranch.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    return `preview-${shorterSanitizedBranch}-${timestamp}`;
  }
  
  return channelId;
} 