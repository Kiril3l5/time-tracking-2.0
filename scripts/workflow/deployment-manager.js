/**
 * Deployment Manager Module
 * 
 * Handles deployment to Firebase preview environments.
 */

import fs from 'fs';
import path from 'path';
import getWorkflowState from './workflow-state.js';
import { logger } from '../core/logger.js';
import { commandRunner } from '../core/command-runner.js';
import { getCurrentBranch } from './branch-manager.js';

/* global process */

/**
 * Deploy a package to Firebase preview
 * 
 * @param {Object} options - Deployment options
 * @param {string} options.target - Target hosting site (hours, admin)
 * @param {string} options.channelId - Channel ID for preview
 * @returns {Promise<Object>} Deployment result
 */
export async function deployPackage(options) {
  const { target, channelId } = options;
  
  try {
    logger.info(`Deploying ${target} to preview channel: ${channelId}`);
    
    // Validate channel ID length
    if (channelId.length > 63) {
      throw new Error(`Channel ID '${channelId}' exceeds Firebase's 63 character limit`);
    }
    
    // Validate target
    if (!target || (target !== 'hours' && target !== 'admin')) {
      throw new Error(`Invalid target '${target}'. Must be 'hours' or 'admin'`);
    }
    
    // Verify that the build files exist
    const distPath = path.resolve(process.cwd(), `packages/${target}/dist`);
    const indexHtmlPath = path.join(distPath, 'index.html');
    
    if (!fs.existsSync(distPath) || !fs.existsSync(indexHtmlPath)) {
      logger.warn(`Build artifacts for ${target} not found at ${distPath}`);
      logger.info('Running build to ensure latest changes are included...');
      
      // Run build only for the needed package
      const buildResult = await commandRunner.runCommandAsync(
        `pnpm --filter ${target} run build`,
        { 
          stdio: 'inherit',
          timeout: 120000 // 2 minute timeout
        }
      );
      
      if (!buildResult.success) {
        throw new Error(`Build failed for ${target}. Cannot deploy.`);
      }
      
      // Verify again
      if (!fs.existsSync(distPath) || !fs.existsSync(indexHtmlPath)) {
        throw new Error(`Build artifacts still not found after building ${target}.`);
      }
      
      logger.success(`Build completed successfully for ${target}`);
    }
    
    logger.info(`Deploying ${target} to preview channel: ${channelId}`);
    
    // Run Firebase deploy command
    const result = await commandRunner.runCommandAsync(
      `firebase hosting:channel:deploy ${channelId} --only ${target}`,
      {
        stdio: 'inherit',
        timeout: 120000 // 2 minute timeout
      }
    );

    if (!result.success) {
      logger.error(`Firebase deploy command failed for target: ${target}`);
      logger.debug('Raw deployment result:', JSON.stringify(result, null, 2));

      let detailedError = 'Unknown deployment error';
      const errorOutput = result.error?.trim();
      const standardOutput = result.output?.trim();

      if (errorOutput) {
        detailedError = errorOutput;
      } else if (standardOutput) {
        detailedError = standardOutput;
      }

      if (detailedError.includes('not authenticated')) {
        detailedError = 'Firebase authentication failed. Please run "firebase login" first.';
      } else if (detailedError.includes('not detected') || detailedError.includes('not found')) {
        detailedError = `Hosting target '${target}' not found or not configured correctly in firebase.json.`;
      } else if (detailedError.includes('limit')) {
        detailedError = 'Channel limit reached. Try running "firebase hosting:channel:list" and delete old channels.';
      } else if (detailedError.includes('permission') || detailedError.includes('forbidden')) {
        detailedError = `Permission denied during deployment for target '${target}'. Check Firebase project permissions.`;
      }

      throw new Error(`Deployment failed for ${target}: ${detailedError}`);
    }
    
    // Get channel URL from the list command since we can't reliably extract it from deploy output
    const siteName = `${target}-autonomyhero-2024`;
    const channelListResult = await commandRunner.runCommandAsync(
      `firebase hosting:channel:list --site ${siteName}`, 
      { stdio: 'pipe' }
    );
    
    let previewUrl = null;
    
    if (channelListResult.success) {
      // Parse output to find the URL for our channel
      const channelListOutput = channelListResult.output || '';
      const channelLines = channelListOutput.split('\n');
      
      // Look for our channel ID and extract the URL
      for (const line of channelLines) {
        if (line.includes(channelId)) {
          // Extract URL from the line using regex
          const urlMatch = line.match(/https:\/\/[^\s]+/);
          if (urlMatch) {
            previewUrl = urlMatch[0];
            break;
          }
        }
      }
    }
    
    if (!previewUrl) {
      logger.warn(`Could not extract preview URL for ${target} from Firebase output. ` +
                  `Run 'firebase hosting:channel:list --site ${siteName}' to view URLs.`);
    }
    
    return {
      success: true,
      target,
      channelId,
      url: previewUrl
    };
  } catch (error) {
    logger.error(`Deployment failed: ${error.message}`);
    
    return {
      success: false,
      target,
      error: error.message
    };
  }
}

/**
 * Deploy a package with workflow integration
 *
 * @param {Object} options - Deployment options
 * @param {string} options.channelId - Channel ID to deploy to
 * @param {boolean} [options.skipBuild=false] - Skip build step
 * @param {boolean} [options.force=false] - Force deployment even if artifacts don't exist
 * @param {string} [options.phase='Deployment'] - Current phase of the workflow
 * @returns {Promise<Object>} Deployment result with preview URLs
 */
export async function deployPackageWithWorkflowIntegration(options = {}) {
  const { channelId, skipBuild = false, force = false, phase = 'Deployment' } = options;
  
  // Get workflow state for tracking
  const workflowState = getWorkflowState();
  
  // Generate step name
  const stepName = 'Package Deployment';
  
  // Start time for performance tracking
  const startTime = Date.now();
  
  // Set current workflow step
  workflowState.setCurrentStep(stepName);
  
  try {
    // Validate channel ID
    if (!channelId) {
      const error = 'Channel ID is required for deployment';
      workflowState.addWarning(error, stepName, phase);
      workflowState.completeStep(stepName, { success: false, error });
      return { success: false, error };
    }
    
    // Check if build artifacts exist or run build
    const artifactsExist = await checkBuildArtifacts();
    
    if (!artifactsExist) {
      if (skipBuild) {
        if (!force) {
          const error = 'Build artifacts not found and build step is skipped. Use force option to deploy anyway.';
          workflowState.addWarning(error, stepName, phase);
          workflowState.completeStep(stepName, { success: false, error });
          return { success: false, error };
        } else {
          workflowState.addWarning('Forcing deployment without build artifacts', stepName, phase);
        }
      } else {
        // Run build
        workflowState.addWarning('Build artifacts not found. Running build...', stepName, phase);
        
        try {
          await runBuild();
          
          // Verify build succeeded
          const artifactsExistAfterBuild = await checkBuildArtifacts();
          if (!artifactsExistAfterBuild && !force) {
            const error = 'Build completed but artifacts are still missing';
            workflowState.addWarning(error, stepName, phase);
            workflowState.completeStep(stepName, { success: false, error });
            return { success: false, error };
          }
        } catch (buildError) {
          const error = `Build failed: ${buildError.message}`;
          workflowState.addWarning(error, stepName, phase);
          workflowState.completeStep(stepName, { success: false, error });
          return { success: false, error };
        }
      }
    }
    
    // Deploy the package
    workflowState.addWarning(`Deploying to channel: ${channelId}`, stepName, phase, 'info');
    
    const deployResult = await deployToFirebase(channelId);
    
    if (!deployResult.success) {
      const error = `Deployment failed: ${deployResult.error}`;
      workflowState.addWarning(error, stepName, phase);
      workflowState.completeStep(stepName, { success: false, error });
      return deployResult;
    }

    // --- FIX: Fetch URLs AFTER successful deployment --- 
    let fetchedUrls = { hours: null, admin: null };
    try {
      logger.info('Deployment commands succeeded. Fetching preview URLs...');
      // Fetch Hours URL
      const hoursSiteName = 'hours-autonomyhero-2024';
      const hoursListResult = await commandRunner.runCommandAsync(
        `firebase hosting:channel:list --site ${hoursSiteName}`,
        { stdio: 'pipe' } // Use pipe to capture list output
      );
      if (hoursListResult.success) {
        fetchedUrls.hours = extractUrlFromListOutput(hoursListResult.output, channelId);
        if (!fetchedUrls.hours) {
           workflowState.addWarning(`Could not find URL for hours channel ${channelId} in list output.`, stepName, phase);
        }
      } else {
        workflowState.addWarning(`Failed to list channels for hours: ${hoursListResult.error}`, stepName, phase);
      }

      // Fetch Admin URL
      const adminSiteName = 'admin-autonomyhero-2024';
      const adminListResult = await commandRunner.runCommandAsync(
        `firebase hosting:channel:list --site ${adminSiteName}`,
        { stdio: 'pipe' } // Use pipe to capture list output
      );
      if (adminListResult.success) {
        fetchedUrls.admin = extractUrlFromListOutput(adminListResult.output, channelId);
         if (!fetchedUrls.admin) {
           workflowState.addWarning(`Could not find URL for admin channel ${channelId} in list output.`, stepName, phase);
        }
      } else {
         workflowState.addWarning(`Failed to list channels for admin: ${adminListResult.error}`, stepName, phase);
      }
      logger.info('URL Fetching complete:', JSON.stringify(fetchedUrls));
    } catch (fetchError) {
       workflowState.addWarning(`Error fetching preview URLs: ${fetchError.message}`, stepName, phase);
    }
    // --- END FIX ---

    // Record preview URLs if fetched
    // FIX: Check fetchedUrls, not deployResult.urls
    if (fetchedUrls.hours || fetchedUrls.admin) { 
      workflowState.setPreviewUrls(fetchedUrls); 
      workflowState.addWarning(`Deployed successfully. Preview URLs: ${JSON.stringify(fetchedUrls)}`, stepName, phase, 'info');
    } else {
       workflowState.addWarning(`Deployment succeeded but could not retrieve preview URLs for channel ${channelId}.`, stepName, phase);
    }
    
    // Record completion
    workflowState.completeStep(stepName, { 
      success: true, 
      channelId,
      // FIX: Pass the potentially null URLs from fetchedUrls
      urls: fetchedUrls 
    });
    
    // Track metrics
    workflowState.updateMetrics({
      deploymentDuration: Date.now() - startTime,
      channelId
    });
    
    return {
      // Return success even if URL fetch failed, deployment itself succeeded
      success: true, 
      channelId, 
      urls: fetchedUrls, 
      duration: Date.now() - startTime
    };
  } catch (error) {
    // Handle unexpected errors
    const errorMessage = `Unexpected deployment error: ${error.message}`;
    workflowState.addWarning(errorMessage, stepName, phase);
    workflowState.trackError(error, stepName);
    workflowState.completeStep(stepName, { success: false, error: errorMessage });
    
    return {
      success: false,
      error: errorMessage,
      duration: Date.now() - startTime
    };
  }
}

/**
 * Create a unique channel ID based on branch and timestamp
 * 
 * @returns {Promise<string>} Channel ID
 */
export async function createChannelId() {
  const branch = await getCurrentBranch();
  // Take only the first 20 characters of the branch name to avoid excessive length
  const truncatedBranch = branch.substring(0, 20);
  const sanitizedBranch = truncatedBranch.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  
  // Include date for readability
  const dateStamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
  
  // Add unique timestamp component (last 6 digits of current timestamp)
  // This ensures uniqueness even for multiple deployments on the same day
  const uniqueId = Math.floor(Date.now() % 1000000).toString().padStart(6, '0');
  
  // Ensure the total length is reasonable (Firebase has limits on channel ID length)
  const channelId = `preview-${sanitizedBranch}-${dateStamp}-${uniqueId}`;
  
  // Firebase has a 63 character limit for channel IDs
  if (channelId.length > 63) {
    // Further truncate the branch name if needed
    const maxBranchLength = Math.max(8, 20 - (channelId.length - 63));
    const shorterBranch = branch.substring(0, maxBranchLength);
    const shorterSanitizedBranch = shorterBranch.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    return `preview-${shorterSanitizedBranch}-${dateStamp}-${uniqueId}`;
  }
  
  return channelId;
}

/**
 * Check if build artifacts exist for both packages
 * 
 * @returns {Promise<boolean>} True if artifacts exist
 */
async function checkBuildArtifacts() {
  try {
    const hoursDistPath = path.resolve(process.cwd(), 'packages/hours/dist');
    const adminDistPath = path.resolve(process.cwd(), 'packages/admin/dist');
    
    const hoursIndexPath = path.join(hoursDistPath, 'index.html');
    const adminIndexPath = path.join(adminDistPath, 'index.html');
    
    const hoursExists = fs.existsSync(hoursDistPath) && fs.existsSync(hoursIndexPath);
    const adminExists = fs.existsSync(adminDistPath) && fs.existsSync(adminIndexPath);
    
    return hoursExists && adminExists;
  } catch (error) {
    logger.error(`Error checking build artifacts: ${error.message}`);
    return false;
  }
}

/**
 * Run the build process for both packages
 * 
 * @returns {Promise<Object>} Build result
 */
async function runBuild() {
  try {
    logger.info('Running build for all packages...');
    
    const buildResult = await commandRunner.runCommandAsync(
      'pnpm run build:all',
      { 
        stdio: 'pipe',
        timeout: 300000 // 5 minute timeout
      }
    );
    
    if (!buildResult.success) {
      throw new Error(buildResult.error || 'Unknown build error');
    }
    
    return { success: true };
  } catch (error) {
    logger.error(`Build error: ${error.message}`);
    throw error;
  }
}

/**
 * Deploy to Firebase hosting
 * 
 * @param {string} channelId - Channel ID for deployment
 * @returns {Promise<Object>} Deployment result with URLs
 */
async function deployToFirebase(channelId) {
  try {
    // Validate channel ID length
    if (channelId && channelId.length > 63) {
      return { 
        success: false, 
        error: `Channel ID '${channelId}' exceeds Firebase's 63 character limit`
      };
    }
    
    // Deploy hours app
    logger.info('Deploying Hours app...');
    const hoursResult = await commandRunner.runCommandAsync(
      `firebase hosting:channel:deploy ${channelId} --only hours`,
      { 
        stdio: 'inherit',
        timeout: 180000 // 3 minute timeout
      }
    );
    
    if (!hoursResult.success) {
      const errorMsg = hoursResult.error || `Command failed with exit code ${hoursResult.code || 'unknown'}`;
      return { 
        success: false, 
        error: `Hours deployment failed: ${errorMsg}`
      };
    }
    
    // Deploy admin app
    logger.info('Deploying Admin app...');
    const adminResult = await commandRunner.runCommandAsync(
      `firebase hosting:channel:deploy ${channelId} --only admin`,
      { 
        stdio: 'inherit',
        timeout: 180000 // 3 minute timeout
      }
    );
    
    if (!adminResult.success) {
      const errorMsg = adminResult.error || `Command failed with exit code ${adminResult.code || 'unknown'}`;
      return { 
        success: false, 
        error: `Admin deployment failed: ${errorMsg}`
      };
    }
    
    logger.info('Firebase deploy commands completed successfully. URL retrieval will happen separately.');

    return {
      success: true,
      channelId,
    };
  } catch (error) {
    logger.error(`Deployment error: ${error.message}`);
    return { 
      success: false, 
      error: `Deployment process error: ${error.message}`
    };
  }
}

/**
 * Extract URL from Firebase hosting:channel:list output
 * 
 * @param {string} output - Command output from channel:list
 * @param {string} channelId - Channel ID to find
 * @returns {string|null} Extracted URL or null
 */
function extractUrlFromListOutput(output, channelId) {
  try {
    if (!output || !channelId) return null;
    const channelLines = output.split('\n');
    for (const line of channelLines) {
      // Check if the line contains the channel ID AND looks like a channel entry
      if (line.includes(channelId) && line.match(/preview-/)) { 
        const urlMatch = line.match(/https:\/\/[^\s]+/);
        if (urlMatch) {
          return urlMatch[0];
        }
      }
    }
    return null;
  } catch (error) {
    logger.debug(`URL extraction from list output error: ${error.message}`);
    return null;
  }
} 