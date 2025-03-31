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
import { cleanupChannels } from './firebase/channel-cleanup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Clean up existing workflow state files to prevent showing errors from previous runs
 */
function cleanupPreviousRuns() {
  try {
    // Clean up workflow state backup files that could contain old errors
    const tempDir = join(process.cwd(), 'temp');
    if (fs.existsSync(tempDir)) {
      // Clean up backup files
      const backupDir = join(tempDir, 'backups');
      if (fs.existsSync(backupDir)) {
        const backupFiles = fs.readdirSync(backupDir)
          .filter(f => f.startsWith('workflow-state-'));
        
        for (const file of backupFiles) {
          fs.unlinkSync(join(backupDir, file));
        }
      }
    }
  } catch (error) {
    // Ignore errors in cleanup - don't want to prevent workflow from running
    logger.debug(`Cleanup warning: ${error.message}`);
  }
}

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
    
    // Initialize workflow components
    try {
      this.qualityChecker = new QualityChecker();
      this.packageCoordinator = new PackageCoordinator();
    } catch (error) {
      // If components fail to initialize, log the error but continue
      this.logger.warn(`Component initialization warning: ${error.message}`);
      if (!this.qualityChecker) this.qualityChecker = { runAllChecks: async () => ({ success: false, error: 'Quality checker initialization failed' }) };
      if (!this.packageCoordinator) this.packageCoordinator = { initialize: async () => ({ success: false, error: 'Package coordinator initialization failed' }) };
    }
    
    // Options
    this.options = {
      verbose: false,
      skipTests: false,
      skipBuild: false,
      skipDeploy: false,
      skipPr: false,
      ...options
    };
    
    // Track workflow steps for reporting
    this.workflowSteps = [];
    
    // Track warnings separately
    this.workflowWarnings = [];
    
    // Initialize preview URLs
    this.previewUrls = null;
    
    // Set verbose mode
    if (this.logger && this.logger.setVerbose) {
      this.logger.setVerbose(this.options.verbose);
    }
  }

  /**
   * Record a workflow step for the dashboard
   * @param {string} name - Step name
   * @param {string} phase - Phase (Setup, Validation, Build, Deploy, Results)
   * @param {boolean} success - Whether step succeeded
   * @param {number} duration - Duration in milliseconds
   * @param {string} [error] - Error message if any
   */
  recordWorkflowStep(name, phase, success, duration, error = null) {
    const step = {
      name,
      phase,
      result: { success },
      duration,
      timestamp: new Date().toISOString()
    };
    
    if (error) {
      step.error = error;
      // Also record error as a warning to ensure it shows in the timeline
      this.recordWarning(error, phase, name);
    }
    
    this.workflowSteps.push(step);
    
    if (this.options.verbose) {
      this.logger.debug(`Recorded step: ${name} (${phase}) - ${success ? 'Success' : 'Failed'} - ${duration}ms`);
    }
  }
  
  /**
   * Record a warning for the dashboard
   * @param {string} message - Warning message
   * @param {string} phase - Phase (Setup, Validation, Build, Deploy, Results)
   * @param {string} [step] - Step name
   */
  recordWarning(message, phase, step = null) {
    // Skip empty warnings
    if (!message) return;
    
    // Normalize message in case it's an object
    const warningMessage = typeof message === 'object' 
      ? (message.message || JSON.stringify(message))
      : message;
    
    const warning = {
      message: warningMessage,
      phase,
      step,
      timestamp: new Date().toISOString()
    };
    
    // Prevent duplicate warnings
    const existingWarningIndex = this.workflowWarnings.findIndex(w => 
      w.message === warningMessage && 
      w.phase === phase && 
      w.step === step
    );
    
    if (existingWarningIndex === -1) {
      this.workflowWarnings.push(warning);
      
      // Log the warning to the console if verbose
      if (this.options.verbose) {
        this.logger.debug(`Recorded warning: ${warningMessage} (${phase}${step ? ` - ${step}` : ''})`);
      }
    }
  }

  /**
   * Main workflow execution method
   */
  async run() {
    try {
      // Clean up state from previous runs to prevent showing old errors in reports
      cleanupPreviousRuns();
      
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
      
      // Keep the output clean - just show the essential information
      this.logger.info('\n');
      
      // Show only the most important information: the preview URLs
      if (this.previewUrls && this.previewUrls.hours && this.previewUrls.admin) {
        this.logger.info(styled.bold(`${colors.green}✨ Preview URLs${colors.reset}`));
        this.logger.info(`Hours App: ${this.previewUrls.hours}`);
        this.logger.info(`Admin App: ${this.previewUrls.admin}`);
      }
      
      this.logger.info(styled.bold(`${colors.green}✨ Dashboard opened in your browser${colors.reset}`));
      
      // Just show warning count, details will be in dashboard
      if (this.workflowWarnings && this.workflowWarnings.length > 0) {
        this.logger.info(`${this.workflowWarnings.length} items to review in dashboard`);
      }
      
      // Give the user time to view the dashboard (3 seconds)
      await setTimeout(3000);
      
      // Now that the user has seen the dashboard, ask about branch management
      await this.handleBranchOptions();
      
      process.exit(0);
    } catch (error) {
      // Save performance metrics even if there was an error
      performanceMonitor.end();
      
      this.progressTracker.finishProgress(false, styled.error('Workflow failed: ' + error.message));
      
      // Minimal error output - details should be in dashboard
      this.logger.error('\n🔴 Workflow Failed');
      this.logger.error(`Check dashboard for complete details`);
      
      // Only show stack trace in verbose mode
      if (this.options.verbose && error.stack) {
        this.logger.error('\nStack Trace:');
        this.logger.error(error.stack);
      }
      
      // Try to generate a minimal dashboard with the error info
      try {
        if (this.workflowSteps && this.workflowSteps.length > 0) {
          const failureReport = await generateReport({
            timestamp: new Date().toISOString(),
            preview: this.previewUrls,
            workflow: {
              options: this.options,
              git: {
                branch: await getCurrentBranch(),
              },
              steps: this.workflowSteps
            },
            warnings: this.workflowWarnings || [],
            errors: [{ message: error.message, stack: error.stack }]
          });
          this.logger.info('Error dashboard generated - check your browser');
        }
      } catch (e) {
        // If dashboard generation fails, provide minimal troubleshooting info
        this.logger.info('\n▶ Troubleshooting:');
        this.logger.info('• Try running with --verbose flag for more details');
        this.logger.info('• Check the logs in temp/logs/ for complete information');
        
        // Show preview URLs if available (might be useful even if other parts failed)
        if (this.previewUrls) {
          this.logger.info('\nPreview URLs:');
          this.logger.info(`Hours App: ${this.previewUrls.hours || 'Not available'}`);
          this.logger.info(`Admin App: ${this.previewUrls.admin || 'Not available'}`);
        }
      }
      
      process.exit(1);
    }
  }

  /**
   * Setup Phase
   */
  async setup() {
    this.progressTracker.startStep('Setup Phase');
    this.logger.sectionHeader('Initializing Development Environment');
    const phaseStartTime = Date.now();
    
    try {
      // Verify Git setup
      const gitStartTime = Date.now();
      this.logger.info('Checking Git configuration...');
      const gitUserResult = await this.commandRunner.runCommandAsync('git config --get user.name', { stdio: 'pipe' });
      const gitEmailResult = await this.commandRunner.runCommandAsync('git config --get user.email', { stdio: 'pipe' });
      
      if (!gitUserResult.success || !gitEmailResult.success) {
        const error = 'Git user name or email not configured. Please run "git config --global user.name" and "git config --global user.email"';
        this.recordWorkflowStep('Git Configuration Check', 'Setup', false, Date.now() - gitStartTime, error);
        throw new Error(error);
      }
      
      const gitUserName = gitUserResult.output.trim();
      const gitUserEmail = gitEmailResult.output.trim();
      
      this.logger.success(`✓ Git configuration verified`);
      this.logger.info(`User: ${gitUserName} <${gitUserEmail}>`);
      this.recordWorkflowStep('Git Configuration Check', 'Setup', true, Date.now() - gitStartTime);
      
      // Verify Firebase auth
      const firebaseStartTime = Date.now();
      this.logger.info('Checking Firebase CLI authentication...');
      const firebaseResult = await this.commandRunner.runCommandAsync('firebase login:list', { stdio: 'pipe' });
      
      if (!firebaseResult.success) {
        const error = 'Firebase CLI not authenticated. Please run "firebase login" first.';
        this.recordWorkflowStep('Firebase Authentication', 'Setup', false, Date.now() - firebaseStartTime, error);
        throw new Error(error);
      }
      
      if (firebaseResult.output.includes('No users')) {
        const warning = 'Firebase CLI authenticated but no user found in the output. This might cause issues.';
        this.recordWarning(warning, 'Setup', 'Firebase Authentication');
      }
      
      // Extract user email from the output
      const emailMatch = firebaseResult.output.match(/\[(.*?)\]/);
      const firebaseUserEmail = emailMatch ? emailMatch[1] : 'Unknown';
      this.logger.success(`✓ Firebase authenticated as: ${firebaseUserEmail}`);
      this.recordWorkflowStep('Firebase Authentication', 'Setup', true, Date.now() - firebaseStartTime);
      
      // Verify dependencies
      const depsStartTime = Date.now();
      this.logger.info('Verifying dependencies...');
      const pnpmResult = await this.commandRunner.runCommandAsync('pnpm -v', { stdio: 'pipe' });
      if (!pnpmResult.success) {
        const error = 'pnpm not found. Please install pnpm: npm install -g pnpm';
        this.recordWorkflowStep('Dependency Check', 'Setup', false, Date.now() - depsStartTime, error);
        throw new Error(error);
      }
      this.logger.success(`✓ Dependencies verified`);
      this.recordWorkflowStep('Dependency Check', 'Setup', true, Date.now() - depsStartTime);

      this.progressTracker.completeStep(true, 'Environment setup complete');
      this.recordWorkflowStep('Setup Phase', 'Setup', true, Date.now() - phaseStartTime);
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
      
      this.recordWorkflowStep('Setup Phase', 'Setup', false, Date.now() - phaseStartTime, error.message);
      throw error;
    }
  }

  /**
   * Validation Phase
   */
  async validate() {
    this.progressTracker.startStep('Validation Phase');
    this.logger.sectionHeader('Validating Code Quality');
    const phaseStartTime = Date.now();
    
    try {
      // Initialize package coordinator to get build order
      const packageStartTime = Date.now();
      this.logger.info('Analyzing package dependencies...');
      const packageResult = await this.packageCoordinator.initialize();
      if (!packageResult.success) {
        const error = `Package analysis failed: ${packageResult.error}`;
        this.recordWorkflowStep('Package Analysis', 'Validation', false, Date.now() - packageStartTime, error);
        throw new Error(error);
      }
      
      // Record warnings from package analysis
      if (packageResult.warnings && packageResult.warnings.length > 0) {
        packageResult.warnings.forEach(warning => {
          this.recordWarning(warning, 'Validation', 'Package Analysis');
        });
      }
      
      this.recordWorkflowStep('Package Analysis', 'Validation', true, Date.now() - packageStartTime);
      
      // Skip quality checks if requested
      if (this.options.skipTests) {
        this.logger.warn('Skipping quality checks due to --skip-tests flag');
        this.progressTracker.completeStep(true, 'Quality checks skipped');
        this.recordWorkflowStep('Quality Checks', 'Validation', true, 0, 'Skipped');
        this.recordWorkflowStep('Validation Phase', 'Validation', true, Date.now() - phaseStartTime);
        return;
      }
      
      // Run all quality checks
      const qualityStartTime = Date.now();
      this.logger.info('Running quality checks...');
      
      try {
        const checkResult = await this.qualityChecker.runAllChecks();
        
        if (!checkResult.success) {
          // If we get here, quality checks failed but aren't critical enough to stop the workflow
          this.logger.warn('Quality checks finished with warnings or errors');
          this.logger.warn(checkResult.error || 'See dashboard for details');
          this.recordWorkflowStep('Quality Checks', 'Validation', false, Date.now() - qualityStartTime, checkResult.error || 'Quality checks had warnings or errors');
        } else {
          this.logger.success('✓ All quality checks passed');
          this.recordWorkflowStep('Quality Checks', 'Validation', true, Date.now() - qualityStartTime);
        }
        
        // Record all quality check warnings
        if (checkResult.warnings && checkResult.warnings.length > 0) {
          checkResult.warnings.forEach(warning => {
            this.recordWarning(warning, 'Validation', 'Quality Checks');
          });
        }
        
        // Specific warnings for different quality checks
        if (checkResult.results) {
          if (checkResult.results.linting && !checkResult.results.linting.success) {
            this.recordWarning('Linting issues detected', 'Validation', 'Quality Checks');
          }
          
          if (checkResult.results.typeChecking && !checkResult.results.typeChecking.success) {
            this.recordWarning('TypeScript errors detected', 'Validation', 'Quality Checks');
          }
          
          if (checkResult.results.testing && !checkResult.results.testing.success) {
            this.recordWarning('Test failures detected', 'Validation', 'Quality Checks');
          }
        }
      } catch (error) {
        // Handle quality checker errors - don't fail the whole workflow
        this.logger.warn(`Quality checker error: ${error.message}`);
        this.recordWarning(`Quality check error: ${error.message}`, 'Validation', 'Quality Checks');
        this.recordWorkflowStep('Quality Checks', 'Validation', false, Date.now() - qualityStartTime, `Error: ${error.message}`);
      }
      
      this.progressTracker.completeStep(true, 'Validation complete');
      this.recordWorkflowStep('Validation Phase', 'Validation', true, Date.now() - phaseStartTime);
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
      
      this.recordWorkflowStep('Validation Phase', 'Validation', false, Date.now() - phaseStartTime, error.message);
      throw error;
    }
  }

  /**
   * Build Phase
   */
  async build() {
    this.progressTracker.startStep('Build Phase');
    this.logger.sectionHeader('Building Application');
    const phaseStartTime = Date.now();
    
    try {
      // Skip build if requested
      if (this.options.skipBuild) {
        this.logger.warn('Skipping build due to --skip-build flag');
        this.progressTracker.completeStep(true, 'Build skipped');
        this.recordWorkflowStep('Package Build', 'Build', true, 0, 'Skipped');
        this.recordWorkflowStep('Build Phase', 'Build', true, Date.now() - phaseStartTime);
        return;
      }
      
      // Run build
      const buildStartTime = Date.now();
      this.logger.info('Building packages...');
      const buildResult = await this.commandRunner.runCommandAsync('pnpm build', { 
        stdio: 'pipe',
        captureOutput: true
      });
      
      if (!buildResult.success) {
        const error = new Error('Build failed');
        Object.assign(error, {
          output: buildResult.output,
          error: buildResult.error
        });
        this.recordWorkflowStep('Package Build', 'Build', false, Date.now() - buildStartTime, 'Build command failed');
        throw error;
      }
      
      // Check for warnings in the build output
      if (buildResult.output && buildResult.output.includes('warning')) {
        // Extract warnings from output
        const lines = buildResult.output.split('\n');
        const warningLines = lines.filter(line => 
          line.toLowerCase().includes('warning') || 
          line.toLowerCase().includes('warn')
        );
        
        warningLines.forEach(warning => {
          this.recordWarning(warning.trim(), 'Build', 'Package Build');
        });
      }
      
      this.logger.success('✓ Build completed successfully');
      this.recordWorkflowStep('Package Build', 'Build', true, Date.now() - buildStartTime);
      this.progressTracker.completeStep(true, 'Build complete');
      this.recordWorkflowStep('Build Phase', 'Build', true, Date.now() - phaseStartTime);
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
      
      this.recordWorkflowStep('Build Phase', 'Build', false, Date.now() - phaseStartTime, error.message);
      throw error;
    }
  }

  /**
   * Deploy Phase
   */
  async deploy() {
    this.progressTracker.startStep('Deploy Phase');
    this.logger.sectionHeader('Deploying to Preview Environment');
    const phaseStartTime = Date.now();
    
    try {
      // Skip deployment if requested
      if (this.options.skipDeploy) {
        this.logger.warn('Skipping deployment due to --skip-deploy flag');
        this.progressTracker.completeStep(true, 'Deployment skipped');
        this.recordWorkflowStep('Deploy Hours App', 'Deploy', true, 0, 'Skipped');
        this.recordWorkflowStep('Deploy Admin App', 'Deploy', true, 0, 'Skipped');
        this.recordWorkflowStep('Deploy Phase', 'Deploy', true, Date.now() - phaseStartTime);
        return;
      }
      
      // Create a unique channel ID for the preview
      const channelStartTime = Date.now();
      const channelId = await createChannelId();
      this.recordWorkflowStep('Create Channel ID', 'Deploy', true, Date.now() - channelStartTime);
      
      // Deploy hours app
      const hoursStartTime = Date.now();
      this.logger.info(`Deploying hours app to channel: ${channelId}...`);
      const hoursResult = await deployPackage({
        target: 'hours',
        channelId
      });
      
      if (!hoursResult.success) {
        const error = new Error('Hours app deployment failed');
        Object.assign(error, {
          details: hoursResult.error || 'Unknown deployment error',
          logs: hoursResult.logs
        });
        this.recordWorkflowStep('Deploy Hours App', 'Deploy', false, Date.now() - hoursStartTime, 'Hours app deployment failed');
        throw error;
      }
      
      // Check for warnings in hours deployment
      if (hoursResult.warnings && hoursResult.warnings.length > 0) {
        hoursResult.warnings.forEach(warning => {
          this.recordWarning(warning, 'Deploy', 'Deploy Hours App');
        });
      }
      
      this.logger.success(`✓ Hours app deployed to: ${hoursResult.url}`);
      this.recordWorkflowStep('Deploy Hours App', 'Deploy', true, Date.now() - hoursStartTime);
      
      // Deploy admin app
      const adminStartTime = Date.now();
      this.logger.info(`Deploying admin app to channel: ${channelId}...`);
      const adminResult = await deployPackage({
        target: 'admin',
        channelId
      });
      
      if (!adminResult.success) {
        const error = new Error('Admin app deployment failed');
        Object.assign(error, {
          details: adminResult.error || 'Unknown deployment error',
          logs: adminResult.logs
        });
        this.recordWorkflowStep('Deploy Admin App', 'Deploy', false, Date.now() - adminStartTime, 'Admin app deployment failed');
        throw error;
      }
      
      // Check for warnings in admin deployment
      if (adminResult.warnings && adminResult.warnings.length > 0) {
        adminResult.warnings.forEach(warning => {
          this.recordWarning(warning, 'Deploy', 'Deploy Admin App');
        });
      }
      
      this.logger.success(`✓ Admin app deployed to: ${adminResult.url}`);
      this.recordWorkflowStep('Deploy Admin App', 'Deploy', true, Date.now() - adminStartTime);
      
      // Save URLs for display in results
      this.previewUrls = {
        hours: hoursResult.url,
        admin: adminResult.url,
        channelId
      };
      
      this.logger.success('✓ Deployment completed successfully');
      this.progressTracker.completeStep(true, 'Deployment complete');
      this.recordWorkflowStep('Deploy Phase', 'Deploy', true, Date.now() - phaseStartTime);
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
      
      this.recordWorkflowStep('Deploy Phase', 'Deploy', false, Date.now() - phaseStartTime, error.message);
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
    const phaseStartTime = Date.now();
    
    try {
      // Clean up old preview channels
      const cleanupStartTime = Date.now();
      this.logger.info('Cleaning up old preview channels...');
      try {
        const cleanupResult = await cleanupChannels();
        
        // Just show a simple success message in terminal
        if (cleanupResult.cleaned > 0) {
          this.logger.success(`✓ Cleaned up ${cleanupResult.cleaned} old channels`);
        } else {
          this.logger.info('No channels needed cleanup');
        }
        
        // Record for dashboard
        this.recordWorkflowStep('Channel Cleanup', 'Results', true, Date.now() - cleanupStartTime);
      } catch (error) {
        // Minimal error info in terminal
        this.logger.warn('Channel cleanup had issues (not critical)');
        
        // Record for dashboard
        this.recordWarning(`Failed to cleanup channels: ${error.message}`, 'Results', 'Channel Cleanup');
        this.recordWorkflowStep('Channel Cleanup', 'Results', false, Date.now() - cleanupStartTime, 'Cleanup issue');
      }
      
      // Create report data - include all warnings collected throughout the workflow
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
          },
          steps: this.workflowSteps
        },
        warnings: this.workflowWarnings
      };
      
      // Generate consolidated report
      const reportStartTime = Date.now();
      this.logger.info('Generating workflow report...');
      
      let report;
      try {
        report = await generateReport(reportData);
        this.recordWorkflowStep('Generate Dashboard', 'Results', true, Date.now() - reportStartTime);
        this.logger.success('✓ Workflow report generated');
      } catch (error) {
        this.logger.error(`Dashboard generation error: ${error.message}`);
        this.recordWorkflowStep('Generate Dashboard', 'Results', false, Date.now() - reportStartTime, error.message);
        this.recordWarning(`Failed to generate dashboard: ${error.message}`, 'Results', 'Generate Dashboard');
        
        // Create a fallback report
        report = {
          ...reportData,
          error: error.message
        };
      }
      
      // Display preview URLs
      if (this.previewUrls) {
        this.logger.info('\nPreview URLs:');
        this.logger.info(`Hours App: ${this.previewUrls.hours || 'Not available'}`);
        this.logger.info(`Admin App: ${this.previewUrls.admin || 'Not available'}`);
      }
      
      // Don't show warnings in console, just mention to check dashboard
      if (this.workflowWarnings && this.workflowWarnings.length > 0) {
        // Categorize warnings
        const warningsByCategory = {};
        this.workflowWarnings.forEach(warning => {
          const category = warning.phase || 'General';
          if (!warningsByCategory[category]) {
            warningsByCategory[category] = [];
          }
          warningsByCategory[category].push(warning);
        });
        
        // Just show counts by category 
        this.logger.info('\nWarnings and suggestions: (see dashboard for details)');
        Object.entries(warningsByCategory).forEach(([category, warnings]) => {
          this.logger.info(`• ${category}: ${warnings.length} items`);
        });
      }
      
      this.progressTracker.completeStep(true, 'Results generated');
      this.recordWorkflowStep('Results Phase', 'Results', true, Date.now() - phaseStartTime);
      
      // The dashboard is already opened by the generateReport function
      return report;
    } catch (error) {
      this.logger.error(`Results generation failed: ${error.message}`);
      this.progressTracker.completeStep(false, `Results generation failed: ${error.message}`);
      
      // Enhanced error logging - but minimal in console
      this.logger.error('\nResults Phase Failed');
      this.logger.error(`Please check the dashboard for complete details`);
      
      this.recordWorkflowStep('Results Phase', 'Results', false, Date.now() - phaseStartTime, error.message);
      
      // Try to create a minimal dashboard with the error info
      try {
        const failureReport = await generateReport({
          timestamp: new Date().toISOString(),
          preview: this.previewUrls,
          workflow: {
            options: this.options,
            git: {
              branch: await getCurrentBranch(),
            },
            steps: this.workflowSteps
          },
          warnings: this.workflowWarnings || [],
          errors: [{ message: error.message, stack: error.stack }]
        });
        this.logger.info('Error dashboard generated - check your browser');
      } catch (e) {
        // Only show preview URLs if dashboard generation fails completely
        if (this.previewUrls) {
          this.logger.info('\nPreview URLs:');
          this.logger.info(`Hours App: ${this.previewUrls.hours || 'Not available'}`);
          this.logger.info(`Admin App: ${this.previewUrls.admin || 'Not available'}`);
        }
      }
      
      return {
        error: error.message,
        timestamp: new Date().toISOString(),
        previewUrls: this.previewUrls,
        workflow: {
          steps: this.workflowSteps,
          warnings: this.workflowWarnings
        }
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