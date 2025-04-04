#!/usr/bin/env node

/**
 * Firebase Channel Cleanup
 * 
 * Manages the cleanup of preview channels to prevent accumulation
 * of unused deployments and stay within quota limits.
 */

import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';
import { getWorkflowConfig } from '../workflow/workflow-config.js';
import { fileURLToPath } from 'url';

/* global process */

// Get configuration from workflow-config 
function getCleanupConfig() {
  const config = getWorkflowConfig();
  
  // Use config or fallback to default values
  return {
    projectId: config.firebase.projectId,
    sites: Array.isArray(config.firebase.site) 
      ? config.firebase.site 
      : (typeof config.firebase.site === 'string' 
          ? [config.firebase.site] 
          : Object.keys(config.firebase.targets || {})),
    keepDays: config.preview?.expireDays || 7,
    keepCount: config.preview?.keepCount || 5,
    prefix: config.preview?.prefix || 'preview-'
  };
}

/**
 * Check if channel cleanup is needed based on count and age
 * 
 * @param {Object} options - Configuration options
 * @returns {Promise<{needsCleanup: boolean, channelCounts: Object, oldestChannel: Object}>}
 */
export async function getCleanupStatus(options = {}) {
  // Get configuration, overridden by any options passed in
  const config = {
    ...getCleanupConfig(),
    ...options
  };
  
  const { projectId, sites, keepDays, keepCount, prefix } = config;
  
  // Validate configuration
  if (!projectId) {
    logger.error('Cannot check cleanup status: Project ID not configured');
    return { 
      needsCleanup: false, 
      error: 'Project ID not configured. Check .firebaserc or set FIREBASE_PROJECT_ID environment variable.' 
    };
  }
  
  if (!sites || sites.length === 0) {
    logger.error('Cannot check cleanup status: No sites configured');
    return { 
      needsCleanup: false, 
      error: 'No sites configured. Check .firebaserc or set FIREBASE_SITE environment variable.' 
    };
  }
  
  logger.debug(`Checking channel status in project ${projectId} for sites: ${sites.join(', ')}`);
  
  try {
    // Check channel status for each site
    const results = {
      needsCleanup: false,
      channelCounts: {},
      oldestChannels: {},
      totalChannels: 0,
      channelsByAge: []
    };
    
    for (const site of sites) {
      logger.debug(`Checking channels for site: ${site}`);
      
      // Get all channels for this site
      const channelsResult = await commandRunner.runCommandAsync(
        `firebase hosting:channel:list --site=${site} --json`,
        { stdio: 'pipe' }
      );
      
      if (!channelsResult.success) {
        logger.warn(`Failed to get channels for site ${site}: ${channelsResult.error}`);
        continue;
      }
      
      try {
        // Parse the JSON output from Firebase CLI
        const channelsData = JSON.parse(channelsResult.output.trim());
        
        // Filter to only get preview channels
        const channels = channelsData.result.channels || [];
        const previewChannels = channels.filter(channel => channel.name.startsWith(prefix));
        
        results.channelCounts[site] = previewChannels.length;
        results.totalChannels += previewChannels.length;
        
        // Check if we've exceeded the channel count
        if (previewChannels.length > keepCount) {
          results.needsCleanup = true;
        }
        
        // Check for old channels
        const now = new Date();
        const cutoffDate = new Date(now.getTime() - keepDays * 24 * 60 * 60 * 1000);
        
        const oldChannels = previewChannels
          .filter(c => new Date(c.createTime) < cutoffDate)
          .map(c => ({ ...c, site, createDate: new Date(c.createTime) })); // Add site to channel data
        
        if (oldChannels.length > 0) {
          results.needsCleanup = true;
          results.channelsByAge = [
            ...results.channelsByAge,
            ...oldChannels
          ];
          
          // Find oldest channel for this site
          oldChannels.sort((a, b) => a.createDate - b.createDate);
          results.oldestChannels[site] = oldChannels[0];
        }
      } catch (parseError) {
        logger.debug(`Failed to parse channels for site ${site}: ${parseError.message}`);
      }
    }
    
    // Sort all channels by age (oldest first)
    results.channelsByAge.sort((a, b) => a.createDate - b.createDate);
    
    // Find the overall oldest channel
    if (results.channelsByAge.length > 0) {
      results.oldestChannel = results.channelsByAge[0];
    }
    
    // Add some helpful status metadata
    results.status = results.needsCleanup 
      ? 'Cleanup needed' 
      : 'No cleanup needed';
      
    results.reason = results.needsCleanup 
      ? (results.totalChannels > keepCount 
          ? `Total channels (${results.totalChannels}) exceeds limit (${keepCount})` 
          : `Channels older than ${keepDays} days found`)
      : 'All channels are within limits';
    
    return results;
  } catch (error) {
    logger.error(`Error checking channel status: ${error.message}`);
    return {
      needsCleanup: false,
      error: `Failed to check channel status: ${error.message}`
    };
  }
}

/**
 * Clean up old channel deployments
 * 
 * @param {Object} options - Options for cleanup
 * @param {string} options.projectId - Firebase project ID
 * @param {string[]} options.sites - Sites to clean
 * @param {number} options.keepDays - Number of days to keep
 * @param {number} options.keepCount - Number of channels to keep
 * @param {string} options.prefix - Prefix for channels to clean
 * @returns {Promise<{success: boolean, cleaned: number, error?: string}>}
 */
export async function cleanupChannels(options = {}) {
  // Get configuration, overridden by any options passed in
  const config = {
    ...getCleanupConfig(),
    ...options
  };
  
  const { projectId, sites, keepDays, keepCount, prefix } = config;
  
  if (!projectId) {
    logger.error('Cannot clean up channels: Project ID not configured');
    return { 
      success: false, 
      cleaned: 0, 
      error: 'Project ID not configured. Check .firebaserc or set FIREBASE_PROJECT_ID environment variable.' 
    };
  }
  
  if (!sites || sites.length === 0) {
    logger.error('Cannot clean up channels: No sites configured');
    
    // Try to detect sites dynamically if none are configured
    try {
      const sitesListResult = await commandRunner.runCommandAsync('firebase hosting:sites:list --json', {
        stdio: 'pipe',
        ignoreError: true
      });
      
      if (sitesListResult.success) {
        let sitesList = [];
        try {
          const sitesData = JSON.parse(sitesListResult.output.trim());
          sitesList = sitesData.result.sites || [];
          
          if (sitesList.length > 0) {
            const siteNames = sitesList.map(site => site.name || site.site);
            logger.info(`Found sites: ${siteNames.join(', ')}`);
            
            // Use auto-detected sites
            config.sites = siteNames;
            logger.success('Using auto-detected sites for cleanup');
            
            // Continue with cleanup using the detected sites
            return cleanupChannels(config);
          }
        } catch (parseError) {
          logger.debug(`Failed to parse sites list: ${parseError.message}`);
        }
      } else {
        logger.debug('Could not fetch sites list');
      }
    } catch (error) {
      logger.debug(`Error fetching sites list: ${error.message}`);
    }
    
    return { 
      success: false, 
      cleaned: 0, 
      error: 'No sites configured. Check .firebaserc or set FIREBASE_SITE environment variable.' 
    };
  }
  
  logger.debug(`Cleaning up channels in project ${projectId} for sites: ${sites.join(', ')}`);
  logger.debug(`Keeping channels newer than ${keepDays} days and the newest ${keepCount} channels`);
  
  try {
    // Keep track of how many channels we've cleaned
    let cleanedCount = 0;
    
    // Process each site
    for (const site of sites) {
      logger.debug(`Checking channels for site: ${site}`);
      
      // Get all channels for this site
      const channelsResult = await commandRunner.runCommandAsync(
        `firebase hosting:channel:list --site=${site} --json`,
        { stdio: 'pipe' }
      );
      
      if (!channelsResult.success) {
        logger.warn(`Failed to get channels for site ${site}: ${channelsResult.error}`);
        continue;
      }
      
      let channels;
      try {
        // Parse the JSON output from Firebase CLI
        channels = JSON.parse(channelsResult.output.trim());
        
        // Filter to only get preview channels
        channels = channels.result.channels || [];
        channels = channels.filter(channel => channel.name.startsWith(prefix));
        
        // Sort channels by creation time
        channels.sort((a, b) => {
          const aTime = new Date(a.createTime).getTime();
          const bTime = new Date(b.createTime).getTime();
          return bTime - aTime; // descending order (newest first)
        });
        
        // Keep the most recent keepCount channels
        const recentChannels = channels.slice(0, keepCount);
        const oldChannels = channels.slice(keepCount);
        
        // Calculate the cutoff date for keepDays
        const now = new Date();
        const cutoffDate = new Date(now.getTime() - keepDays * 24 * 60 * 60 * 1000);
        
        // Channels to delete are either:
        // 1. Older than keepDays days, or
        // 2. Not in the most recent keepCount channels
        const channelsToDelete = oldChannels.filter(channel => {
          const createTime = new Date(channel.createTime);
          return createTime < cutoffDate;
        });
        
        logger.debug(`Found ${channelsToDelete.length} channels to clean up for site ${site}`);
        
        // Delete each channel
        for (const channel of channelsToDelete) {
          const deleteResult = await commandRunner.runCommandAsync(
            `firebase hosting:channel:delete ${channel.name} --site=${site} --force`,
            { stdio: 'pipe' }
          );
          
          if (deleteResult.success) {
            logger.debug(`Deleted channel ${channel.name} for site ${site}`);
            cleanedCount++;
          } else {
            logger.warn(`Failed to delete channel ${channel.name} for site ${site}: ${deleteResult.error}`);
          }
        }
      } catch (error) {
        logger.warn(`Error processing channels for site ${site}: ${error.message}`);
      }
    }
    
    logger.success(`Cleaned up ${cleanedCount} old preview channels`);
    
    return { 
      success: true, 
      cleaned: cleanedCount 
    };
  } catch (error) {
    logger.error(`Channel cleanup failed: ${error.message}`);
    return { 
      success: false, 
      cleaned: 0, 
      error: error.message 
    };
  }
}

/**
 * Enhanced cleanup function with workflow integration
 * 
 * @param {Object} options - Configuration options
 * @param {Function} [options.recordWarning] - Function to record warnings in workflow
 * @param {Function} [options.recordStep] - Function to record steps in workflow
 * @param {string} [options.phase='Results'] - Workflow phase name
 * @returns {Promise<Object>} Cleanup results with enhanced details
 */
export async function cleanupChannelsForWorkflow(options = {}) {
  const { 
    recordWarning = null, 
    recordStep = null,
    phase = 'Results',
    ...cleanupOptions
  } = options;
  
  const startTime = Date.now();
  
  // Record step start if tracking enabled
  if (recordStep) {
    recordStep('Channel Cleanup', phase, null, 0);
  }
  
  try {
    // First check if cleanup is needed
    const status = await getCleanupStatus(cleanupOptions);
    
    if (!status.needsCleanup) {
      logger.info('No channel cleanup needed - all channels within limits');
      
      if (recordStep) {
        recordStep('Channel Cleanup', phase, true, Date.now() - startTime, 'No cleanup needed');
      }
      
      return { 
        success: true, 
        cleaned: 0, 
        skipped: true,
        reason: status.reason || 'All channels within limits',
        channelCounts: status.channelCounts,
        totalChannels: status.totalChannels
      };
    }
    
    // Log details about what needs cleanup
    logger.info(`Channel cleanup needed: ${status.reason}`);
    
    if (status.oldestChannel) {
      const age = Math.round((new Date() - new Date(status.oldestChannel.createTime)) / (1000 * 60 * 60 * 24));
      logger.info(`Oldest channel: ${status.oldestChannel.name} (${age} days old) on site ${status.oldestChannel.site}`);
    }
    
    // Perform cleanup
    const result = await cleanupChannels(cleanupOptions);
    
    // Record warnings if there were issues
    if (!result.success && recordWarning) {
      recordWarning(`Channel cleanup failed: ${result.error}`, phase, 'Channel Cleanup');
    }
    
    // Add enhanced information from status check
    const enhancedResult = {
      ...result,
      channelCounts: status.channelCounts,
      totalChannels: status.totalChannels,
      oldestChannel: status.oldestChannel,
      reason: status.reason
    };
    
    // Record step completion
    if (recordStep) {
      const stepMessage = result.success
        ? `Cleaned up ${result.cleaned} channels`
        : `Cleanup failed: ${result.error}`;
        
      recordStep('Channel Cleanup', phase, result.success, Date.now() - startTime, stepMessage);
    }
    
    return enhancedResult;
  } catch (error) {
    if (recordWarning) {
      recordWarning(`Channel cleanup error: ${error.message}`, phase, 'Channel Cleanup');
    }
    
    if (recordStep) {
      recordStep('Channel Cleanup', phase, false, Date.now() - startTime, error.message);
    }
    
    return {
      success: false,
      cleaned: 0,
      error: error.message
    };
  }
}

export default { cleanupChannels, getCleanupStatus, cleanupChannelsForWorkflow };

// For direct script execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cleanupChannels()
    .then(result => {
      logger.info(`Cleaned ${result.cleaned} channels`);
      process.exit(0);
    })
    .catch(() => process.exit(1));
} 