#!/usr/bin/env node

/**
 * Firebase Deployment Module
 * 
 * Handles Firebase preview and production deployments, URL extraction,
 * and related deployment functionality. This module is central to the deployment
 * workflow, providing the core functions for deploying to Firebase Hosting.
 * 
 * Features:
 * - Create preview deployments with configurable options
 * - Extract preview URLs from deployment outputs
 * - Deploy to production with proper authentication and validation
 * - Generate unique channel IDs for preview environments
 * - Validate deployment success and handle errors gracefully
 * 
 * @module firebase/deployment
 * @example
 * // Basic usage example
 * import * as deployment from './firebase/deployment.js';
 * 
 * // Deploy to a preview channel
 * const previewResult = await deployment.deployToPreviewChannel({
 *   projectId: 'my-firebase-project',
 *   site: 'my-site',
 *   channelId: 'pr-123',
 *   message: 'Preview deployment for PR #123'
 * });
 * 
 * if (previewResult.success) {
 *   console.log('Preview URLs:', previewResult.urls);
 * }
 * 
 * // Deploy to production
 * const prodResult = await deployment.deployToProduction({
 *   projectId: 'my-firebase-project',
 *   site: 'my-site',
 *   message: 'Production release v1.2.3'
 * });
 */

import * as commandRunner from '../core/command-runner.js';
import * as logger from '../core/logger.js';
import * as config from '../core/config.js';
import * as urlExtractor from './url-extractor.js';

/* global process */

/**
 * Deploy to a Firebase preview channel
 * 
 * @async
 * @function deployToPreviewChannel
 * @param {Object} options - Deployment options
 * @param {string} options.projectId - Firebase project ID
 * @param {string} options.site - Firebase hosting site name
 * @param {string} options.channelId - Channel ID for the preview
 * @param {string} [options.buildDir='build'] - Directory to deploy
 * @param {boolean} [options.cleanBuild=true] - Whether to clean the build directory first
 * @param {string} [options.message] - Optional message for the deployment
 * @param {Object} [options.env={}] - Environment variables for the build
 * @returns {Promise<Object>} Deployment result object containing:
 *   - success {boolean}: Whether the deployment was successful
 *   - channelId {string}: The channel ID that was deployed to
 *   - urls {string[]}: Array of preview URLs for the deployed site
 *   - rawOutput {string}: Raw output from the Firebase deployment command
 *   - error {string}: Error message if the deployment failed
 * @description Creates a preview deployment on Firebase Hosting using the specified
 * channel ID. First builds the application, then deploys it to the specified
 * channel, and finally extracts and returns the resulting preview URLs.
 * @example
 * // Deploy a PR preview with custom environment variables
 * const result = await deployToPreviewChannel({
 *   projectId: 'my-firebase-project',
 *   site: 'my-site',
 *   channelId: 'pr-123',
 *   buildDir: 'dist',
 *   message: 'Testing new feature',
 *   env: {
 *     REACT_APP_API_URL: 'https://api-staging.example.com',
 *     REACT_APP_FEATURE_FLAG: 'true'
 *   }
 * });
 * 
 * if (result.success) {
 *   console.log('Preview available at:', result.urls[0]);
 * } else {
 *   console.error('Deployment failed:', result.error);
 * }
 */
export async function deployToPreviewChannel(options) {
  const {
    projectId,
    site,
    channelId,
    buildDir = 'build',
    cleanBuild = true,
    message = '',
    env = {}
  } = options;
  
  // Validate inputs
  if (!projectId || !site || !channelId) {
    logger.error('Missing required parameters for preview deployment');
    return {
      success: false,
      error: 'Missing required parameters (projectId, site, channelId)'
    };
  }
  
  logger.info(`Deploying to Firebase preview channel: ${channelId}`);
  logger.info(`Project: ${projectId}, Site: ${site}`);
  
  // Clean build directory if needed
  if (cleanBuild) {
    logger.info('Cleaning build directory...');
    
    // Use platform-specific command for cleaning
    const isWindows = process.platform === 'win32';
    const cleanCommand = isWindows 
      ? `if exist ${buildDir}\\* (del /s /q ${buildDir}\\* && for /d %i in (${buildDir}\\*) do @rmdir /s /q "%i")`
      : `rm -rf ${buildDir}/*`;
    
    const cleanResult = await commandRunner.runCommandAsync(cleanCommand);
    
    if (!cleanResult.success) {
      logger.error('Failed to clean build directory');
      return {
        success: false,
        error: 'Failed to clean build directory'
      };
    }
  }
  
  // Run build script with environment variables
  logger.info('Building application...');
  
  const buildCommand = 'pnpm run build:all';
  const buildResult = await commandRunner.runCommandAsync(buildCommand, {
    env: { ...process.env, ...env }
  });
  
  if (!buildResult.success) {
    logger.error('Build failed, aborting deployment');
    return {
      success: false,
      error: 'Build failed',
      buildOutput: buildResult.output
    };
  }
  
  // Deploy to Firebase
  logger.info('Deploying to Firebase...');
  
  // Format the channel ID for Firebase CLI (clean up any potentially invalid characters)
  const cleanChannelId = channelId.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  
  // Use a platform-independent command format with proper escaping
  const isWindows = process.platform === 'win32';
  const deployCommand = isWindows
    ? `firebase hosting:channel:deploy ${cleanChannelId} --project=${projectId} --json`
    : `firebase hosting:channel:deploy ${cleanChannelId} --project=${projectId} --json`;
  
  logger.info(`Running command: ${deployCommand}`);
  
  // Increase timeout for Windows environments which might be slower
  const timeout = isWindows ? 300000 : 180000; // 5 minutes on Windows, 3 minutes elsewhere
  
  const deployResult = await commandRunner.runCommandAsync(deployCommand, {
    ignoreError: true, // Handle errors ourselves for better error messages
    timeout,
    shell: true // Use shell on all platforms for better compatibility
  });
  
  if (!deployResult.success) {
    logger.error('Firebase deployment failed');
    
    // Provide more specific error information and recovery steps
    if (deployResult.stderr?.includes('not authorized')) {
      logger.error('Authorization error: You are not authorized to deploy to this Firebase project');
      logger.info('Please verify:');
      logger.info('1. You are logged in with the correct account (firebase login)');
      logger.info('2. Your account has permission to deploy to this project');
      logger.info('3. The project ID is correct');
    } else if (deployResult.stderr?.includes('not found')) {
      logger.error(`Project or site not found: ${projectId}`);
      logger.info('Please verify the project exists and is correctly specified');
    } else if (deployResult.stderr?.includes('ETIMEDOUT') || deployResult.stderr?.includes('ECONNREFUSED')) {
      logger.error('Network error: Unable to connect to Firebase servers');
      logger.info('Please check your internet connection and try again');
    } else {
      logger.error(`Deployment error: ${deployResult.stderr || deployResult.error || 'Unknown error'}`);
    }
    
    return {
      success: false,
      error: 'Firebase deployment failed',
      deployOutput: deployResult.output,
      deployError: deployResult.stderr
    };
  }
  
  // Extract preview URLs from the output using the urlExtractor module
  const extractResult = urlExtractor.extractHostingUrls({
    deploymentOutput: deployResult.output,
    verbose: true
  });
  
  if (!extractResult.success || extractResult.urls.length === 0) {
    logger.warn('Deployment succeeded but no preview URLs found in output');
    return {
      success: true,
      urls: [],
      rawOutput: deployResult.output
    };
  }
  
  // Log the URLs
  logger.success('Preview deployment successful!');
  logger.info('Preview URLs:');
  for (const url of extractResult.urls) {
    logger.info(`- ${url}`);
  }
  
  return {
    success: true,
    channelId,
    urls: extractResult.urls,
    rawOutput: deployResult.output
  };
}

/**
 * Deploy to Firebase production
 * 
 * @async
 * @function deployToProduction
 * @param {Object} options - Deployment options
 * @param {string} options.projectId - Firebase project ID
 * @param {string} options.site - Firebase hosting site name
 * @param {string} [options.buildDir='build'] - Directory to deploy
 * @param {boolean} [options.cleanBuild=true] - Whether to clean the build directory first
 * @param {string} [options.message] - Optional message for the deployment
 * @param {Object} [options.env={}] - Environment variables for the build
 * @returns {Promise<Object>} Deployment result object containing:
 *   - success {boolean}: Whether the deployment was successful
 *   - rawOutput {string}: Raw output from the Firebase deployment command
 *   - error {string}: Error message if the deployment failed
 * @description Deploys the application to Firebase Hosting in production mode.
 * This function builds the application with the specified environment variables,
 * then deploys it to the production site. Production deployments should be
 * performed carefully, typically after thorough testing in preview environments.
 * @example
 * // Deploy to production with a release message
 * const result = await deployToProduction({
 *   projectId: 'my-firebase-project',
 *   site: 'my-site',
 *   message: 'Release v1.2.3 - Bug fixes and performance improvements',
 *   env: { NODE_ENV: 'production' }
 * });
 * 
 * if (result.success) {
 *   console.log('Production deployment successful!');
 * } else {
 *   console.error('Production deployment failed:', result.error);
 * }
 */
export async function deployToProduction(options) {
  const {
    projectId,
    site,
    buildDir = 'build',
    cleanBuild = true,
    message = '',
    env = {}
  } = options;
  
  // Validate inputs
  if (!projectId || !site) {
    logger.error('Missing required parameters for production deployment');
    return {
      success: false,
      error: 'Missing required parameters (projectId, site)'
    };
  }
  
  logger.info(`Deploying to Firebase production`);
  logger.info(`Project: ${projectId}, Site: ${site}`);
  
  // Clean build directory if needed
  if (cleanBuild) {
    logger.info('Cleaning build directory...');
    
    // Use platform-specific command for cleaning
    const isWindows = process.platform === 'win32';
    const cleanCommand = isWindows 
      ? `if exist ${buildDir}\\* (del /s /q ${buildDir}\\* && for /d %i in (${buildDir}\\*) do @rmdir /s /q "%i")`
      : `rm -rf ${buildDir}/*`;
    
    const cleanResult = await commandRunner.runCommandAsync(cleanCommand);
    
    if (!cleanResult.success) {
      logger.error('Failed to clean build directory');
      return {
        success: false,
        error: 'Failed to clean build directory'
      };
    }
  }
  
  // Run build script with environment variables
  logger.info('Building application...');
  
  const buildCommand = 'pnpm run build:all';
  const buildResult = await commandRunner.runCommandAsync(buildCommand, {
    env: { ...process.env, ...env }
  });
  
  if (!buildResult.success) {
    logger.error('Build failed, aborting deployment');
    return {
      success: false,
      error: 'Build failed',
      buildOutput: buildResult.output
    };
  }
  
  // Deploy to Firebase
  logger.info('Deploying to Firebase production...');
  
  // Use a simpler command format similar to the channel deployment
  const deployCommand = `firebase deploy --only hosting --project=${projectId}`;
  
  const deployResult = await commandRunner.runCommandAsync(deployCommand);
  
  if (!deployResult.success) {
    logger.error('Firebase production deployment failed');
    return {
      success: false,
      error: 'Firebase production deployment failed',
      deployOutput: deployResult.output
    };
  }
  
  // Log success
  logger.success('Production deployment successful!');
  
  return {
    success: true,
    rawOutput: deployResult.output
  };
}

/**
 * Generate a channel ID for preview deployment
 * 
 * @function generateChannelId
 * @param {Object} [options={}] - Channel options
 * @param {string} [options.prefix='pr'] - Prefix for the channel ID
 * @param {string} [options.prNumber] - Pull request number (if applicable)
 * @param {string} [options.branchName] - Branch name (if applicable)
 * @returns {string} Generated channel ID suitable for Firebase preview channels
 * @description Creates a unique channel ID for Firebase preview deployments.
 * The ID is based on a combination of prefix, PR number or branch name, and
 * a timestamp to ensure uniqueness. The generated ID follows Firebase Hosting
 * naming conventions for preview channels.
 * @example
 * // Generate a channel ID for a specific PR
 * const channelId = generateChannelId({
 *   prefix: 'pr',
 *   prNumber: '123'
 * });
 * console.log(channelId); // "pr-123-123456" (with timestamp suffix)
 * 
 * // Generate a channel ID based on branch name
 * const branchChannelId = generateChannelId({
 *   prefix: 'feature',
 *   branchName: 'add-login-form'
 * });
 * console.log(branchChannelId); // "feature-add-login-form-123456"
 */
export function generateChannelId(options = {}) {
  const {
    prefix = 'pr',
    prNumber,
    branchName
  } = options;
  
  let channelId = prefix;
  
  // Add PR number if available
  if (prNumber) {
    channelId += `-${prNumber}`;
  } 
  // Add branch name if available and no PR number
  else if (branchName) {
    // Clean up branch name for use in channel ID
    const cleanBranchName = branchName
      .replace(/[^a-zA-Z0-9-]/g, '-') // Replace non-alphanumeric chars with hyphens
      .replace(/-+/g, '-')           // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, '')         // Remove leading/trailing hyphens
      .toLowerCase();
      
    channelId += `-${cleanBranchName}`;
  }
  
  // Add timestamp to ensure uniqueness
  const timestamp = new Date().getTime().toString().slice(-6);
  channelId += `-${timestamp}`;
  
  return channelId;
}

export default {
  deployToPreviewChannel,
  deployToProduction,
  generateChannelId
}; 