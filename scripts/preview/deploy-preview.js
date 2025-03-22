#!/usr/bin/env node

/**
 * Preview Deployment Script
 * 
 * Deploys the application to a Firebase hosting channel for preview.
 * Can be run manually or as part of a CI/CD workflow.
 * 
 * Usage:
 *   node scripts/preview/deploy-preview.js [options]
 * 
 * Options:
 *   --branch <branch>     Branch name to use (default: current branch)
 *   --pr <number>         PR number to use for channel name
 *   --no-cleanup          Disable automatic cleanup of old channels
 *   --expires <days>      Number of days until channel expires (default: 7)
 *   --channel <name>      Custom channel name to use
 *   --build-dir <dir>     Custom build directory to deploy
 *   --site <site>         Firebase hosting site ID
 *   --project <projectId> Firebase project ID
 *   --verbose             Enable verbose logging
 * 
 * Examples:
 *   node scripts/preview/deploy-preview.js --pr 123
 *   node scripts/preview/deploy-preview.js --channel feature-login
 *   node scripts/preview/deploy-preview.js --site my-site --project my-project
 * 
 * @module preview/deploy-preview
 */

import * as core from './core.js';
import { parseArgs } from 'node:util';

/* global process */

// Parse command line arguments
function parseArguments() {
  const options = {
    branch: { type: 'string' },
    pr: { type: 'string' },
    cleanup: { type: 'boolean', default: true }, 
    expires: { type: 'string' },
    channel: { type: 'string' },
    'build-dir': { type: 'string' },
    site: { type: 'string' },
    project: { type: 'string' },
    verbose: { type: 'boolean', default: false }
  };
  
  const { values } = parseArgs({ options, allowPositionals: false });
  return values;
}

/**
 * Main function to handle the preview deployment
 */
async function main() {
  try {
    // Parse command line arguments
    const args = parseArguments();
    
    // Set up logging based on verbosity
    if (args.verbose) {
      core.logger.setVerbose(true);
    }
    
    // Log the start of the deployment process
    core.logger.info('Starting preview deployment process');
    
    // Get the current branch and PR information
    const branch = args.branch || core.github.getCurrentBranch();
    let prNumber = args.pr;
    
    if (!prNumber && branch) {
      // Try to extract PR number from branch name
      prNumber = core.github.extractPrNumber(branch);
    }
    
    core.logger.info(`Branch: ${branch || 'unknown'}`);
    core.logger.info(`PR Number: ${prNumber || 'unknown'}`);
    
    // Generate channel name if not provided
    let channelId = args.channel;
    if (!channelId) {
      if (prNumber) {
        channelId = `pr-${prNumber}`;
      } else if (branch) {
        channelId = core.environment.generateEnvironmentName(branch);
      } else {
        channelId = `preview-${Date.now()}`;
      }
    }
    
    core.logger.info(`Channel ID: ${channelId}`);
    
    // Get Firebase config (project, site) from args or config
    const projectId = args.project || core.config.firebaseConfig.projectId;
    const site = args.site || core.config.firebaseConfig.site;
    const buildDir = args['build-dir'] || core.config.firebaseConfig.buildDir;
    
    // Check if channel should expire
    const expires = args.expires !== undefined;
    const expireDays = expires ? parseInt(args.expires, 10) || 7 : 7;
    
    // Deploy to Firebase hosting channel
    core.logger.info(`Deploying to Firebase hosting channel: ${channelId}`);
    core.logger.info(`Project: ${projectId}, Site: ${site}`);
    core.logger.info(`Build directory: ${buildDir}`);
    
    if (expires) {
      core.logger.info(`Channel will expire in ${expireDays} days`);
    }
    
    const deploymentResult = await core.firebaseDeploy.deployToChannel({
      channelId,
      projectId,
      site,
      buildDir,
      expires,
      expireDays
    });
    
    if (deploymentResult.success) {
      core.logger.success(`Deployment successful!`);
      core.logger.info(`Channel URL: ${deploymentResult.url}`);
      
      // Add PR comment if we have a PR number
      if (prNumber) {
        core.logger.info(`Adding deployment comment to PR #${prNumber}`);
        
        core.github.addDeploymentComment(prNumber, {
          url: deploymentResult.url,
          environment: 'preview',
          commitSha: core.github.getCurrentCommitSha(),
          branch
        });
      }
      
      // Clean up old channels if cleanup is enabled
      if (args.cleanup && core.config.previewConfig.autoCleanup) {
        core.logger.info('Cleaning up old preview channels...');
        
        const cleanupResult = core.firebaseDeploy.cleanupChannels({
          prefix: core.config.previewConfig.prefix,
          keepCount: core.config.previewConfig.keepCount,
          projectId,
          site
        });
        
        if (cleanupResult.success) {
          core.logger.success(`Cleanup successful. Deleted ${cleanupResult.deleted.length} channels.`);
        } else {
          core.logger.warn(`Channel cleanup failed: ${cleanupResult.error}`);
        }
      }
      
      process.exit(0);
    } else {
      core.logger.error(`Deployment failed: ${deploymentResult.error}`);
      process.exit(1);
    }
  } catch (error) {
    core.logger.error(`Error in preview deployment:`);
    core.logger.error(error.message);
    core.logger.error(error.stack);
    process.exit(1);
  }
}

// Run the main function
main(); 