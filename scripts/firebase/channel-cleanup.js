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

import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';
import { progressTracker } from '../core/progress-tracker.js';
import { cleanupChannels as channelCleanup } from './channel-manager.js';
import { fileURLToPath } from 'url';

/* global process, setTimeout */

const MAX_CHANNELS = 5;

/**
 * Clean up old preview channels for a site
 * 
 * @param {Object} options - Cleanup options
 * @param {string} options.projectId - Firebase project ID
 * @param {string} options.site - Firebase hosting site name
 * @param {number} [options.keepCount=5] - Number of recent channels to keep
 * @returns {Promise<Object>} - Cleanup result
 */
export async function cleanupChannels({ projectId, site, keepCount = 5 }) {
  logger.info('Starting channel cleanup...');

  try {
    // Get all channels for both sites
    const sites = ['admin-autonomyhero-2024', 'hours-autonomyhero-2024'];
    const results = {
      success: true,
      cleaned: 0,
      errors: []
    };
    
    for (const site of sites) {
      try {
        const channels = await listChannels(site);
        if (channels.length > MAX_CHANNELS) {
          // Sort channels by creation date (oldest first)
          const sortedChannels = channels.sort((a, b) => 
            new Date(a.createdAt) - new Date(b.createdAt)
          );
          
          // Delete oldest channels until we're under the limit
          const channelsToDelete = sortedChannels.slice(0, channels.length - MAX_CHANNELS);
          
          for (const channel of channelsToDelete) {
            logger.info(`Deleting old channel: ${channel.channelId}`);
            await deleteChannel(site, channel.channelId);
            results.cleaned++;
          }
        }
      } catch (error) {
        results.errors.push(`Failed to cleanup channels for site ${site}: ${error.message}`);
        logger.error(results.errors[results.errors.length - 1]);
      }
    }
    
    if (results.errors.length > 0) {
      results.success = false;
      logger.warn('Channel cleanup completed with errors');
    } else {
      logger.success('Channel cleanup completed successfully!');
    }
    
    return results;
  } catch (error) {
    logger.error(`Channel cleanup failed: ${error.message}`);
    return {
      success: false,
      cleaned: 0,
      errors: [error.message]
    };
  }
}

async function listChannels(site) {
  const result = await commandRunner.runCommandAsync(
    `firebase hosting:channel:list --site=${site} --json`,
    { encoding: 'utf8' }
  );
  
  if (!result.success) {
    throw new Error(result.error);
  }
  
  return JSON.parse(result.output);
}

async function deleteChannel(site, channelId) {
  const result = await commandRunner.runCommandAsync(
    `firebase hosting:channel:delete ${channelId} --site=${site} --force`,
    { stdio: 'inherit' }
  );
  
  if (!result.success) {
    throw new Error(result.error);
  }
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
  const listResult = await channelCleanup.listChannels({ 
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
      
      if (autoCleanup) {
        logger.info(`Auto-cleanup enabled, cleaning up channels for site: ${currentSite}`);
        const cleanupResult = await channelCleanup({
          projectId,
          site: currentSite,
          dryRun: false
        });
        results[currentSite].cleanup = cleanupResult;
      } else {
        logger.warn(`Cleanup needed for site ${currentSite} but auto-cleanup is disabled`);
      }
    }
  }
  
  return {
    needed: anyCleanupNeeded,
    results
  };
}

// Run cleanup if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cleanupChannels();
}

export { cleanupChannels }; 