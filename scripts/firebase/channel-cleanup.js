#!/usr/bin/env node

/**
 * Firebase Channel Cleanup Module
 * 
 * Provides utilities for cleaning up old Firebase hosting preview channels
 * to stay within Firebase's limits and keep the environment tidy.
 * 
 * Features:
 * - Automatic cleanup of old channels
 * - Interactive cleanup with user confirmation
 * - Configurable retention policies
 * - Support for multiple sites and projects
 * 
 * @module firebase/channel-cleanup
 */

import * as commandRunner from '../core/command-runner.js';
import * as logger from '../core/logger.js';
import * as channelManager from './channel-manager.js';
import * as config from '../core/config.js';

/* global process */

/**
 * Clean up old preview channels for a site
 * 
 * @param {Object} options - Cleanup options
 * @param {string} options.projectId - Firebase project ID
 * @param {string} options.site - Firebase hosting site name
 * @param {string} [options.prefix] - Only clean channels with this prefix
 * @param {number} [options.keepCount=5] - Number of recent channels to keep
 * @param {boolean} [options.dryRun=false] - Whether to simulate cleanup without deleting
 * @returns {Promise<Object>} - Cleanup result
 */
export async function cleanupChannels(options) {
  const { 
    projectId, 
    site, 
    prefix = null, 
    keepCount = 5,
    dryRun = false
  } = options;
  
  logger.info(`Cleaning up old preview channels for site: ${site}`);
  logger.info(`Will keep ${keepCount} most recent channels` + (prefix ? ` with prefix '${prefix}'` : ''));
  
  if (dryRun) {
    logger.info('Running in dry-run mode, no channels will be deleted');
  }
  
  // List all channels
  const listResult = await channelManager.listChannels({ projectId, site });
  
  if (!listResult.success) {
    logger.error('Failed to list channels for cleanup');
    return {
      success: false,
      error: 'Failed to list channels',
      deleted: []
    };
  }
  
  let { channels } = listResult;
  
  // Filter by prefix if specified
  if (prefix) {
    channels = channelManager.filterChannelsByPrefix(channels, prefix);
    logger.info(`Found ${channels.length} channels with prefix '${prefix}'`);
  }
  
  // Sort channels by creation time, newest first
  channels = channelManager.sortChannelsByCreationTime(channels, 'desc');
  
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
    logger.info(`Deleting channel: ${channel.id}`);
    
    if (dryRun) {
      // In dry-run mode, just simulate success
      deletedChannels.push({
        id: channel.id,
        simulated: true
      });
      continue;
    }
    
    // Build the delete command
    const command = `firebase hosting:channel:delete ${channel.id} --project=${projectId} --site=${site} --force`;
    
    const result = await commandRunner.runCommandAsync(command, {
      ignoreError: true
    });
    
    if (result.success) {
      logger.success(`Successfully deleted channel: ${channel.id}`);
      deletedChannels.push({
        id: channel.id
      });
    } else {
      logger.error(`Failed to delete channel: ${channel.id}`);
      failedChannels.push({
        id: channel.id,
        error: result.error || 'Delete command failed'
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

/**
 * Check if cleanup is needed based on channel count threshold
 * 
 * @param {Object} options - Check options
 * @param {string} options.projectId - Firebase project ID
 * @param {string} options.site - Firebase hosting site name
 * @param {number} [options.threshold=8] - Channel count threshold (Firebase limit is 10)
 * @returns {Promise<Object>} - Check result
 */
export async function isCleanupNeeded(options) {
  const { projectId, site, threshold = 8 } = options;
  
  const count = await channelManager.countChannels({ projectId, site });
  
  return {
    needed: count >= threshold,
    channelCount: count,
    threshold
  };
}

/**
 * Check and clean up channels if needed
 * 
 * @param {Object} options - Check options
 * @param {string} options.projectId - Firebase project ID
 * @param {string} options.site - Firebase hosting site name (or array of sites)
 * @param {number} [options.threshold=8] - Channel count threshold
 * @param {number} [options.keepCount=5] - Number of recent channels to keep
 * @param {string} [options.prefix] - Only clean channels with this prefix
 * @param {boolean} [options.autoCleanup=false] - Whether to clean up automatically if needed
 * @returns {Promise<Object>} - Result of check and cleanup
 */
export async function checkAndCleanupIfNeeded(options) {
  const { 
    projectId, 
    site, 
    threshold = 8, 
    keepCount = 5, 
    prefix = null,
    autoCleanup = false
  } = options;
  
  // Handle multiple sites
  const sites = Array.isArray(site) ? site : [site];
  const results = {};
  let anyCleanupNeeded = false;
  
  for (const currentSite of sites) {
    logger.info(`Checking channels for site: ${currentSite}`);
    
    const checkResult = await isCleanupNeeded({
      projectId,
      site: currentSite,
      threshold
    });
    
    results[currentSite] = checkResult;
    
    if (checkResult.needed) {
      anyCleanupNeeded = true;
      logger.warn(`Site ${currentSite} has ${checkResult.channelCount} channels (threshold: ${threshold})`);
      
      if (autoCleanup) {
        logger.info(`Auto-cleanup enabled, cleaning up site: ${currentSite}`);
        
        const cleanupResult = await cleanupChannels({
          projectId,
          site: currentSite,
          prefix,
          keepCount
        });
        
        results[currentSite].cleanup = cleanupResult;
      }
    } else {
      logger.info(`Site ${currentSite} has ${checkResult.channelCount} channels, below threshold (${threshold})`);
    }
  }
  
  return {
    needsCleanup: anyCleanupNeeded,
    sites: results
  };
}

export default {
  cleanupChannels,
  isCleanupNeeded,
  checkAndCleanupIfNeeded
}; 