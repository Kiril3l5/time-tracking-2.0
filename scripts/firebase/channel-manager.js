#!/usr/bin/env node

/**
 * Firebase Channel Manager Module
 * 
 * Provides utilities for managing Firebase hosting preview channels,
 * including listing, filtering, and sorting channels.
 * 
 * Features:
 * - List all channels for a site
 * - Filter channels by prefix or pattern
 * - Sort channels by creation time
 * - Get channel details and metadata
 * 
 * @module firebase/channel-manager
 */

import * as commandRunner from '../core/command-runner.js';
import * as logger from '../core/logger.js';

/* global process */

/**
 * List all preview channels for a site
 * @param {Object} options - Options
 * @param {string} [options.projectId] - Firebase project ID
 * @param {string} [options.site] - Firebase hosting site
 * @param {string} [options.format='json'] - Output format ('json', 'text', or 'dashboard')
 * @param {boolean} [options.displayUrls=true] - Whether to include URLs in the output
 * @param {boolean} [options.verbose=false] - Whether to log verbose output
 * @returns {Promise<Object>} - Result of the operation
 */
export async function listChannels(options) {
  const { 
    projectId, 
    site, 
    format = 'json', 
    displayUrls = true,
    verbose = false 
  } = options;

  if (!projectId || !site) {
    return { success: false, error: 'Project ID and site are required' };
  }

  try {
    // Format parameter (dashboard uses json internally)
    const formatParam = (format === 'json' || format === 'dashboard') ? '--json' : '';

    // Build and run command
    logger.info(`Listing preview channels for ${site} in ${projectId}...`);
    
    const command = `firebase hosting:channel:list --project=${projectId} --site=${site} ${formatParam}`;
    
    if (verbose) {
      logger.debug(`Running command: ${command}`);
    }

    const result = await commandRunner.runCommandAsync(command, {
      ignoreError: true
    });
    
    if (!result.success) {
      return { 
        success: false, 
        error: result.error || 'Failed to list channels'
      };
    }

    // Parse the result based on the format
    if (format === 'json' || format === 'dashboard') {
      try {
        const parsed = JSON.parse(result.output || '{}');
        const channels = [];
        
        // Process each channel
        for (const [channelId, info] of Object.entries(parsed.result)) {
          channels.push({
            id: channelId,
            ...info,
            urls: info.url ? [info.url] : []
          });
        }
        
        // Sort channels by create time, newest first
        channels.sort((a, b) => {
          return new Date(b.createTime) - new Date(a.createTime);
        });
        
        // Generate dashboard output if requested
        if (format === 'dashboard') {
          const dashboardOutput = generateDashboard(channels, options);
          return { 
            success: true, 
            channels,
            dashboard: dashboardOutput
          };
        }
        
        return { success: true, channels };
      } catch (error) {
        return { 
          success: false, 
          error: `Failed to parse JSON output: ${error.message}`
        };
      }
    } else {
      // Text format parsing
      const channels = parseTextFormatChannels(result.output);
      return { success: true, channels };
    }
  } catch (error) {
    return { 
      success: false, 
      error: `Error listing channels: ${error.message}`
    };
  }
}

/**
 * Parse text format channel list output
 * @param {string} output - Command output
 * @returns {Array} - List of channels
 */
function parseTextFormatChannels(output) {
  const channels = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    // Skip empty lines or headers
    if (!line.trim() || line.includes('Channel') || line.includes('---')) {
      continue;
    }
    
    // Format is typically "channel-name: https://site--channel-name.web.app"
    const match = line.match(/^([^:]+):(.+)$/);
    if (match) {
      const channelId = match[1].trim();
      const url = match[2].trim();
      
      channels.push({
        id: channelId,
        url,
        urls: [url]
      });
    }
  }
  
  return channels;
}

/**
 * Generate dashboard output for channels
 * @param {Array} channels - List of channels
 * @param {Object} options - Options
 * @returns {string} - Dashboard output
 */
function generateDashboard(channels, options) {
  const colors = logger.getColors();
  let output = '\n';
  
  // Calculate channel age
  channels.forEach(channel => {
    channel.age = calculateChannelAge(channel.createTime);
  });
  
  // Define display columns
  const columns = [
    { key: 'id', label: 'Channel', width: 25 },
    { key: 'age', label: 'Age (days)', width: 12 },
    { key: 'status', label: 'Status', width: 12 },
    { key: 'url', label: 'URL', width: 50 }
  ];
  
  // Generate header
  columns.forEach(col => {
    output += colors.bold(col.label.padEnd(col.width));
  });
  output += '\n';
  
  // Generate separator
  columns.forEach(col => {
    output += ''.padEnd(col.width, '=');
  });
  output += '\n';
  
  // Generate rows
  channels.forEach(channel => {
    columns.forEach(col => {
      let value = channel[col.key] || '';
      
      // Truncate very long values
      if (value.length > col.width) {
        value = value.substr(0, col.width - 3) + '...';
      }
      
      // Add colors for certain columns
      if (col.key === 'age') {
        const days = parseInt(value, 10);
        if (days > 30) {
          value = colors.red(value);
        } else if (days > 14) {
          value = colors.yellow(value);
        } else {
          value = colors.green(value);
        }
      } else if (col.key === 'status') {
        if (value === 'ACTIVE') {
          value = colors.green(value);
        } else {
          value = colors.yellow(value);
        }
      }
      
      output += value.toString().padEnd(col.width);
    });
    output += '\n';
  });
  
  output += `\nTotal channels: ${channels.length}\n`;
  return output;
}

/**
 * Calculate channel age in days
 * @param {string} createTime - Creation timestamp
 * @returns {number} - Age in days
 */
function calculateChannelAge(createTime) {
  const created = new Date(createTime);
  const now = new Date();
  const diff = now - created;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Get a specific channel by ID
 * 
 * @param {Object} options - Options
 * @param {string} options.channelId - Channel ID to get
 * @param {string} options.projectId - Firebase project ID
 * @param {string} options.site - Firebase hosting site name
 * @returns {Promise<Object>} - Channel details
 */
export async function getChannel(options) {
  const { channelId, projectId, site } = options;
  
  logger.info(`Getting details for channel: ${channelId}`);
  
  const result = await commandRunner.runCommandAsync(
    `firebase hosting:channel:get ${channelId} --project=${projectId} --site=${site} --json`,
    { ignoreError: true }
  );
  
  if (!result.success) {
    logger.error(`Failed to get channel: ${channelId}`);
    return {
      success: false,
      error: result.error || 'Command failed'
    };
  }
  
  try {
    const data = JSON.parse(result.output || '{}');
    const channel = data?.result;
    
    if (!channel) {
      throw new Error('No channel data in response');
    }
    
    const nameParts = channel.name.split('/');
    const parsedChannelId = nameParts[nameParts.length - 1];
    
    return {
      success: true,
      channel: {
        id: parsedChannelId,
        name: channel.name,
        url: channel.url || null,
        createTime: channel.createTime || null,
        expireTime: channel.expireTime || null
      }
    };
  } catch (error) {
    logger.warn(`Failed to parse channel JSON: ${error.message}`);
    return {
      success: false,
      error: `Failed to parse channel data: ${error.message}`
    };
  }
}

/**
 * Filter channels by a prefix
 * 
 * @param {Array} channels - Array of channel objects
 * @param {string} prefix - Prefix to filter by
 * @returns {Array} - Filtered channels
 */
export function filterChannelsByPrefix(channels, prefix) {
  if (!prefix) return channels;
  
  return channels.filter(channel => channel.id.startsWith(prefix));
}

/**
 * Sort channels by creation time
 * 
 * @param {Array} channels - Array of channel objects
 * @param {string} order - Sort order ('asc' or 'desc')
 * @returns {Array} - Sorted channels
 */
export function sortChannelsByCreationTime(channels, order = 'desc') {
  // Create a copy to avoid mutating the original
  const sortedChannels = [...channels];
  
  sortedChannels.sort((a, b) => {
    // Handle cases when createTime is not available
    if (!a.createTime) return order === 'desc' ? 1 : -1;
    if (!b.createTime) return order === 'desc' ? -1 : 1;
    
    const timeA = new Date(a.createTime).getTime();
    const timeB = new Date(b.createTime).getTime();
    
    return order === 'desc' 
      ? timeB - timeA  // Newest first
      : timeA - timeB; // Oldest first
  });
  
  return sortedChannels;
}

/**
 * Count channels for a site
 * 
 * @param {Object} options - Options
 * @param {string} options.projectId - Firebase project ID
 * @param {string} options.site - Firebase hosting site name
 * @returns {Promise<number>} - Number of channels
 */
export async function countChannels(options) {
  const result = await listChannels(options);
  
  if (!result.success) {
    return 0;
  }
  
  return result.channels.length;
}

export default {
  listChannels,
  getChannel,
  filterChannelsByPrefix,
  sortChannelsByCreationTime,
  countChannels
}; 