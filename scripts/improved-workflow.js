#!/usr/bin/env node

/* global process */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { logger } from './core/logger.js';
import { commandRunner } from './core/command-runner.js';
import { verifyAllAuth } from './auth/auth-manager.js';
import { getCurrentBranch, hasUncommittedChanges } from './workflow/branch-manager.js';
import { QualityChecker } from './workflow/quality-checker.js';
import { PackageCoordinator } from './workflow/package-coordinator.js';
import { deployPackage, createChannelId } from './workflow/deployment-manager.js';
import progressTracker from './core/progress-tracker.js';
import { colors, styled } from './core/colors.js';
import { generateReport } from './workflow/consolidated-report.js';
import { performanceMonitor } from './core/performance-monitor.js';
import { setTimeout } from 'timers/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Main Workflow Class
 * 
 * Orchestrates the development workflow from setup to deployment.
 * Handles validation, building, and deployment of packages.
 */
class Workflow {
  constructor(options = {}) {
    // Core dependencies
    this.logger = logger;
    this.commandRunner = commandRunner;
    this.progressTracker = progressTracker;
    
    // Save start time
    this.startTime = Date.now();
    
    // Workflow components
    this.qualityChecker = new QualityChecker();
    this.packageCoordinator = new PackageCoordinator();
    
    // Options
    this.options = {
      verbose: false,
      skipTests: false,
      skipBuild: false,
      skipDeploy: false,
      skipPr: false,
      ...options
    };
    
    // Set verbose mode
    if (this.logger && this.logger.setVerbose) {
      this.logger.setVerbose(this.options.verbose);
    }
  }

  /**
   * Main workflow execution method
   */
  async run() {
    try {
      // Start performance monitoring
      performanceMonitor.start();
      
      // Initialize progress tracking
      this.progressTracker.initProgress(5, styled.bold(`${colors.cyan}Development Workflow${colors.reset}`));
      
      // 1. Setup Phase
      await this.setup();
      
      // 2. Validation Phase
      await this.validate();
      
      // 3. Build Phase
      await this.build();
      
      // 4. Deploy Phase
      await this.deploy();
      
      // 5. Results Phase
      const reportPath = await this.generateResults();
      
      // End performance monitoring silently - no need to show metrics in console
      performanceMonitor.end();
      
      // Keep the output clean - just show the single most important thing
      this.logger.info('\n');
      this.logger.info(styled.bold(`${colors.green}✨ Dashboard opened in your browser${colors.reset}`));
      
      // Give the user time to view the dashboard (3 seconds)
      await setTimeout(3000);
      
      // Now that the user has seen the dashboard, ask about branch management
      await this.handleBranchOptions();
      
      process.exit(0);
    } catch (error) {
      // Save performance metrics even if there was an error
      performanceMonitor.end();
      
      this.progressTracker.finishProgress(false, styled.error('Workflow failed: ' + error.message));
      
      // Detailed error output
      this.logger.error('\n🔴 WORKFLOW FAILURE\n');
      this.logger.error(`Error Type: ${error.name || 'Error'}`);
      this.logger.error(`Message: ${error.message}`);
      
      // Show stack trace in verbose mode
      if (this.options.verbose && error.stack) {
        this.logger.error('\nStack Trace:');
        this.logger.error(error.stack);
      }
      
      // Show troubleshooting help
      this.logger.info('\n▶ Troubleshooting:');
      this.logger.info('• Try running with --verbose flag for more details');
      this.logger.info('• Check the logs in temp/logs/ for complete information');
      this.logger.info('• Ensure all authentication is properly configured');
      
      process.exit(1);
    }
  }

  /**
   * Setup Phase
   */
  async setup() {
    this.progressTracker.startStep('Setup Phase');
    this.logger.sectionHeader('Initializing Development Environment');
    
    try {
      // Verify Git setup
      this.logger.info('Checking Git configuration...');
      const gitUserResult = await this.commandRunner.runCommandAsync('git config --get user.name', { stdio: 'pipe' });
      const gitEmailResult = await this.commandRunner.runCommandAsync('git config --get user.email', { stdio: 'pipe' });
      
      if (!gitUserResult.success || !gitEmailResult.success) {
        throw new Error('Git user name or email not configured. Please run "git config --global user.name" and "git config --global user.email"');
      }
      
      const gitUserName = gitUserResult.output.trim();
      const gitUserEmail = gitEmailResult.output.trim();
      
      this.logger.success(`✓ Git configuration verified`);
      this.logger.info(`User: ${gitUserName} <${gitUserEmail}>`);
      
      // Verify Firebase auth
      this.logger.info('Checking Firebase CLI authentication...');
      const firebaseResult = await this.commandRunner.runCommandAsync('firebase login:list', { stdio: 'pipe' });
      
      if (!firebaseResult.success) {
        throw new Error('Firebase CLI not authenticated. Please run "firebase login" first.');
      }
      
      // Extract user email from the output
      const emailMatch = firebaseResult.output.match(/\[(.*?)\]/);
      const firebaseUserEmail = emailMatch ? emailMatch[1] : 'Unknown';
      this.logger.success(`✓ Firebase authenticated as: ${firebaseUserEmail}`);
      
      // Verify dependencies
      this.logger.info('Verifying dependencies...');
      const pnpmResult = await this.commandRunner.runCommandAsync('pnpm -v', { stdio: 'pipe' });
      if (!pnpmResult.success) {
        throw new Error('pnpm not found. Please install pnpm: npm install -g pnpm');
      }
      this.logger.success(`✓ Dependencies verified`);

      this.progressTracker.completeStep(true, 'Environment setup complete');
    } catch (error) {
      this.progressTracker.completeStep(false, `Setup failed: ${error.message}`);
      
      // Enhanced error logging
      this.logger.error('\nSetup Phase Failed:');
      this.logger.error(`➤ ${error.message}`);
      
      // Show command output if available
      if (error.output) {
        this.logger.error('\nCommand Output:');
        this.logger.error(error.output);
      }
      
      throw error;
    }
  }

  /**
   * Validation Phase
   */
  async validate() {
    this.progressTracker.startStep('Validation Phase');
    this.logger.sectionHeader('Validating Code Quality');
    
    try {
      // Initialize package coordinator to get build order
      this.logger.info('Analyzing package dependencies...');
      const packageResult = await this.packageCoordinator.initialize();
      if (!packageResult.success) {
        throw new Error(`Package analysis failed: ${packageResult.error}`);
      }
      
      // Skip quality checks if requested
      if (this.options.skipTests) {
        this.logger.warn('Skipping quality checks due to --skip-tests flag');
        this.progressTracker.completeStep(true, 'Quality checks skipped');
        return;
      }
      
      // Run all quality checks
      const checkResult = await this.qualityChecker.runAllChecks();
      
      if (!checkResult.success) {
        this.logger.warn('Quality checks finished with warnings or errors');
      } else {
        this.logger.success('✓ All quality checks passed');
      }
      
      this.progressTracker.completeStep(true, 'Validation complete');
    } catch (error) {
      this.progressTracker.completeStep(false, `Validation failed: ${error.message}`);
      
      // Enhanced error logging
      this.logger.error('\nValidation Phase Failed:');
      this.logger.error(`➤ ${error.message}`);
      
      // Show validation issues if available
      if (error.issues && error.issues.length > 0) {
        this.logger.error('\nValidation Issues:');
        error.issues.forEach((issue, i) => {
          this.logger.error(`${i+1}. ${issue}`);
        });
      }
      
      throw error;
    }
  }

  /**
   * Build Phase
   */
  async build() {
    this.progressTracker.startStep('Build Phase');
    this.logger.sectionHeader('Building Application');
    
    try {
      // Skip build if requested
      if (this.options.skipBuild) {
        this.logger.warn('Skipping build due to --skip-build flag');
        this.progressTracker.completeStep(true, 'Build skipped');
        return;
      }
      
      // Run build
      this.logger.info('Building packages...');
      const buildResult = await this.commandRunner.runCommandAsync('pnpm build', { 
        stdio: 'pipe',
        captureOutput: true
      });
      
      if (!buildResult.success) {
        throw Object.assign(new Error('Build failed'), {
          output: buildResult.output,
          error: buildResult.error
        });
      }
      
      this.logger.success('✓ Build completed successfully');
      this.progressTracker.completeStep(true, 'Build complete');
    } catch (error) {
      this.progressTracker.completeStep(false, `Build failed: ${error.message}`);
      
      // Enhanced error logging for build failures
      this.logger.error('\nBuild Phase Failed:');
      this.logger.error(`➤ ${error.message}`);
      
      if (error.output) {
        this.logger.error('\nBuild Output:');
        this.logger.error(error.output.substring(0, 500) + (error.output.length > 500 ? '...(truncated)' : ''));
      }
      
      if (error.error) {
        this.logger.error('\nBuild Errors:');
        this.logger.error(error.error);
      }
      
      throw error;
    }
  }

  /**
   * Deploy Phase
   */
  async deploy() {
    this.progressTracker.startStep('Deploy Phase');
    this.logger.sectionHeader('Deploying to Preview Environment');
    
    try {
      // Skip deployment if requested
      if (this.options.skipDeploy) {
        this.logger.warn('Skipping deployment due to --skip-deploy flag');
        this.progressTracker.completeStep(true, 'Deployment skipped');
        return;
      }
      
      // Create a unique channel ID for the preview
      const channelId = await createChannelId();
      
      // Deploy hours app
      this.logger.info('Deploying hours app...');
      const hoursResult = await deployPackage({
        target: 'hours',
        channelId
      });
      
      if (!hoursResult.success) {
        throw Object.assign(new Error('Hours app deployment failed'), {
          details: hoursResult.error || 'Unknown deployment error',
          logs: hoursResult.logs
        });
      }
      
      // Deploy admin app
      this.logger.info('Deploying admin app...');
      const adminResult = await deployPackage({
        target: 'admin',
        channelId
      });
      
      if (!adminResult.success) {
        throw Object.assign(new Error('Admin app deployment failed'), {
          details: adminResult.error || 'Unknown deployment error',
          logs: adminResult.logs
        });
      }
      
      // Save URLs for display in results
      this.previewUrls = {
        hours: hoursResult.url,
        admin: adminResult.url,
        channelId
      };
      
      this.logger.success('✓ Deployment completed successfully');
      this.progressTracker.completeStep(true, 'Deployment complete');
    } catch (error) {
      this.progressTracker.completeStep(false, `Deployment failed: ${error.message}`);
      
      // Enhanced error logging for deployment failures
      this.logger.error('\nDeployment Phase Failed:');
      this.logger.error(`➤ ${error.message}`);
      
      if (error.details) {
        this.logger.error('\nError Details:');
        this.logger.error(error.details);
      }
      
      if (error.logs) {
        this.logger.error('\nDeployment Logs:');
        this.logger.error(error.logs);
      }
      
      throw error;
    }
  }

  /**
   * Handle branch options after seeing preview
   */
  async handleBranchOptions() {
    try {
      const currentBranch = await getCurrentBranch();
      
      // Show branch options only if not on main branch
      if (currentBranch && currentBranch !== 'main' && currentBranch !== 'master') {
        this.logger.sectionHeader('Branch Management - After Preview');
        
        // Check for uncommitted changes
        const hasChanges = await hasUncommittedChanges();
        
        if (hasChanges) {
          this.logger.info('You have uncommitted changes.');
          
          // Offer commit option
          const shouldCommit = await this.commandRunner.promptWorkflowOptions(
            'Now that you\'ve seen the preview, would you like to commit these changes?',
            ['Yes, commit changes', 'No, keep changes uncommitted']
          );
          
          if (shouldCommit === '1') {
            // Get commit message
            const message = await this.commandRunner.promptText(
              'Enter commit message',
              `Update project files with preview: ${this.previewUrls?.channelId || 'preview'}`
            );
            
            // Commit changes
            await this.commandRunner.runCommandAsync('git add .', { stdio: 'pipe' });
            await this.commandRunner.runCommandAsync(`git commit -m "${message}"`, { stdio: 'pipe' });
            this.logger.success('Changes committed successfully.');
          }
        }
        
        // Offer PR creation option
        const createPr = await this.commandRunner.promptWorkflowOptions(
          'Would you like to create a pull request with your preview URLs?',
          ['Yes, create PR', 'No, I\'ll do it later']
        );
        
        if (createPr === '1') {
          const title = await this.commandRunner.promptText(
            'Enter PR title',
            `Updates from ${currentBranch} with preview`
          );
          
          // Create PR
          this.logger.info('Creating PR...');
          try {
            await this.commandRunner.runCommandAsync(
              `node scripts/create-pr.js "${title}" "Preview URLs:\\nHours: ${this.previewUrls.hours}\\nAdmin: ${this.previewUrls.admin}"`,
              { stdio: 'inherit' }
            );
          } catch (error) {
            this.logger.warn(`PR creation error: ${error.message}`);
            this.logger.info('You can manually create a PR later using the create-pr.js script.');
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Branch management options failed: ${error.message}`);
      this.logger.info('You can manually commit and create a PR if needed.');
    }
  }

  /**
   * Results Phase
   */
  async generateResults() {
    this.progressTracker.startStep('Results Phase');
    this.logger.sectionHeader('Workflow Results');
    
    try {
      // Create report data
      const reportData = {
        timestamp: new Date().toISOString(),
        metrics: {
          duration: Date.now() - (this.startTime || Date.now()),
        },
        preview: this.previewUrls ? {
          hours: this.previewUrls.hours || 'Not available',
          admin: this.previewUrls.admin || 'Not available',
          channelId: this.previewUrls.channelId
        } : null,
        workflow: {
          options: this.options,
          git: {
            branch: await getCurrentBranch(),
          }
        }
      };
      
      // Generate consolidated report
      this.logger.info('Generating workflow report...');
      const report = await generateReport(reportData);
      this.logger.success('✓ Workflow report generated');
      
      // Display preview URLs
      if (this.previewUrls) {
        this.logger.info('\nPreview URLs:');
        this.logger.info(`Hours App: ${this.previewUrls.hours || 'Not available'}`);
        this.logger.info(`Admin App: ${this.previewUrls.admin || 'Not available'}`);
        this.logger.info(`Channel ID: ${this.previewUrls.channelId}`);
      }
      
      // Skip PR instructions if requested
      if (this.options.skipPr) {
        this.logger.warn('Skipping PR instructions due to --skip-pr flag');
      } else {
        // Show PR instructions
        this.logger.info('\nCreate a Pull Request:');
        this.logger.info('1. Push your changes to GitHub');
        this.logger.info('2. Visit: https://github.com/yourusername/yourrepo/pull/new/your-branch');
        this.logger.info('3. Include preview URLs in the PR description');
      }
      
      this.progressTracker.completeStep(true, 'Results generated');
      
      // The dashboard is already opened by the generateReport function
      return report;
    } catch (error) {
      this.logger.error(`Results generation failed: ${error.message}`);
      this.progressTracker.completeStep(false, `Results generation failed: ${error.message}`);
      
      // Enhanced error logging
      this.logger.error('\nResults Phase Failed:');
      this.logger.error(`➤ ${error.message}`);
      
      if (error.details) {
        this.logger.error('\nError Details:');
        this.logger.error(error.details);
      }
      
      // Try to create a minimal text report if possible
      try {
        if (this.previewUrls) {
          this.logger.info('\nPreview URLs (from minimal report):');
          this.logger.info(`Hours App: ${this.previewUrls.hours || 'Not available'}`);
          this.logger.info(`Admin App: ${this.previewUrls.admin || 'Not available'}`);
          this.logger.info(`Channel ID: ${this.previewUrls.channelId}`);
        }
      } catch (e) {
        // Ignore errors in fallback report
      }
      
      // Don't throw here to allow workflow to complete even if results generation fails
      return {
        error: error.message,
        timestamp: new Date().toISOString(),
        previewUrls: this.previewUrls
      };
    }
  }
}

// Show help information
function showHelp() {
  logger.info(`
Improved Workflow Tool

Usage: node scripts/improved-workflow.js [options]

Options:
  --verbose       Enable verbose logging
  --skip-tests    Skip running tests and linting
  --skip-build    Skip build process
  --skip-deploy   Skip deployment to preview environment
  --skip-pr       Skip PR creation instructions
  --help, -h      Show this help information

Examples:
  node scripts/improved-workflow.js
  node scripts/improved-workflow.js --skip-tests --skip-build
  node scripts/improved-workflow.js --verbose
  `);
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    verbose: false,
    skipTests: false,
    skipBuild: false,
    skipDeploy: false,
    skipPr: false
  };
  
  for (const arg of args) {
    if (arg === '--verbose') options.verbose = true;
    if (arg === '--skip-tests') options.skipTests = true;
    if (arg === '--skip-build') options.skipBuild = true;
    if (arg === '--skip-deploy') options.skipDeploy = true;
    if (arg === '--skip-pr') options.skipPr = true;
    if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    }
  }
  
  return options;
}

// Main function
async function main() {
  logger.init();
  const options = parseArgs();
  const workflow = new Workflow(options);
  await workflow.run();
}

// Run the script
main().catch(error => {
  logger.error('Workflow failed:', error);
  process.exit(1);
}); 