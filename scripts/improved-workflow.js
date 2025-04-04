#!/usr/bin/env node

/* global process */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { logger } from './core/logger.js';
import { commandRunner } from './core/command-runner.js';
import { getCurrentBranch, hasUncommittedChanges, commitChanges } from './workflow/branch-manager.js';
import { QualityChecker } from './checks/quality-checker.js';
import { PackageCoordinator } from './workflow/package-coordinator.js';
import { deployPackage, createChannelId, deployPackageWithWorkflowIntegration } from './workflow/deployment-manager.js';
import progressTracker from './core/progress-tracker.js';
import { colors, styled } from './core/colors.js';
import { generateReport } from './workflow/consolidated-report.js';
import { performanceMonitor } from './core/performance-monitor.js';
import { setTimeout } from 'timers/promises';
import { cleanupChannels } from './firebase/channel-cleanup.js';
import { runAllAdvancedChecks, runSingleCheckWithWorkflowIntegration } from './workflow/advanced-checker.js';
import { verifyAllAuth } from './auth/auth-manager.js';
import { createPR } from './github/pr-manager.js';
import getWorkflowState from './workflow/workflow-state.js';
import { execSync } from 'child_process';

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
      // New options for advanced checks
      skipBundleCheck: false,
      skipDeadCodeCheck: false,
      skipDocsCheck: false,
      skipDocsFreshnessCheck: false,
      skipWorkflowValidation: false,
      skipHealthCheck: false,
      skipAdvancedChecks: false,
      ...options
    };
    
    // Track workflow steps for reporting
    this.workflowSteps = [];
    
    // Track warnings separately
    this.workflowWarnings = [];
    
    // Initialize preview URLs
    this.previewUrls = null;
    
    // Initialize advanced check results
    this.advancedCheckResults = null;
    
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
      const _reportPath = await this.generateResults();
      
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
      
      // Show a summary of warnings by category
      if (this.workflowWarnings && this.workflowWarnings.length > 0) {
        // Group warnings by phase/category
        const warningsByCategory = {};
        this.workflowWarnings.forEach(warning => {
          const category = warning.phase || 'General';
          if (!warningsByCategory[category]) {
            warningsByCategory[category] = [];
          }
          warningsByCategory[category].push(warning);
        });
        
        this.logger.info(styled.bold(`\n${colors.yellow}⚠️ Warnings Summary (${this.workflowWarnings.length} total)${colors.reset}`));
        
        // Show counts by category
        Object.entries(warningsByCategory).forEach(([category, warnings]) => {
          this.logger.info(`${category}: ${warnings.length} items`);
        });
        
        // Show the first 3 warnings as examples
        if (this.workflowWarnings.length > 0) {
          this.logger.info('\nWarning examples:');
          this.workflowWarnings.slice(0, 3).forEach(warning => {
            // Truncate long messages
            const shortMessage = warning.message.length > 80 
              ? warning.message.substring(0, 80) + '...' 
              : warning.message;
            this.logger.info(`- ${shortMessage}`);
          });
          
          if (this.workflowWarnings.length > 3) {
            this.logger.info(`...and ${this.workflowWarnings.length - 3} more (see dashboard for full details)`);
          }
        }
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
      // Verify Authentication
      const authStartTime = Date.now();
      this.logger.info('Verifying authentication status...');
      try {
        const authResult = await verifyAllAuth({
          requireFirebase: true,
          requireGit: true,
          useCache: false // Force fresh check
        });
        
        if (!authResult.success) {
          const error = `Authentication failed: ${authResult.errors.join(', ')}`;
          this.recordWorkflowStep('Authentication', 'Setup', false, Date.now() - authStartTime, error);
          throw new Error(error);
        }
        
        // Get authentication details from result
        let authDetails = [];
        
        if (authResult.services.firebase?.authenticated) {
          const firebaseEmail = authResult.services.firebase.email || 'Unknown';
          authDetails.push(`Firebase: ${firebaseEmail}`);
        }
        
        if (authResult.services.git?.authenticated) {
          const gitUser = authResult.services.git.username || 'Unknown';
          authDetails.push(`Git: ${gitUser}`);
        }
        
        const authDetailsText = authDetails.length ? ` (${authDetails.join(', ')})` : '';
        this.logger.success(`✓ Authentication verified${authDetailsText}`);
        this.recordWorkflowStep('Authentication', 'Setup', true, Date.now() - authStartTime);
      } catch (error) {
        const errorMsg = `Authentication verification failed: ${error.message}`;
        this.recordWorkflowStep('Authentication', 'Setup', false, Date.now() - authStartTime, errorMsg);
        throw new Error(errorMsg);
      }
      
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
        // Core quality checks (lint, type check, tests)
        const checkResult = await this.qualityChecker.runAllChecks();
        
        // Record all quality check warnings
        if (checkResult.warnings && checkResult.warnings.length > 0) {
          checkResult.warnings.forEach(warning => {
            this.recordWarning(warning, 'Validation', 'Quality Checks');
          });
        }
        
        // Run advanced checks with more detailed analysis
        this.logger.info("Running advanced checks...");
        
        try {
          // Run all advanced checks for backward compatibility
          const advancedResult = await runAllAdvancedChecks({
            // (keep existing options)
            skipAdvancedChecks: this.options.skipAdvancedChecks,
            skipBundleCheck: this.options.skipBundleCheck || false,
            skipDocsCheck: this.options.skipDocsCheck || false,
            skipDocsFreshnessCheck: this.options.skipDocsFreshnessCheck || false,
            skipDeadCodeCheck: this.options.skipDeadCodeCheck || false,
            skipTypeCheck: this.options.skipTests,
            skipLintCheck: this.options.skipTests,
            skipWorkflowValidation: this.options.skipWorkflowValidation || false,
            skipHealthCheck: this.options.skipHealthCheck || false,
            ignoreAdvancedFailures: true,
            verbose: this.options.verbose,
            treatLintAsWarning: true,
            treatHealthAsWarning: true,
            silentMode: true,
            promptFn: null,
            timeout: {
              docsFreshness: 30000,
              docsQuality: 30000,
              bundleSize: 60000,
              deadCode: 45000,
              typeCheck: 45000,
              lint: 45000,
              workflowValidation: 30000,
              health: 60000
            }
          });
          
          // Additionally run TypeScript check with workflow integration
          if (!this.options.skipTests && !this.options.skipAdvancedChecks) {
            this.logger.info("Running TypeScript validation with workflow integration...");
            
            // This will automatically update workflow state
            const tsCheckResult = await runSingleCheckWithWorkflowIntegration('typescript', {
              timeout: { typescript: 45000 },
              silentMode: true,
              phase: 'Validation'
            });
            
            // Store the result for the dashboard
            this.advancedCheckResults = {
              ...this.advancedCheckResults,
              typescript: tsCheckResult
            };
          }
          
          // Store advanced check results for the dashboard
          this.advancedCheckResults = advancedResult.results || {};
          
          // Record all warnings from advanced checks
          if (advancedResult.warnings && advancedResult.warnings.length > 0) {
            advancedResult.warnings.forEach(warning => {
              this.recordWarning(warning, 'Validation', 'Advanced Checks');
            });
          }
          
          // Process documentation quality results
          if (this.advancedCheckResults.docsQuality && 
              this.advancedCheckResults.docsQuality.data && 
              this.advancedCheckResults.docsQuality.data.issues) {
            const issues = this.advancedCheckResults.docsQuality.data.issues;
            issues.forEach(issue => {
              this.recordWarning(
                `Documentation issue: ${issue.message} (${issue.file})`, 
                'Validation', 
                'Documentation'
              );
            });
          }
          
          // Process documentation freshness results
          if (this.advancedCheckResults.docsFreshness && 
              this.advancedCheckResults.docsFreshness.data && 
              this.advancedCheckResults.docsFreshness.data.staleDocuments) {
            const staleDocuments = this.advancedCheckResults.docsFreshness.data.staleDocuments;
            staleDocuments.forEach(doc => {
              this.recordWarning(
                `Stale documentation: ${doc.file} (last updated ${doc.lastUpdated})`, 
                'Validation', 
                'Documentation'
              );
            });
          }
          
          // Process security information
          if (this.advancedCheckResults.health && 
              this.advancedCheckResults.health.data && 
              this.advancedCheckResults.health.data.stats && 
              this.advancedCheckResults.health.data.stats.security) {
            const security = this.advancedCheckResults.health.data.stats.security;
            
            if (security.vulnerabilities && security.vulnerabilities.details) {
              security.vulnerabilities.details.forEach(vuln => {
                this.recordWarning(
                  `Security vulnerability: ${vuln.package} (${vuln.severity}) - ${vuln.description}`, 
                  'Validation', 
                  'Security'
                );
              });
            }
            
            if (security.issues) {
              security.issues.forEach(issue => {
                this.recordWarning(
                  `Security issue: ${issue.message}`, 
                  'Validation', 
                  'Security'
                );
              });
            }
          }
          
          // Process code quality issues from lint and TypeScript checks
          if (this.advancedCheckResults.lint && 
              this.advancedCheckResults.lint.data && 
              this.advancedCheckResults.lint.data.issues) {
            const lintIssues = this.advancedCheckResults.lint.data.issues;
            lintIssues.forEach(issue => {
              this.recordWarning(
                `Lint issue: ${issue.message} (${issue.file}:${issue.line})`, 
                'Validation', 
                'Code Quality'
              );
            });
          }
          
          if (this.advancedCheckResults.typescript && 
              this.advancedCheckResults.typescript.data && 
              this.advancedCheckResults.typescript.data.errors) {
            const tsIssues = this.advancedCheckResults.typescript.data.errors;
            tsIssues.forEach(issue => {
              this.recordWarning(
                `TypeScript issue: ${issue.message} (${issue.file}:${issue.line})`, 
                'Validation', 
                'Code Quality'
              );
            });
          }
          
          // Process dead code results
          if (this.advancedCheckResults.deadCode && 
              this.advancedCheckResults.deadCode.data && 
              this.advancedCheckResults.deadCode.data.files) {
            const deadCodeFiles = this.advancedCheckResults.deadCode.data.files;
            deadCodeFiles.forEach(file => {
              this.recordWarning(
                `Potentially unused code in ${file.path} (confidence: ${file.confidence}%)`, 
                'Validation', 
                'Code Quality'
              );
            });
          }
          
          // Process bundle size issues
          if (this.advancedCheckResults.bundleSize && 
              this.advancedCheckResults.bundleSize.data && 
              this.advancedCheckResults.bundleSize.data.issues) {
            const bundleIssues = this.advancedCheckResults.bundleSize.data.issues;
            bundleIssues.forEach(issue => {
              this.recordWarning(
                `Bundle size issue: ${issue.message}`, 
                'Validation', 
                'Code Quality'
              );
            });
          }
          
          // Record advanced check step
          this.recordWorkflowStep(
            'Advanced Checks', 
            'Validation', 
            true, 
            performanceMonitor.measure('advancedChecks')
          );
          
          // Determine overall quality check status based on the primary checker (not the additional ones)
          if (!checkResult.success) {
            // If we get here, quality checks failed but aren't critical enough to stop the workflow
            this.logger.warn('Quality checks finished with warnings or errors');
            this.logger.warn(checkResult.error || 'See dashboard for details');
            this.recordWorkflowStep('Quality Checks', 'Validation', false, Date.now() - qualityStartTime, checkResult.error || 'Quality checks had warnings or errors');
          } else {
            this.logger.success('✓ All quality checks passed');
            this.recordWorkflowStep('Quality Checks', 'Validation', true, Date.now() - qualityStartTime);
          }
          
          // Log warning count for the dashboard
          const warningCount = this.workflowWarnings.length;
          if (warningCount > 0) {
            this.logger.info(`Collected ${warningCount} warnings - details will be shown in dashboard`);
          }
        } catch (error) {
          this.logger.error(`Advanced checks failed: ${error.message}`);
          this.recordWarning(`Advanced checks error: ${error.message}`, 'Validation', 'Advanced Checks');
          this.recordWorkflowStep('Advanced Checks', 'Validation', false, performanceMonitor.measure('advancedChecks'), `Error: ${error.message}`);
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
    
    // Skip build if requested
    if (this.options.skipBuild) {
      this.logger.warn('Skipping build due to --skip-build flag');
      this.progressTracker.completeStep(true, 'Build skipped');
      this.recordWorkflowStep('Package Build', 'Build', true, 0, 'Skipped');
      this.recordWorkflowStep('Build Phase', 'Build', true, Date.now() - phaseStartTime);
      return;
    }
    
    try {
      // Clean dist directories first to ensure we have a fresh build
      this.logger.info('Cleaning previous build artifacts...');
      
      // Use platform-specific command for cleaning
      const isWindows = process.platform === 'win32';
      const cleanCommand = isWindows 
        ? 'if exist packages\\admin\\dist rmdir /s /q packages\\admin\\dist && if exist packages\\hours\\dist rmdir /s /q packages\\hours\\dist && if exist packages\\common\\dist rmdir /s /q packages\\common\\dist'
        : 'rm -rf packages/admin/dist packages/hours/dist packages/common/dist';
      
      await this.commandRunner.runCommandAsync(cleanCommand, {
        ignoreError: true, // Don't fail if directories don't exist
        shell: true
      });
      
      // Run build
      const buildStartTime = Date.now();
      this.logger.info('Building packages...');
      
      // Use build:all instead of build to ensure proper sequential building
      const buildResult = await this.commandRunner.runCommandAsync('pnpm run build:all', {
        stdio: 'pipe', // Capture output for warning detection
        timeout: 300000 // 5 minutes timeout for build
      });
      
      if (!buildResult.success) {
        const error = new Error('Build failed');
        error.details = {
          output: buildResult.output,
          error: buildResult.error
        };
        this.recordWorkflowStep('Package Build', 'Build', false, Date.now() - buildStartTime, 'Build command failed');
        throw error;
      }
      
      // Get root directory
      const rootDir = process.cwd();
      
      // Verify that build artifacts exist
      const adminDistPath = join(rootDir, 'packages/admin/dist');
      const hoursDistPath = join(rootDir, 'packages/hours/dist');
      
      if (!fs.existsSync(adminDistPath) || !fs.existsSync(hoursDistPath)) {
        this.logger.error('Build artifacts not found after build process');
        const error = new Error('Build verification failed');
        this.recordWorkflowStep('Package Build', 'Build', false, Date.now() - buildStartTime, 'Build verification failed');
        throw error;
      }
      
      // Check for warnings in the build output
      if (buildResult.output && buildResult.output.includes('warning')) {
        // Extract meaningful warnings
        const lines = buildResult.output.split('\n');
        for (const line of lines) {
          if (line.toLowerCase().includes('warning') && !line.includes('TypeScript which is not officially supported')) {
            // Skip TypeScript version warnings
            const warning = line.trim();
            this.recordWarning(warning.trim(), 'Build', 'Package Build');
          }
        }
      }
      
      this.logger.success('✓ Build completed successfully');
      this.recordWorkflowStep('Package Build', 'Build', true, Date.now() - buildStartTime);
      this.progressTracker.completeStep(true, 'Build complete');
      this.recordWorkflowStep('Build Phase', 'Build', true, Date.now() - phaseStartTime);
    } catch (error) {
      this.progressTracker.completeStep(false, `Build failed: ${error.message}`);
      
      // Enhanced error logging for build failures
      this.logger.error('\nBuild Phase Failed:');
      this.logger.error(`${error.message}`);
      
      // Show the output if available
      if (error.details && error.details.output) {
        this.logger.error('\nBuild Output:');
        this.logger.error(error.details.output);
      }
      
      if (error.details && error.details.error) {
        this.logger.error('\nBuild Errors:');
        this.logger.error(error.details.error);
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
      
      // Use the new workflow-integrated deployment function
      // which handles hours and admin app deployments together
      this.logger.info(`Deploying apps to channel: ${channelId}...`);
      const deployResult = await deployPackageWithWorkflowIntegration({
        channelId,
        skipBuild: this.options.skipBuild,
        phase: 'Deploy'
      });
      
      if (!deployResult.success) {
        const error = new Error('Deployment failed');
        Object.assign(error, {
          details: deployResult.error || 'Unknown deployment error'
        });
        throw error;
      }
      
      // Store the preview URLs for the dashboard
      if (deployResult.urls) {
        this.previewUrls = deployResult.urls;
        
        if (this.previewUrls.hours) {
          this.logger.success(`✓ Hours app deployed to: ${this.previewUrls.hours}`);
        }
        
        if (this.previewUrls.admin) {
          this.logger.success(`✓ Admin app deployed to: ${this.previewUrls.admin}`);
        }
      }
      
      this.progressTracker.completeStep(true, 'Deployment complete');
      this.recordWorkflowStep('Deploy Phase', 'Deploy', true, Date.now() - phaseStartTime);
    } catch (error) {
      this.progressTracker.completeStep(false, `Deployment failed: ${error.message}`);
      
      // Enhanced error logging for deployment failures
      this.logger.error('\nDeploy Phase Failed:');
      this.logger.error(`${error.message}`);
      
      if (error.details) {
        this.logger.error('\nDeployment Error Details:');
        this.logger.error(error.details);
      }
      
      this.recordWorkflowStep('Deploy Phase', 'Deploy', false, Date.now() - phaseStartTime, error.message);
      throw error;
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
        warnings: this.workflowWarnings,
        // Include advanced check results in report data
        advancedChecks: this.advancedCheckResults
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
        const _failureReport = await generateReport({
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
          errors: [{ message: error.message, stack: error.stack }],
          advancedChecks: this.advancedCheckResults
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

  /**
   * Handle branch options after seeing preview
   */
  async handleBranchOptions() {
    try {
      const currentBranch = getCurrentBranch();
      if (!currentBranch) {
        throw new Error('Could not determine current branch');
      }

      // Show status of all uncommitted files
      logger.info('\nChecking git status:');
      await commandRunner.runCommand('git status --short', { stdio: 'inherit' });

      // Check for uncommitted changes
      if (hasUncommittedChanges()) {
        logger.info('\nYou have uncommitted changes.');
        
        const choice = await commandRunner.promptWorkflowOptions(
          'Would you like to commit these changes?',
          ['Yes, commit ALL changes', 'No, keep changes uncommitted']
        );

        if (choice === '1') {
          // Use execSync directly to avoid commandRunner null reference issues
          try {
            // Check git status before adding changes
            logger.info('Checking git status before adding changes...');
            const beforeStatus = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
            logger.info('Files to be added:');
            logger.info(beforeStatus);
            
            // Check for firebase-deploy.yml specifically
            if (beforeStatus.includes('firebase-deploy.yml')) {
              logger.info('firebase-deploy.yml is detected in git status');
            } else {
              logger.info('firebase-deploy.yml is NOT detected in git status');
            }
            
            logger.info('Adding all changes...');
            execSync('git add --all', { stdio: 'inherit' });
            
            // Check git status after adding changes
            const afterStatus = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
            logger.info('Files still uncommitted after git add --all:');
            logger.info(afterStatus);
            
            // Use the branch-manager's commitChanges function which now has all files staged
            const commitResult = await commitChanges(currentBranch, (prompt, defaultValue) => 
              commandRunner.promptText(prompt, defaultValue)
            );
            
            if (commitResult.pushed) {
              logger.success(`Changes pushed to branch: ${currentBranch}`);
              logger.info('GitHub Actions will run automatically on this push.');
              
              // Additional verification for GitHub Actions
              try {
                logger.info("\nVerifying GitHub Actions workflow:");
                
                // Wait briefly to allow GitHub to register the push
                await setTimeout(2000);
                
                // Get the repo URL for the actions link
                const repoUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim()
                  .replace('git@github.com:', 'https://github.com/')
                  .replace(/\.git$/, '');
                
                const actionsUrl = `${repoUrl}/actions`;
                
                // Check for workflow files
                const workflowDir = '.github/workflows';
                if (fs.existsSync(workflowDir)) {
                  const workflows = fs.readdirSync(workflowDir)
                    .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'));
                    
                  if (workflows.length > 0) {
                    logger.info(`✓ Found ${workflows.length} GitHub workflow files: ${workflows.join(', ')}`);
                    logger.info(`✓ GitHub should be processing your push now.`);
                    logger.info(`➤ Check workflow status at: ${actionsUrl}`);
                  } else {
                    logger.warn(`⚠ No workflow files found in .github/workflows`);
                    logger.info(`➤ You may need to create workflow files to trigger GitHub Actions.`);
                  }
                } else {
                  logger.warn(`⚠ No .github/workflows directory found`);
                  logger.info(`➤ GitHub Actions requires workflow files to be defined.`);
                  logger.info(`➤ Create .github/workflows/your-workflow.yml to enable CI/CD.`);
                }
                
                logger.info(`You can manually create a PR when ready on GitHub at: ${repoUrl}/pull/new/${currentBranch}`);
              } catch (verifyError) {
                logger.debug(`Error during GitHub Actions verification: ${verifyError.message}`);
              }
            } else if (commitResult.pushError) {
              logger.error(`Error pushing to remote: ${commitResult.pushError}`);
              logger.info(`To manually push, run: git push -v -u origin ${currentBranch}`);
              
              // Suggest troubleshooting steps
              logger.info('\nTroubleshooting steps:');
              logger.info('1. Check your internet connection');
              logger.info('2. Verify you have write access to the repository');
              logger.info('3. Check if the remote repository exists: git remote -v');
              logger.info('4. Try with verbose output: git push -v -u origin ' + currentBranch);
            } else {
              logger.success(`Changes committed but not pushed to branch: ${currentBranch}`);
              logger.info(`To push the changes, run: git push -u origin ${currentBranch}`);
            }
          } catch (error) {
            logger.error('Error committing changes:', error.message);
            logger.info(`You can manually commit and push using the git command line.`);
          }
        }
      }
    } catch (error) {
      logger.error('Error handling branch options:', error.message);
      logger.info('You can manually commit and push using the git command line:');
      logger.info('1. git add .');
      logger.info('2. git commit -m "Your message"');
      logger.info('3. git push -u origin YOUR_BRANCH_NAME');
    }
  }
}

// Show help information
function showHelp() {
  logger.info(`
Improved Workflow Tool

Usage: node scripts/improved-workflow.js [options]

Options:
  --verbose                 Enable verbose logging
  --skip-tests              Skip running tests and linting
  --skip-build              Skip build process
  --skip-deploy             Skip deployment to preview environment
  --skip-pr                 Skip PR creation instructions
  
Advanced Check Options:
  --skip-bundle-check       Skip bundle size analysis
  --skip-dead-code          Skip dead code detection
  --skip-docs-check         Skip documentation quality check
  --skip-docs-freshness     Skip documentation freshness check
  --skip-workflow-validation Skip workflow validation
  --skip-health-check       Skip health checks
  --skip-advanced-checks    Skip all advanced checks
  
  --help, -h                Show this help information

Examples:
  node scripts/improved-workflow.js
  node scripts/improved-workflow.js --skip-tests --skip-build
  node scripts/improved-workflow.js --verbose
  node scripts/improved-workflow.js --skip-advanced-checks
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
    skipPr: false,
    // New options for advanced checks
    skipBundleCheck: false,
    skipDeadCodeCheck: false,
    skipDocsCheck: false,
    skipDocsFreshnessCheck: false,
    skipWorkflowValidation: false,
    skipHealthCheck: false,
    skipAdvancedChecks: false
  };
  
  for (const arg of args) {
    if (arg === '--verbose') options.verbose = true;
    if (arg === '--skip-tests') options.skipTests = true;
    if (arg === '--skip-build') options.skipBuild = true;
    if (arg === '--skip-deploy') options.skipDeploy = true;
    if (arg === '--skip-pr') options.skipPr = true;
    // Parse new options
    if (arg === '--skip-bundle-check') options.skipBundleCheck = true;
    if (arg === '--skip-dead-code') options.skipDeadCodeCheck = true;
    if (arg === '--skip-docs-check') options.skipDocsCheck = true;
    if (arg === '--skip-docs-freshness') options.skipDocsFreshnessCheck = true;
    if (arg === '--skip-workflow-validation') options.skipWorkflowValidation = true;
    if (arg === '--skip-health-check') options.skipHealthCheck = true;
    if (arg === '--skip-advanced-checks') options.skipAdvancedChecks = true;
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