/**
 * Deployment Manager Module
 * 
 * Handles deployment of packages to preview environments.
 * Manages Firebase deployments and channel cleanup.
 */

import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';
import { progressTracker } from '../core/progress-tracker.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { verifyAllAuth } from '../auth/auth-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Deploy a package to preview environment
 * @param {string} pkg - Package name
 * @param {Object} options - Deployment options
 * @returns {Promise<Object>} Deployment result
 */
export async function deployPackage(pkg, options = {}) {
  const startTime = Date.now();
  const result = {
    success: false,
    previewUrl: null,
    error: null,
    duration: 0
  };

  try {
    logger.info(`Deploying package: ${pkg}`);

    // Verify authentication using the auth manager
    const authResult = await verifyAllAuth({
      requireFirebase: true,
      requireGit: false,
      progressTracker
    });

    if (!authResult.success) {
      throw new Error(authResult.errors.join(', '));
    }

    // Deploy to Firebase
    const deployResult = await deployToFirebase(pkg, options);
    if (!deployResult.success) {
      throw new Error(deployResult.error);
    }

    // Extract preview URL
    const previewUrl = extractPreviewUrl(deployResult.output);
    if (!previewUrl) {
      throw new Error('Failed to extract preview URL');
    }

    result.success = true;
    result.previewUrl = previewUrl;
    result.duration = Date.now() - startTime;

    return result;

  } catch (error) {
    logger.error(`Deployment failed for package ${pkg}:`, error);
    result.error = error.message;
    result.duration = Date.now() - startTime;
    return result;
  }
}

/**
 * Deploy package to Firebase
 * @param {string} pkg - Package name
 * @param {Object} options - Deployment options
 * @returns {Promise<Object>} Deployment result
 */
async function deployToFirebase(pkg, options) {
  try {
    const result = await commandRunner.runCommand(`firebase deploy --only hosting:${pkg}`, {
      cwd: dirname(__dirname),
      stdio: 'inherit'
    });

    return {
      success: result.success,
      output: result.output,
      error: result.success ? null : 'Deployment failed'
    };
  } catch (error) {
    return {
      success: false,
      output: null,
      error: error.message
    };
  }
}

/**
 * Extract preview URL from deployment output
 * @param {string} output - Deployment output
 * @returns {string|null} Preview URL
 */
function extractPreviewUrl(output) {
  if (!output) return null;

  // Look for URL pattern in output
  const urlMatch = output.match(/https:\/\/[a-zA-Z0-9-]+\.web\.app/);
  return urlMatch ? urlMatch[0] : null;
}

/**
 * Clean up preview channels
 * @param {Object} options - Cleanup options
 * @returns {Promise<Object>} Cleanup result
 */
export async function cleanupPreviewChannels(options = {}) {
  const startTime = Date.now();
  const result = {
    success: false,
    channelsCleaned: 0,
    error: null,
    duration: 0
  };

  try {
    logger.info('Cleaning up preview channels...');

    // Get list of channels
    const channelsResult = await commandRunner.runCommand('firebase hosting:channel:list', {
      cwd: dirname(__dirname),
      stdio: 'inherit'
    });

    if (!channelsResult.success) {
      throw new Error('Failed to list channels');
    }

    // Parse channels and clean up old ones
    const channels = parseChannels(channelsResult.output);
    const channelsToClean = filterChannelsToClean(channels, options);

    // Delete channels
    for (const channel of channelsToClean) {
      const deleteResult = await commandRunner.runCommand(`firebase hosting:channel:delete ${channel.id}`, {
        cwd: dirname(__dirname),
        stdio: 'inherit'
      });

      if (deleteResult.success) {
        result.channelsCleaned++;
      }
    }

    result.success = true;
    result.duration = Date.now() - startTime;

    return result;

  } catch (error) {
    logger.error('Channel cleanup failed:', error);
    result.error = error.message;
    result.duration = Date.now() - startTime;
    return result;
  }
}

/**
 * Parse channel list from Firebase output
 * @param {string} output - Firebase output
 * @returns {Array<Object>} List of channels
 */
function parseChannels(output) {
  if (!output) return [];

  // Parse channel information from output
  const lines = output.split('\n');
  const channels = [];

  for (const line of lines) {
    const match = line.match(/([a-zA-Z0-9-]+)\s+([^\s]+)\s+([^\s]+)/);
    if (match) {
      channels.push({
        id: match[1],
        url: match[2],
        lastUpdated: match[3]
      });
    }
  }

  return channels;
}

/**
 * Filter channels that should be cleaned up
 * @param {Array<Object>} channels - List of channels
 * @param {Object} options - Filter options
 * @returns {Array<Object>} Channels to clean
 */
function filterChannelsToClean(channels, options) {
  const now = new Date();
  const maxAge = options.maxAge || 7 * 24 * 60 * 60 * 1000; // 7 days default

  return channels.filter(channel => {
    const lastUpdated = new Date(channel.lastUpdated);
    return now - lastUpdated > maxAge;
  });
}

export default {
  deployPackage,
  cleanupPreviewChannels
}; 