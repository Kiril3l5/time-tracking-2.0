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

/* global process, setTimeout */

/**
 * Clean up old preview channels for a site
 * 
 * @param {Object} options - Cleanup options
 * @param {string} options.projectId - Firebase project ID
 * @param {string} options.site - Firebase hosting site name
 * @param {string} [options.prefix] - Only clean channels with this prefix (null means all channels)
 * @param {number} [options.keepCount=5] - Number of recent channels to keep
 * @param {boolean} [options.dryRun=false] - Whether to simulate cleanup without deleting
 * @param {boolean} [options.quiet=false] - Whether to suppress detailed channel output
 * @param {number} [options.batchSize=5] - Number of channels to delete in each batch
 * @param {number} [options.delayBetweenBatches=2000] - Delay in ms between batches
 * @returns {Promise<Object>} - Cleanup result
 */
export async function cleanupChannels(options) {
  const { 
    projectId, 
    site, 
    prefix = null, 
    keepCount = 5,
    dryRun = false,
    quiet = false,
    batchSize = 5,
    delayBetweenBatches = 2000
  } = options;
  
  logger.info(`Cleaning up old preview channels for site: ${site}`);
  
  if (prefix) {
    logger.info(`Will keep ${keepCount} most recent channels with prefix '${prefix}'`);
  } else {
    logger.info(`Will keep ${keepCount} most recent channels (all prefixes included)`);
  }
  
  if (dryRun) {
    logger.info('Running in dry-run mode, no channels will be deleted');
  }
  
  // List all channels
  const listResult = await channelManager.listChannels({ 
    projectId, 
    site,
    quiet 
  });
  
  if (!listResult.success) {
    logger.error('Failed to list channels for cleanup');
    return {
      success: false,
      error: 'Failed to list channels',
      deleted: []
    };
  }
  
  let { channels } = listResult;
  
  // Filter for channels with the specified prefix if provided and not null
  if (prefix) {
    channels = channels.filter(channel => channel.id.startsWith(prefix));
    logger.info(`Found ${channels.length} channels with prefix '${prefix}'`);
  } else {
    logger.info(`Found ${channels.length} total channels (no prefix filter)`);
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
  
  // Only log detailed channel information if not in quiet mode
  if (!quiet && channelsToDelete.length > 0) {
    logger.info('Channels to be deleted:');
    channelsToDelete.forEach(channel => {
      const createDate = channel.createTime ? new Date(channel.createTime).toLocaleDateString() : 'unknown';
      logger.info(`- ${channel.id} (created: ${createDate})`);
    });
  }
  
  // Delete the old channels in batches to avoid rate limiting
  const deletedChannels = [];
  const failedChannels = [];
  
  // Create batches of channels to delete
  const batches = [];
  for (let i = 0; i < channelsToDelete.length; i += batchSize) {
    batches.push(channelsToDelete.slice(i, i + batchSize));
  }
  
  logger.info(`Processing ${batches.length} batches of up to ${batchSize} channels each`);
  
  // Process each batch with delay between batches
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    logger.info(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} channels`);
    
    // Process each channel in the batch
    for (const channel of batch) {
      if (dryRun) {
        // In dry run mode, just add to deleted list for reporting
        deletedChannels.push(channel.id);
        continue;
      }
      
      let retry = 0;
      const maxRetries = 3;
      let success = false;
      
      // Retry loop for each channel
      while (retry < maxRetries && !success) {
        try {
          const deleteResult = await channelManager.deleteChannel({
            projectId,
            site,
            channelId: channel.id,
            quiet
          });
          
          if (deleteResult.success) {
            deletedChannels.push(channel.id);
            if (!quiet) {
              logger.success(`Deleted channel: ${channel.id}`);
            }
            success = true;
          } else {
            // If we failed but no exception was thrown, increment retry
            retry++;
            if (retry < maxRetries) {
              logger.warn(`Failed to delete channel: ${channel.id} (retry ${retry}/${maxRetries})`);
              // Wait a moment before retry
              await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
              failedChannels.push({
                id: channel.id,
                error: deleteResult.error || 'Unknown error'
              });
              logger.warn(`Failed to delete channel after ${maxRetries} attempts: ${channel.id}`);
            }
          }
        } catch (error) {
          retry++;
          if (retry < maxRetries) {
            logger.warn(`Error deleting channel: ${channel.id} - ${error.message} (retry ${retry}/${maxRetries})`);
            // Wait a moment before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            failedChannels.push({
              id: channel.id,
              error: error.message || 'Unknown error'
            });
            logger.warn(`Failed to delete channel after ${maxRetries} attempts: ${channel.id}`);
          }
        }
      }
    }
    
    // Add delay between batches to avoid rate limiting
    if (batchIndex < batches.length - 1) {
      logger.info(`Waiting ${delayBetweenBatches/1000} seconds before processing next batch...`);
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }
  
  if (dryRun) {
    logger.info(`[DRY RUN] Would have deleted ${deletedChannels.length} channels`);
  } else {
    logger.success(`Successfully deleted ${deletedChannels.length} channels`);
  }
  
  if (failedChannels.length > 0) {
    logger.warn(`Failed to delete ${failedChannels.length} channels`);
    failedChannels.forEach(failed => {
      logger.warn(`  - ${failed.id}: ${failed.error}`);
    });
  }
  
  // Output summary results instead of detailed channel info in quiet mode
  return {
    success: true,
    deleted: deletedChannels,
    failed: failedChannels,
    total: deletedChannels.length + failedChannels.length
  };
}

/**
 * Check if a site needs channel cleanup
 * 
 * @param {Object} options - Check options
 * @param {string} options.projectId - Firebase project ID
 * @param {string} options.site - Firebase hosting site name
 * @param {number} [options.threshold=8] - Channel count threshold
 * @param {boolean} [options.quiet=false] - Whether to suppress detailed channel output
 * @returns {Promise<Object>} - Channel cleanup check result
 */
export async function isCleanupNeeded(options) {
  const { projectId, site, threshold = 8, quiet = false } = options;
  
  logger.info(`Checking if site ${site} needs channel cleanup (threshold: ${threshold})`);
  
  // List all channels
  const listResult = await channelManager.listChannels({ 
    projectId, 
    site,
    quiet
  });
  
  if (!listResult.success) {
    logger.error(`Failed to list channels for site: ${site}`);
    return {
      needed: false,
      error: 'Failed to list channels',
      channelCount: 0
    };
  }
  
  const { channels } = listResult;
  
  // Check if the number of channels exceeds the threshold
  const needsCleanup = channels.length >= threshold;
  
  if (needsCleanup) {
    logger.warn(`Site ${site} has ${channels.length} channels, exceeding threshold (${threshold})`);
  } else {
    logger.info(`Site ${site} has ${channels.length} channels, below threshold (${threshold})`);
  }
  
  return {
    needed: needsCleanup,
    channelCount: channels.length
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
 * @param {string} [options.prefix] - Only clean channels with this prefix (null = all channels)
 * @param {boolean} [options.autoCleanup=false] - Whether to clean up automatically if needed
 * @param {boolean} [options.quiet=false] - Whether to suppress detailed channel output
 * @returns {Promise<Object>} - Result of check and cleanup
 */
export async function checkAndCleanupIfNeeded(options) {
  const { 
    projectId, 
    site, 
    threshold = 8, 
    keepCount = 5, 
    prefix = null,
    autoCleanup = false,
    quiet = false
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
      threshold,
      quiet
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
          prefix,  // This can be null, meaning all channels
          keepCount,
          quiet
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