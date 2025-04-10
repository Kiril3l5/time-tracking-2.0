#!/usr/bin/env node

/**
 * Firebase Channel Cleanup
 * 
 * Manages the cleanup of preview channels to prevent accumulation
 * of unused deployments and stay within quota limits.
 */

import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

/* global process */

const execAsync = promisify(exec);

// Function to get cleanup configuration 
function getCleanupConfig() {
  return {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    sites: process.env.FIREBASE_SITE ? [process.env.FIREBASE_SITE] : [],
    keepDays: parseInt(process.env.FIREBASE_KEEP_DAYS || '7', 10),
    keepCount: parseInt(process.env.FIREBASE_KEEP_COUNT || '5', 10),
    prefix: process.env.FIREBASE_CHANNEL_PREFIX || 'pr-',
  };
}

/**
 * Runs a Firebase command with proper error handling
 * @param {string} command - The command to run
 * @returns {Promise<{success: boolean, output: string, error: string}>}
 */
async function runFirebaseCommand(command) {
  try {
    logger.debug(`Running: ${command}`);
    const result = await commandRunner.runCommandAsync(command, { stdio: 'pipe' });
    return {
      success: !result.error,
      output: result.output || '',
      error: result.error?.message || ''
    };
  } catch (error) {
    logger.error(`Command error: ${error.message}`);
    return {
      success: false,
      output: '',
      error: error.message
    };
  }
}

/**
 * Verifies Firebase authentication status
 * @returns {Promise<{success: boolean, error: string}>}
 */
export async function verifyFirebaseAuth() {
  // Skip full auth check if we're inside the workflow which already verified auth
  if (process.env.WORKFLOW_SESSION || process.env.WORKFLOW_AUTHENTICATED) {
    logger.debug('Using workflow-verified Firebase authentication');
    return { success: true };
  }

  // Check if firebase CLI is installed
  try {
    await execAsync('firebase --version');
  } catch (error) {
    return {
      success: false,
      error: 'Firebase CLI not installed. Please run: npm install -g firebase-tools'
    };
  }

  // Check authentication - first try a direct command that works with project tokens too
  try {
    // Try the hosting:sites:list command first - works with CI tokens
    const siteResult = await runFirebaseCommand('firebase hosting:sites:list --json');
    if (siteResult.success && !siteResult.output.includes('Error:') && !siteResult.output.includes('not logged in')) {
      logger.debug('Successfully authenticated via Firebase tools');
      return { success: true };
    }
    
    // Then try the projects list command
    const result = await runFirebaseCommand('firebase projects:list --json');
    if (result.success && !result.output.includes('Error:') && !result.output.includes('not logged in')) {
      // Successfully got projects list - we're authenticated
      return { success: true };
    }
    
    // Look for auth tokens in environment variables (common in CI/CD)
    const hasToken = process.env.FIREBASE_TOKEN || 
                     process.env.FIREBASE_CI || 
                     process.env.GOOGLE_APPLICATION_CREDENTIALS ||
                     process.env.CI;
                     
    if (hasToken) {
      logger.debug('Token-based authentication detected - proceeding with operations');
      return { success: true };
    }
    
    // If we couldn't authenticate, return error
    return {
      success: false,
      error: 'Firebase authentication required. Please run: firebase login'
    };
  } catch (error) {
    // If any authentication check throws an error, but we have environment indicators
    // of CI/CD environment, assume auth is present
    if (process.env.CI || process.env.GITHUB_ACTIONS || process.env.FIREBASE_TOKEN) {
      logger.debug('Authentication error occurred but CI environment detected - proceeding anyway');
      return { success: true };
    }
    
    return {
      success: false,
      error: `Firebase authentication check failed: ${error.message}`
    };
  }
}

/**
 * Cleans up Firebase hosting preview channels, keeping only the last N
 * @param {Object} options - Options for cleanup
 * @param {string[]} options.sites - Array of site IDs to clean up
 * @param {number} options.keepCount - Number of recent channels to keep (default: 5)
 * @param {boolean} options.dryRun - Whether to perform a dry run (default: false)
 * @returns {Promise<{success: boolean, results: string[], errors: string[]}>}
 */
export async function cleanupChannels(options = {}) {
  const { sites = [], keepCount = 5, dryRun = false } = options;
  const results = [];
  const errors = [];
  
  logger.info(`Starting channel cleanup${dryRun ? ' (DRY RUN)' : ''}`);
  logger.info(`Will keep the ${keepCount} most recent channels for each site`);
  
  // Get ALL Firebase sites in the project, not just the one from .firebaserc
  let sitesToClean = [...sites];
  if (sitesToClean.length === 0) {
    try {
      // First try to get project ID from .firebaserc
      let projectId = null;
      if (fs.existsSync('.firebaserc')) {
        const firebaseRc = JSON.parse(fs.readFileSync('.firebaserc', 'utf8'));
        projectId = firebaseRc.projects?.default;
        
        if (projectId) {
          logger.info(`Using project ID from .firebaserc: ${projectId}`);
        } else {
          logger.warn('No project ID found in .firebaserc');
          return { 
            success: false, 
            results: [], 
            errors: ['No sites specified and no project ID found in .firebaserc'] 
          };
        }
      } else {
        logger.warn('.firebaserc file not found');
        return { 
          success: false, 
          results: [], 
          errors: ['No sites specified and .firebaserc file not found'] 
        };
      }
      
      // Now list all sites in the project
      logger.info(`Listing all sites for project: ${projectId}`);
      try {
        const { stdout } = await execAsync('firebase hosting:sites:list --json');
        const sitesData = JSON.parse(stdout);
        
        if (sitesData && sitesData.result && sitesData.result.sites && Array.isArray(sitesData.result.sites)) {
          const allSites = sitesData.result.sites.map(site => site.name.split('/').pop());
          if (allSites.length > 0) {
            sitesToClean = allSites;
            logger.info(`Found ${allSites.length} sites: ${allSites.join(', ')}`);
          } else {
            logger.warn('No sites found in project');
            sitesToClean = [projectId]; // Fallback to project ID
          }
        } else {
          logger.warn('No sites found in response');
          sitesToClean = [projectId]; // Fallback to project ID
        }
      } catch (error) {
        logger.warn(`Error listing sites: ${error.message}, using project ID as fallback`);
        sitesToClean = [projectId]; // Fallback to project ID
      }
    } catch (error) {
      logger.error(`Error reading .firebaserc: ${error.message}`);
      return { 
        success: false, 
        results: [], 
        errors: [`Failed to read .firebaserc: ${error.message}`] 
      };
    }
  }
  
  logger.info(`Will clean up channels for sites: ${sitesToClean.join(', ')}`);
  
  // Track summary stats per site
  const siteStats = {};
  
  // Process each site
  for (const site of sitesToClean) {
    // Skip autonomy-heroes site as it's empty and not creating previews
    if (site === 'autonomy-heroes') {
      logger.info(`Skipping empty site: ${site}`);
      continue;
    }
    
    logger.info(`\nProcessing site: ${site}`);
    siteStats[site] = { found: 0, kept: 0, deleted: 0, errors: 0 };
    
    try {
      // Get all channels using direct command execution
      const listCommand = `firebase hosting:channel:list --site=${site} --json`;
      logger.debug(`Executing command: ${listCommand}`);
      
      try {
        const { stdout } = await execAsync(listCommand);
        
        // Parse the channel data
        const data = JSON.parse(stdout);
        logger.debug(`Got channel list response`);
        
        // Extract channels from the response
        let channels = [];
        
        // Handle different response formats
        if (data.result && data.result.channels && Array.isArray(data.result.channels)) {
          channels = data.result.channels;
        } else if (data.channels && Array.isArray(data.channels)) {
          channels = data.channels;
        } else if (Array.isArray(data)) {
          channels = data;
        } else {
          // Try to find any array in the response
          for (const key in data) {
            if (Array.isArray(data[key]) && data[key].length > 0 && data[key][0].name) {
              channels = data[key];
              break;
            }
          }
        }
        
        // Filter out invalid channel objects and the live channel (never delete live)
        channels = channels.filter(c => 
          c && typeof c === 'object' && c.name && 
          !c.name.endsWith('/channels/live') && 
          !c.name.includes('/live')
        );
        
        if (channels.length === 0) {
          logger.info(`No preview channels found for site ${site} (excluding live channel)`);
          results.push(`No preview channels found for site ${site}`);
          siteStats[site].found = 0;
          continue;
        }
        
        siteStats[site].found = channels.length;
        logger.info(`Found ${channels.length} preview channels for site ${site}`);
        
        // Sort channels by creation or update time (newest first)
        channels.sort((a, b) => {
          // Get the most recent timestamp for each channel (using any available timestamp field)
          const timeA = a.updateTime || a.lastDeployTime || a.createTime || '';
          const timeB = b.updateTime || b.lastDeployTime || b.createTime || '';
          return new Date(timeB) - new Date(timeA);
        });
        
        // Debugging: show sorting order
        logger.debug(`Channel order after sorting:`);
        channels.forEach((c, i) => {
          const name = c.name.split('/').pop();
          const timeField = c.updateTime || c.lastDeployTime || c.createTime || '';
          logger.debug(`  ${i+1}. ${name} (${timeField ? new Date(timeField).toLocaleString() : 'no timestamp'})`);
        });
        
        // Keep the newest channels based on keepCount - REGARDLESS of prefix or naming pattern
        // Only force deletion if we have significantly more channels than the keepCount
        // This ensures we don't delete channels when we only have a few
        const minChannelsBeforeForceDelete = keepCount * 2; // Only force delete if we have at least 10 channels (given keepCount=5)
        const effectiveKeepCount = channels.length > minChannelsBeforeForceDelete ? 
          Math.min(keepCount, Math.max(1, channels.length - 1)) : // Force delete at least one if lots of channels
          keepCount; // Otherwise use the requested keepCount
        
        if (effectiveKeepCount < keepCount) {
          logger.info(`Adjusted keep count from ${keepCount} to ${effectiveKeepCount} to ensure cleanup`);
        }
        
        const channelsToKeep = channels.slice(0, effectiveKeepCount);
        const channelsToDelete = channels.slice(effectiveKeepCount);
        
        // Extract URLs for the most recent and previous channels for comparison
        // Store in the site stats for future display in the dashboard
        if (channelsToKeep.length > 0) {
          const currentChannel = channelsToKeep[0];
          const currentChannelName = currentChannel.name.split('/').pop();
          const currentChannelUrl = currentChannel.url || `https://${site}--${currentChannelName}.web.app`;
          siteStats[site].currentChannel = {
            name: currentChannelName,
            url: currentChannelUrl,
            timestamp: currentChannel.updateTime || currentChannel.lastDeployTime || currentChannel.createTime || 'unknown'
          };
          
          // Get previous channel (second most recent) if available
          if (channelsToKeep.length > 1) {
            const previousChannel = channelsToKeep[1];
            const previousChannelName = previousChannel.name.split('/').pop();
            const previousChannelUrl = previousChannel.url || `https://${site}--${previousChannelName}.web.app`;
            siteStats[site].previousChannel = {
              name: previousChannelName,
              url: previousChannelUrl,
              timestamp: previousChannel.updateTime || previousChannel.lastDeployTime || previousChannel.createTime || 'unknown'
            };
          }
        }
        
        siteStats[site].kept = channelsToKeep.length;
        logger.info(`Keeping ${channelsToKeep.length} newest channels:`);
        for (const channel of channelsToKeep) {
          // Extract just the channel name without the full path
          const shortName = channel.name.split('/').pop();
          const time = channel.updateTime || channel.lastDeployTime || channel.createTime || 'unknown date';
          logger.info(`  - ${shortName} (${new Date(time).toLocaleString()})`);
        }
        
        if (channelsToDelete.length === 0) {
          logger.info(`No channels to delete for site ${site} - only have ${channels.length} channels`);
          results.push(`No channels to delete for site ${site}`);
          continue;
        }
        
        logger.info(`Will delete ${channelsToDelete.length} older channels:`);
        
        // Delete older channels
        for (const channel of channelsToDelete) {
          // Extract just the channel name without the full path
          const fullName = channel.name;
          const shortName = fullName.split('/').pop();
          const time = channel.updateTime || channel.lastDeployTime || channel.createTime || 'unknown date';
          
          logger.info(`  - ${shortName} (${new Date(time).toLocaleString()})`);
          
          if (!dryRun) {
            try {
              const deleteCommand = `firebase hosting:channel:delete ${shortName} --site=${site} --force`;
              logger.debug(`Executing command: ${deleteCommand}`);
              await execAsync(deleteCommand);
              
              const message = `Deleted channel ${shortName} from site ${site}`;
              logger.success(`    ✓ ${message}`);
              results.push(message);
              siteStats[site].deleted++;
            } catch (deleteError) {
              const errorMsg = `Failed to delete channel ${shortName}: ${deleteError.message}`;
              logger.error(`    ✗ ${errorMsg}`);
              errors.push(errorMsg);
              siteStats[site].errors++;
            }
          } else {
            // In dry run mode, just log what would happen
            const message = `[DRY RUN] Would delete channel ${shortName} from site ${site}`;
            logger.info(`    - ${message}`);
            results.push(message);
            siteStats[site].deleted++;  // Count as "deleted" for reporting in dry run
          }
        }
      } catch (listError) {
        const errorMsg = `Failed to list channels for site ${site}: ${listError.message}`;
        logger.error(errorMsg);
        errors.push(errorMsg);
        siteStats[site].errors++;
      }
    } catch (error) {
      logger.error(`Error processing site ${site}: ${error.message}`);
      errors.push(`Error processing site ${site}: ${error.message}`);
      siteStats[site].errors++;
    }
  }
  
  // Summary
  const totalFound = Object.values(siteStats).reduce((sum, stat) => sum + stat.found, 0);
  const totalDeleted = Object.values(siteStats).reduce((sum, stat) => sum + stat.deleted, 0);
  const totalKept = Object.values(siteStats).reduce((sum, stat) => sum + stat.kept, 0);
  const totalErrors = Object.values(siteStats).reduce((sum, stat) => sum + stat.errors, 0);
  
  // Extract preview comparison information
  const previewComparison = {};
  for (const site of Object.keys(siteStats)) {
    if (siteStats[site].currentChannel || siteStats[site].previousChannel) {
      previewComparison[site] = {
        current: siteStats[site].currentChannel || null,
        previous: siteStats[site].previousChannel || null
      };
    }
  }
  
  logger.info('\n--- Channel Cleanup Summary ---');
  logger.info(`Sites processed: ${sitesToClean.length}`);
  logger.info(`Total preview channels found: ${totalFound}`);
  logger.info(`Channels kept: ${totalKept}`);
  logger.info(`Channels deleted${dryRun ? ' (would delete)' : ''}: ${totalDeleted}`);
  logger.info(`Errors encountered: ${totalErrors}`);
  
  // Per-site breakdown
  logger.info('\nPer-site breakdown:');
  for (const site of sitesToClean) {
    // Skip reporting sites that were skipped during processing
    if (!siteStats[site]) {
      logger.info(`  ${site}: Skipped (no channels found or site ignored)`);
      continue;
    }
    const stats = siteStats[site];
    logger.info(`  ${site}: ${stats.found} found, ${stats.kept} kept, ${stats.deleted} deleted, ${stats.errors} errors`);
  }
  
  return {
    success: errors.length === 0 || totalDeleted > 0,
    results,
    errors,
    deletedCount: totalDeleted,
    stats: siteStats,
    totalErrors,
    previewComparison
  };
}

// Add a new function to verify Firebase configuration before attempting cleanup
export async function verifyFirebaseConfiguration() {
  try {
    // Check if Firebase CLI is installed and authenticated
    const authResult = await commandRunner.runCommandAsync('firebase --version', { 
      stdio: 'pipe',
      ignoreError: true 
    });
    
    if (!authResult.success) {
      return { 
        success: false, 
        error: 'Firebase CLI not installed or not in PATH. Install with: npm install -g firebase-tools' 
      };
    }
    
    // Check authentication status
    const loginResult = await commandRunner.runCommandAsync('firebase login:list', { 
      stdio: 'pipe',
      ignoreError: true 
    });
    
    if (!loginResult.success || loginResult.output.includes('No users')) {
      return { 
        success: false, 
        error: 'Not logged in to Firebase. Run: firebase login' 
      };
    }
    
    // Check project configuration
    const config = getCleanupConfig();
    
    if (!config.projectId) {
      // Try to get project from .firebaserc
      const projectResult = await commandRunner.runCommandAsync('firebase projects:list --json', { 
        stdio: 'pipe',
        ignoreError: true 
      });
      
      if (!projectResult.success) {
        return { 
          success: false, 
          error: 'No Firebase project configured and unable to list projects. Check your Firebase setup.' 
        };
      }
      
      try {
        const projects = JSON.parse(projectResult.output).result || [];
        if (projects.length === 0) {
          return { 
            success: false, 
            error: 'No Firebase projects available. Create a project or check your permissions.' 
          };
        }
        
        logger.info(`Found ${projects.length} Firebase projects available`);
      } catch (e) {
        return { 
          success: false, 
          error: 'Failed to parse Firebase projects response' 
        };
      }
    }
    
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: `Firebase configuration verification failed: ${error.message}` 
    };
  }
}

// Command line entrypoint for testing and debugging
if (typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].includes('channel-cleanup.js')) {
  cleanupChannels()
    .then(result => {
      logger.info(`Cleaned ${result.results.length} channels`);
      process.exit(0);
    })
    .catch(error => {
      logger.error(`Error: ${error.message}`);
      process.exit(1);
    });
} 