/**
 * Deployment Manager Module
 * 
 * Handles deployment to Firebase preview channels and URL extraction.
 * Properly integrates with existing Firebase modules.
 */

import * as logger from '../core/logger.js';
import * as authManager from '../auth/auth-manager.js';
import * as channelCleanup from '../firebase/channel-cleanup.js';
import * as channelManager from '../firebase/channel-manager.js';
import * as deploymentManager from '../firebase/deployment.js';
import * as urlExtractor from '../firebase/url-extractor.js';

/**
 * Extract user information from auth result
 * @param {Object} authResult - Authentication result object
 * @returns {Object} - Extracted user information
 */
function extractUserInfo(authResult) {
  if (!authResult || !authResult.services) {
    return {
      gitUserName: "Unknown",
      gitUserEmail: "Unknown",
      firebaseEmail: "Unknown"
    };
  }

  // Extract Git user info with proper fallbacks
  const gitInfo = authResult.services.gitAuth || {};
  const gitUserName = gitInfo.userName || gitInfo.name || "Unknown";
  const gitUserEmail = gitInfo.userEmail || gitInfo.email || "Unknown";
  
  // Extract Firebase info with proper fallbacks
  const firebaseInfo = authResult.services.firebase || {};
  const firebaseEmail = firebaseInfo.email || (firebaseInfo.user ? firebaseInfo.user.email : "Unknown");
  
  return {
    gitUserName,
    gitUserEmail,
    firebaseEmail
  };
}

/**
 * Verify authentication for deployment
 * @param {Function} promptFn - Function to prompt the user
 * @returns {Promise<boolean>} - Success status
 */
export async function verifyAuthentication(promptFn) {
  logger.info("Verifying authentication...");
  const authResult = await authManager.verifyAllAuth();
  
  if (!authResult.success) {
    logger.error("Authentication verification failed.");
    
    if (!authResult.services.firebase.authenticated) {
      logger.error("Firebase authentication failed. Run: firebase login");
    }
    
    if (!authResult.services.gitAuth.authenticated) {
      logger.error("Git authentication failed. Configure Git user name and email.");
    }
    
    const continueAnyway = await promptFn("Continue with the workflow anyway? (y/N)", "N");
    return continueAnyway.toLowerCase() === 'y';
  } else {
    const { gitUserName, gitUserEmail, firebaseEmail } = extractUserInfo(authResult);
    
    logger.success(`Firebase authenticated as: ${firebaseEmail}`);
    logger.success(`Git user: ${gitUserName} <${gitUserEmail}>`);
    return true;
  }
}

/**
 * Deploy to Firebase preview channel
 * @param {Object} options - Deployment options
 * @param {string} options.branchName - Current branch name
 * @param {boolean} options.skipBuild - Whether to skip build
 * @param {Function} options.promptFn - Function to prompt the user
 * @returns {Promise<{success: boolean, previewUrls?: Object}>} - Success status and preview URLs
 */
export async function deployToPreview(options) {
  const { branchName, skipBuild = false, promptFn } = options;
  
  try {
    logger.info(`Deploying branch '${branchName}' to Firebase preview channel`);
    
    // Use the existing deployment module
    const deployResult = await deploymentManager.deployToPreviewChannel({
      skipBuild,
      branchName,
      verbose: options.verbose
    });
    
    if (!deployResult || !deployResult.success) {
      logger.error("Preview deployment failed.");
      
      if (promptFn) {
        const continueAnyway = await promptFn("Continue despite deployment failure? (y/N)", "N");
        return { 
          success: continueAnyway.toLowerCase() === 'y',
          error: "Deployment failed"
        };
      }
      
      return { success: false, error: "Deployment failed" };
    }
    
    // Get preview URLs
    let previewUrls = deployResult.previewUrls || null;
    
    // If URLs weren't returned directly, try to extract them
    if (!previewUrls && deployResult.logs) {
      try {
        previewUrls = urlExtractor.extractPreviewUrls(deployResult.logs);
        logger.success("Successfully extracted preview URLs");
      } catch (error) {
        logger.warn(`Error extracting preview URLs: ${error.message}`);
      }
    }
    
    // Log the URLs
    if (previewUrls && (previewUrls.admin || previewUrls.hours)) {
      logger.info("\nPreview URLs:");
      
      if (previewUrls.admin) {
        logger.info(`Admin Dashboard: ${previewUrls.admin}`);
      }
      
      if (previewUrls.hours) {
        logger.info(`Hours App: ${previewUrls.hours}`);
      }
    } else {
      logger.warn("No preview URLs found");
    }
    
    return { 
      success: true, 
      previewUrls 
    };
  } catch (error) {
    logger.error(`Deployment error: ${error.message}`);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Clean up old preview channels
 * @param {Object} options - Cleanup options
 * @param {boolean} options.auto - Whether to automatically clean up 
 * @param {Function} options.promptFn - Function to prompt the user
 * @returns {Promise<boolean>} - Success status
 */
export async function cleanupPreviewChannels(options = {}) {
  try {
    logger.info("Checking for old preview channels to clean up...");
    
    // Check how many channels exist
    const channelList = await channelManager.listChannels();
    logger.info(`Found ${channelList.length} preview channels.`);
    
    // Run cleanup if needed (threshold is 5 channels)
    if (channelList.length > 5) {
      logger.info("Running channel cleanup to remove old channels...");
      
      // If auto cleanup is enabled or user confirms
      let shouldCleanup = options.auto;
      
      if (!shouldCleanup && options.promptFn) {
        const confirm = await options.promptFn(
          `There are ${channelList.length} channels (threshold: 5). Clean up old channels? (Y/n)`, 
          "Y"
        );
        shouldCleanup = confirm.toLowerCase() !== 'n';
      }
      
      if (shouldCleanup) {
        await channelCleanup.cleanupChannels({ 
          auto: true,
          verbose: options.verbose
        });
        logger.success("Successfully cleaned up old preview channels");
      } else {
        logger.info("Channel cleanup skipped by user");
      }
    } else {
      logger.info("Channel cleanup not needed (less than 5 channels exist).");
    }
    
    return true;
  } catch (error) {
    logger.warn(`Channel management error: ${error.message}`);
    logger.info("Continuing despite channel management error.");
    return false;
  }
}

export default {
  verifyAuthentication,
  deployToPreview,
  cleanupPreviewChannels,
  extractUserInfo
}; 