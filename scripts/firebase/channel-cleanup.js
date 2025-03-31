#!/usr/bin/env node

/**
 * Super simple Firebase Channel Cleanup
 * Aggressively deletes all but the 5 most recent preview channels
 */

import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';
import { fileURLToPath } from 'url';

/* global process */

const MAX_CHANNELS = 5;
const PROJECT_ID = 'autonomyhero-dev';
const SITES = ['admin-autonomyhero-2024', 'hours-autonomyhero-2024'];

/**
 * Aggressively clean up old preview channels for both sites
 * @returns {Promise<Object>} - Cleanup result
 */
export async function cleanupChannels() {
  let cleaned = 0;
  
  for (const site of SITES) {
    try {
      // 1. Get channels
      const listCommand = `firebase hosting:channel:list --project=${PROJECT_ID} --site=${site} --json`;
      const listResult = await commandRunner.runCommandAsync(listCommand, { encoding: 'utf8', stdio: 'pipe' });
      
      if (!listResult.success) continue;
      
      // 2. Parse channels
      const output = JSON.parse(listResult.output);
      if (!output.result || !output.result.channels || !output.result.channels.length) continue;
      
      const channels = output.result.channels.map(channel => {
        const nameMatch = channel.name.match(/\/channels\/([^/]+)$/);
        return {
          id: nameMatch ? nameMatch[1] : channel.name,
          createTime: channel.createTime || new Date(0).toISOString()
        };
      });
      
      // 3. Sort by creation time (newest first)
      channels.sort((a, b) => new Date(b.createTime) - new Date(a.createTime));
      
      // 4. Keep only the 5 newest, delete everything else
      if (channels.length > MAX_CHANNELS) {
        const toDelete = channels.slice(MAX_CHANNELS);
        logger.info(`Deleting ${toDelete.length} old channels from ${site}`);
        
        // 5. Delete old channels
        for (const channel of toDelete) {
          if (!channel.id) continue;
          const deleteCommand = `firebase hosting:channel:delete ${channel.id} --site=${site} --project=${PROJECT_ID} --force`;
          await commandRunner.runCommandAsync(deleteCommand, { stdio: 'pipe' });
          cleaned++;
        }
      }
    } catch (error) {
      // Silently continue - we don't want to fail the workflow for cleanup issues
      logger.debug(`Error cleaning up ${site}: ${error.message}`);
    }
  }
  
  return {
    success: true,
    cleaned
  };
}

// For direct script execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cleanupChannels()
    .then(result => {
      logger.info(`Cleaned ${result.cleaned} channels`);
      process.exit(0);
    })
    .catch(() => process.exit(1));
} 