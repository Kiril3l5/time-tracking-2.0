#!/usr/bin/env node

/**
 * Firebase Deployment Module
 * 
 * Provides utilities for deploying to Firebase preview channels,
 * managing channel lifecycle, and cleaning up old channels.
 * 
 * Features:
 * - Deploy to Firebase preview channels
 * - Extract preview URLs from deployment output
 * - List and clean up old preview channels
 * - Support for expiring channels automatically
 * 
 * @module preview/firebase-deploy
 */

import * as commandRunner from './command-runner.js';
import * as logger from './logger.js';

/* global process */

/**
 * Deploy to a Firebase hosting preview channel
 * 
 * @param {Object} options - Deployment options
 * @param {string} options.channelId - Channel ID to deploy to
 * @param {string} options.projectId - Firebase project ID
 * @param {string} options.site - Firebase hosting site name
 * @param {string} options.buildDir - Directory containing build files
 * @param {boolean} [options.expires=false] - Whether the channel should automatically expire
 * @param {number} [options.expireDays=7] - Number of days until expiration (if expires is true)
 * @returns {Object} - Deployment result with success status and URL
 */
export async function deployToChannel(options) {
  const { 
    channelId, 
    projectId, 
    site, 
    buildDir, 
    expires = false, 
    expireDays = 7 
  } = options;
  
  logger.info(`Deploying to preview channel: ${channelId}`);
  logger.info(`Project: ${projectId}, Site: ${site}`);
  
  // Construct the deploy command
  let command = `firebase hosting:channel:deploy ${channelId}`;
  command += ` --project=${projectId}`;
  command += ` --site=${site}`;
  
  // Add expiration if requested
  if (expires) {
    const expireHours = expireDays * 24;
    command += ` --expires=${expireHours}h`;
  }
  
  // Run the deployment
  const result = await commandRunner.runCommandAsync(command, {
    ignoreError: true,
    verbose: true
  });
  
  if (!result.success) {
    logger.error('Failed to deploy to preview channel');
    return {
      success: false,
      error: result.error || 'Deployment command failed',
      command
    };
  }
  
  // Extract the preview URL from the output
  const url = extractPreviewUrl(result.output || '', site);
  
  if (!url) {
    logger.warn('Failed to extract preview URL from deployment output');
    return {
      success: true, // Deployment was successful even if we couldn't extract the URL
      url: null,
      channelId
    };
  }
  
  logger.success(`Successfully deployed to preview channel: ${channelId}`);
  logger.info(`Preview URL: ${url}`);
  
  return {
    success: true,
    url,
    channelId
  };
}

/**
 * Extract the preview URL from Firebase deployment output
 * 
 * @param {string} output - Command output from deployment
 * @param {string} site - Firebase hosting site name
 * @returns {string|null} - Preview URL or null if not found
 */
export function extractPreviewUrl(output, site) {
  // Look for the URL pattern in the output
  // First try the most specific format: Channel URL for site [site]: https://...
  const urlRegex = new RegExp(`Channel URL for site \\[${site}\\]: (https://[^\\s]+)`, 'i');
  const match = output.match(urlRegex);
  
  if (match && match[1]) {
    return match[1];
  }
  
  // If not found, try more general patterns
  // Look for any URL with the site name and channel ID
  const siteUrlRegex = new RegExp(`https://${site}--[^\\s]+\\.web\\.app`, 'i');
  const siteMatch = output.match(siteUrlRegex);
  
  if (siteMatch) {
    return siteMatch[0];
  }
  
  // Try other patterns that might appear in the output
  const patterns = [
    /Channel URL: (https:\/\/[^\s]+)/i, // Channel URL: https://...
    /Live URL: (https:\/\/[^\s]+)/i,    // Live URL: https://...
    /(https:\/\/[^"\s]+\.web\.app)/i,   // Any Firebase hosting URL
    /(https:\/\/[^"\s]+\.firebaseapp\.com)/i // Any Firebase app URL
  ];
  
  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  // No URL found
  return null;
}

/**
 * List all preview channels for a site
 * 
 * @param {Object} options - List options
 * @param {string} options.projectId - Firebase project ID
 * @param {string} options.site - Firebase hosting site name
 * @returns {Array} - List of channel objects with details
 */
export async function listChannels(options) {
  const { projectId, site } = options;
  
  logger.info(`Listing preview channels for site: ${site}`);
  
  // Run the command to list channels in JSON format for reliable parsing
  const result = await commandRunner.runCommandAsync(
    `firebase hosting:channel:list --project=${projectId} --site=${site} --json`,
    { ignoreError: true }
  );
  
  if (!result.success) {
    logger.error(`Failed to list channels for site: ${site}`);
    return {
      success: false,
      channels: [],
      error: result.error || 'Command failed'
    };
  }
  
  try {
    // Parse the JSON output
    const data = JSON.parse(result.output || '{}');
    
    if (data && data.result && Array.isArray(data.result.channels)) {
      const channels = data.result.channels.map(channel => {
        // Extract the channel ID from the full path
        const nameMatch = channel.name.match(/\/channels\/([^/]+)$/);
        const channelId = nameMatch ? nameMatch[1] : channel.name;
        
        return {
          id: channelId,
          url: channel.url || null,
          createTime: channel.createTime || null,
          expireTime: channel.expireTime || null,
          ttl: channel.ttl || null
        };
      });
      
      logger.info(`Found ${channels.length} channels for site: ${site}`);
      
      return {
        success: true,
        channels
      };
    }
    
    // If we reach here, the JSON didn't have the expected format
    throw new Error('Unexpected JSON format in response');
  } catch (error) {
    // JSON parsing failed or unexpected format
    logger.warn('Failed to parse channel list response');
    
    // Try a more basic approach with regular text output
    return await listChannelsFallback({ projectId, site });
  }
}

/**
 * Fallback method to list channels without JSON parsing
 * @private
 */
async function listChannelsFallback(options) {
  const { projectId, site } = options;
  
  logger.info('Falling back to text-based channel list parsing');
  
  const result = await commandRunner.runCommandAsync(
    `firebase hosting:channel:list --project=${projectId} --site=${site}`,
    { ignoreError: true }
  );
  
  if (!result.success) {
    return {
      success: false,
      channels: [],
      error: 'Failed to list channels using fallback method'
    };
  }
  
  const lines = (result.output || '').split('\n');
  const channels = [];
  
  for (const line of lines) {
    // Look for lines with a channel ID and URL
    // Format is typically: "channel-name: https://site--channel-name.web.app"
    const match = line.match(/([a-zA-Z0-9-_]+):\s+(https:\/\/[^\s]+)/);
    if (match) {
      channels.push({
        id: match[1],
        url: match[2],
        createTime: null, // Not available in text output
        expireTime: null  // Not available in text output
      });
    }
  }
  
  logger.info(`Found ${channels.length} channels using text parsing`);
  
  return {
    success: true,
    channels
  };
}

/**
 * Delete a preview channel
 * 
 * @param {Object} options - Delete options
 * @param {string} options.channelId - Channel ID to delete
 * @param {string} options.projectId - Firebase project ID
 * @param {string} options.site - Firebase hosting site name
 * @returns {Object} - Deletion result
 */
export async function deleteChannel(options) {
  const { channelId, projectId, site } = options;
  
  logger.info(`Deleting preview channel: ${channelId}`);
  
  const result = await commandRunner.runCommandAsync(
    `firebase hosting:channel:delete ${channelId} --project=${projectId} --site=${site} --force`,
    { ignoreError: true }
  );
  
  if (!result.success) {
    logger.error(`Failed to delete channel: ${channelId}`);
    return {
      success: false,
      error: result.error || 'Delete command failed'
    };
  }
  
  logger.success(`Successfully deleted channel: ${channelId}`);
  
  return {
    success: true,
    channelId
  };
}

/**
 * Clean up old preview channels to stay within limits
 * 
 * @param {Object} options - Cleanup options
 * @param {string} options.projectId - Firebase project ID
 * @param {string} options.site - Firebase hosting site name
 * @param {string} [options.prefix] - Only clean channels with this prefix
 * @param {number} [options.keepCount=5] - Number of recent channels to keep
 * @returns {Object} - Cleanup result
 */
export async function cleanupChannels(options) {
  const { projectId, site, prefix, keepCount = 5 } = options;
  
  logger.info(`Cleaning up old preview channels for site: ${site}`);
  logger.info(`Will keep ${keepCount} most recent channels` + (prefix ? ` with prefix '${prefix}'` : ''));
  
  // First, list all channels
  const listResult = await listChannels({ projectId, site });
  
  if (!listResult.success) {
    return {
      success: false,
      error: 'Failed to list channels for cleanup',
      deleted: []
    };
  }
  
  let { channels } = listResult;
  
  // Filter for channels with the specified prefix if provided
  if (prefix) {
    channels = channels.filter(channel => channel.id.startsWith(prefix));
    logger.info(`Found ${channels.length} channels with prefix '${prefix}'`);
  }
  
  // Sort channels by creation time (newest first)
  // For channels without creation time, assume they're older
  channels.sort((a, b) => {
    if (!a.createTime) return 1;
    if (!b.createTime) return -1;
    return new Date(b.createTime) - new Date(a.createTime);
  });
  
  // Keep the most recent channels, delete the rest
  const channelsToKeep = channels.slice(0, keepCount);
  const channelsToDelete = channels.slice(keepCount);
  
  if (channelsToDelete.length === 0) {
    logger.info('No channels need to be deleted');
    return {
      success: true,
      deleted: []
    };
  }
  
  logger.info(`Keeping ${channelsToKeep.length} channels, deleting ${channelsToDelete.length} old channels`);
  
  // Delete the old channels
  const deletedChannels = [];
  const failedChannels = [];
  
  for (const channel of channelsToDelete) {
    const deleteResult = await deleteChannel({
      channelId: channel.id,
      projectId,
      site
    });
    
    if (deleteResult.success) {
      deletedChannels.push(channel.id);
    } else {
      failedChannels.push({
        id: channel.id,
        error: deleteResult.error
      });
    }
  }
  
  logger.success(`Successfully deleted ${deletedChannels.length} channels`);
  
  if (failedChannels.length > 0) {
    logger.warn(`Failed to delete ${failedChannels.length} channels`);
  }
  
  return {
    success: true,
    deleted: deletedChannels,
    failed: failedChannels
  };
}

export default {
  deployToChannel,
  extractPreviewUrl,
  listChannels,
  deleteChannel,
  cleanupChannels
}; 