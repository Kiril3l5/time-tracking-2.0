#!/usr/bin/env node

/* global process */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { logger } from './core/logger.js';
import { commandRunner } from './core/command-runner.js';
import { getCurrentBranch, hasUncommittedChanges, commitChanges } from './workflow/branch-manager.js';
import { TestCoordinator } from './checks/test-coordinator.js';
import { PackageCoordinator } from './workflow/package-coordinator.js';
import { createChannelId, deployPackageWithWorkflowIntegration } from './workflow/deployment-manager.js';
import * as progressTracker from './core/progress-tracker.js';
import { colors, styled } from './core/colors.js';
import { performanceMonitor } from './core/performance-monitor.js';
import { setTimeout } from 'timers/promises';
import { runAllAdvancedChecks, runSingleCheckWithWorkflowIntegration } from './workflow/advanced-checker.js';
import { verifyAllAuth } from './auth/auth-manager.js';
import { execSync } from 'child_process';
import { buildPackageWithWorkflowTracking } from './workflow/build-manager.js';
import { WorkflowCache } from './workflow/workflow-cache.js';
import path from 'path';
import { rotateFiles } from './core/command-runner.js';
import { cleanupChannels } from './firebase/channel-cleanup.js';
import { generateWorkflowDashboard } from './workflow/dashboard-integration.js';
import getWorkflowStateInstance from './workflow/workflow-state.js';

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
    // Default workflow options
    this.options = {
      verbose: false,
      skipTests: false,
      skipBuild: false,
      skipDeploy: false, 
      skipCache: false,
      skipGit: false,
      noCache: false,
      ...options
    };
    
    // Setup core services
    this.logger = logger;
    this.commandRunner = commandRunner;
    
    // Create package coordinator
    this.packageCoordinator = new PackageCoordinator();
    
    // Use the new TestCoordinator
    this.testCoordinator = new TestCoordinator();
    
    // Initialize steps tracking
    this.workflowSteps = new Map();
    this.workflowErrors = [];
    this.workflowWarnings = [];
    
    // Initialize caching system
    this.cache = new WorkflowCache({
      enabled: !this.options.noCache
    });
    
    // Initialize progress tracker
    this.progressTracker = progressTracker;
    
    // Preview URLs will be set during deploy phase
    this.previewUrls = null;
    
    // Store results from advanced checks
    this.advancedCheckResults = {};
    
    // Initialize packages array
    this.packages = [];
    
    // Create metrics object to track start times and durations
    this.metrics = {
      // Phase timings
      setupStart: null,
      validationStart: null,
      buildStart: null,
      deployStart: null,
      resultsStart: null,
      cleanupStart: null,
      
      // Calculated durations
      duration: 0,
      phaseDurations: {
        setup: 0,
        validation: 0,
        build: 0,
        deploy: 0,
        results: 0,
        cleanup: 0
      },
      
      // Build performance
      buildPerformance: {
        totalBuildTime: 0,
        averageBuildTime: 0,
        buildSuccessRate: 0
      },
      
      // Package metrics
      packageMetrics: {},
      
      // Test results
      testResults: {},
      
      // Deployment status
      deploymentStatus: {
        status: 'pending',
        timestamp: null,
        details: {}
      },
      
      // Channel cleanup results
      channelCleanup: {
        status: null,
        success: false,
        sitesProcessed: 0,
        totalChannels: 0,
        channelsKept: 0,
        cleanedChannels: 0,
        failedChannels: 0,
        skippedChannels: 0,
        totalErrors: 0,
        sites: []
      }
    };
    
    // Record start time
    this.startTime = Date.now();
    
    // Set verbose mode
    if (this.logger && this.logger.setVerbose) {
      this.logger.setVerbose(this.options.verbose);
    }
  }

  /**
   * Record a workflow error
   * @param {string} message - Error message
   * @param {string} phase - Phase where error occurred
   * @param {string} [step] - Step where error occurred
   */
  recordWorkflowError(message, phase, step = null) {
    if (!message) return;
    
    const error = {
      message: typeof message === 'object' ? JSON.stringify(message) : message,
      phase,
      step,
      timestamp: new Date().toISOString()
    };
    
    this.workflowErrors.push(error);
    this.logger.debug(`Recorded error: ${error.message} (${phase}${step ? ` - ${step}` : ''})`);
  }

  /**
   * Record a step in the workflow
   * @param {string} name - Step name
   * @param {string} phase - Phase (Setup, Validation, Build, Deploy, Results)
   * @param {boolean} success - Whether the step was successful
   * @param {number} duration - Duration in milliseconds
   * @param {string} [error] - Error message if step failed
   */
  recordWorkflowStep(name, phase, success, duration, error = null) {
    // Log original duration
    const originalDuration = duration;
    
    // Adjust minimum duration for potentially too-fast steps, allow 0 for simple checks
    if (duration < 50 && duration > 0 && 
        !['Dependency Check', 'Rotate Reports', 'Rotate Command Logs', 'Rotate Metrics Logs'].includes(name)) { 
      logger.debug(`Adjusting potentially unrealistic non-zero duration for ${name}: ${duration}ms`);
      duration = 50; // Set a minimum displayable duration
    }
    logger.debug(`Recording step ${name} with original duration ${originalDuration}ms, final duration ${duration}ms`);

    const step = {
      name,
      phase,
      success,
      duration, // Use potentially adjusted duration
      error,
      timestamp: new Date().toISOString()
    };
    
    // Store the step by name for easy reference
    this.workflowSteps.set(name, step);
    
    // Log errors when steps fail
    if (!success && error) {
      this.recordWorkflowError(error, phase, name); // Log as an error internally
      
      // --- MODIFIED: Prevent adding generic step/phase failures as warnings --- 
      // We only want specific, actionable warnings reported in the dashboard list.
      // Generic phase/step failures are visible in the timeline.
      /* 
      if (error !== 'Skipped' && !error.includes('skipped') && !name?.endsWith(' Phase') && name !== 'Quality Checks') {
        this.recordWarning(
          `${name}: ${error}`,
          phase,
          name,
          'error' // Mark as error severity
        );
      }
      */
      // --- END MODIFICATION ---
    }
    
    // Log step for debugging
    this.logger.debug(`Recorded step: ${name} (${phase}) - ${success ? 'Success' : 'Failed'}${error ? ` - ${error}` : ''} - Duration: ${duration}ms`);
  }
  
  /**
   * Record a warning message
   * @param {string|Object} message - Warning message or object
   * @param {string} phase - Phase in which the warning occurred
   * @param {string} step - Step in which the warning occurred
   * @param {string} severity - Warning severity (warning, error, info)
   * @param {string} context - Additional context for the warning
   */
  recordWarning(message, phase, step = null, severity = 'warning', context = null) {
    if (!message) return;
    
    // Handle both string warnings and object warnings
    let warning;
    if (typeof message === 'object' && message !== null) {
      warning = {
        message: message.message || String(message),
        phase: phase || message.phase || 'Unknown',
        step: step || message.step || null,
        severity: severity || message.severity || 'warning',
        timestamp: new Date().toISOString(),
        context: context || message.context || null,
      };
    } else {
      warning = {
        message: String(message),
        phase,
        step,
        severity,
        timestamp: new Date().toISOString(),
        context
      };
    }
    
    // Ensure we're not duplicating the same warning
    const isDuplicate = this.workflowWarnings.some(
      w => w.message === warning.message && 
           w.phase === warning.phase && 
           w.step === warning.step
    );
    
    if (!isDuplicate) {
      this.workflowWarnings.push(warning);
      
      // Log the warning to the console with appropriate severity level
      const icon = severity === 'error' ? '❌' : severity === 'warning' ? '⚠️' : 'ℹ️';
      const phaseStep = step ? `${phase} - ${step}` : phase;
      const logMethod = severity === 'error' ? 'error' : 
                       severity === 'warning' ? 'warn' : 'info';
      
      this.logger[logMethod](`${icon} ${phaseStep}: ${warning.message}`);
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
      this.progressTracker.initProgress(6, styled.bold(`${colors.cyan}Development Workflow${colors.reset}`));
      
      // 1. Setup Phase
      await this.setup();
      
      // 2. Validation Phase
      await this.validate();
      
      // 3. Build Phase
      const _ = await this.build();
      
      // 4. Deploy Phase
      await this.deploy();
      
      // ---> Log final state BEFORE generating results/dashboard
      this.logger.debug("--- Final Workflow State Check BEFORE generateResults ---");
      // *** Convert Map to Array HERE for logging final state ***
      const finalStepsArray = Array.from(this.workflowSteps.values());
      this.logger.debug(`Final Steps Array (${finalStepsArray.length}):`);
      finalStepsArray.forEach((step, index) => {
           this.logger.debug(`  - Step Index [${index}]: name=${step?.name}, success=${step?.success}, error=${step?.error}`);
      });
      this.logger.debug(`Final Warnings Array (${this.workflowWarnings.length}):`);
      this.workflowWarnings.forEach((warning, index) => {
          this.logger.debug(`  - Warning [${index}]: msg="${warning?.message?.substring(0,100)}...", severity=${warning?.severity}, phase=${warning?.phase}, step=${warning?.step}`);
      });
      this.logger.debug("--- Final Phase Durations Check ---");
      logger.debug(JSON.stringify(this.metrics.phaseDurations, null, 2));
      this.logger.debug("----------------------------------------------------");
      // ---> End Log

      // 5. Results Phase (Passes workflow instance `this` which includes the Map)
      const _reportPath = await this.generateResults();
      
      // 6. Cleanup Phase (New)
      await this.cleanup();
      
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
    
    // Store the start time in metrics
    this.metrics.setupStart = phaseStartTime;
    
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

      // Calculate phase duration
      const phaseEndTime = Date.now();
      this.metrics.phaseDurations.setup = phaseEndTime - phaseStartTime;
      
      return true;
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
    
    // Store the start time in metrics
    this.metrics.validationStart = phaseStartTime;
    
    try {
      // Check if we can use cached validation results
      // --- DISABLED CACHING ---
      /*
      if (!this.options.skipTests) {
        const { tryUseValidationCache } = await import('./workflow/workflow-cache.js');
        const cacheResult = await tryUseValidationCache(this.cache, this.options);
        
        if (cacheResult.fromCache) {
          // Restore data from cache
          this.advancedCheckResults = cacheResult.data.advancedChecks || {}; // Use empty object as fallback
          this.workflowWarnings = Array.isArray(cacheResult.data.warnings) ? cacheResult.data.warnings : [];
          
          // ---> CORRECTLY RESTORE TEST RESULTS FROM CACHE <--- 
          if (cacheResult.data.testResults && typeof cacheResult.data.testResults === 'object') { 
             this.metrics.testResults = { ...cacheResult.data.testResults }; // Assign directly
             this.logger.debug(`Restored testResults from cache: ${JSON.stringify(this.metrics.testResults)}`);
          } else {
             // Initialize if missing or invalid in cache
             this.metrics.testResults = { passed: 0, failed: 0, total: 0, coverage: null }; 
             this.logger.warn('No valid testResults found in validation cache, initializing.');
          }
          // ---> END RESTORE <--- 
          
          // Record steps from cache
          if (Array.isArray(cacheResult.data.steps)) {
              for (const step of cacheResult.data.steps) {
                // Add fallback for potentially missing properties in cached steps
                this.recordWorkflowStep(
                    step.name || 'Unknown Cached Step', 
                    step.phase || 'Validation', 
                    step.success !== false, // Assume success if not explicitly false
                    typeof step.duration === 'number' ? step.duration : 0,
                    step.error || (step.success !== false ? 'From Cache' : 'From Cache (Failed)')
                );
              }
          } else {
              this.recordWorkflowStep('Validation Phase', 'Validation', true, 10, 'From Cache (No Steps Data)');
          }
          
          this.progressTracker.completeStep(true, 'Validation completed from cache');
          // Ensure the main phase step is also recorded correctly
          this.recordWorkflowStep('Validation Phase', 'Validation', true, 10, 'From Cache'); 
          return; // Return early as intended when using cache
        }
      }
      */
      // --- END DISABLED CACHING ---
      
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
      
      // --- Declare status variables in higher scope --- 
      let testStepSuccess = true; 
      let testStepError = null;   
      let advancedChecksSuccess = true;
      let advancedChecksError = null;
      // ----------------------------------------------

      if (this.options.skipTests) {
        this.logger.warn('Skipping test execution due to --skip-tests flag');
        this.progressTracker.completeStep(true, 'Test execution skipped');
        this.recordWorkflowStep('Test Execution', 'Validation', true, 0, 'Skipped');
        this.recordWorkflowStep('Validation Phase', 'Validation', true, Date.now() - phaseStartTime); 
        return;
      } else {
          // Run tests (using TestCoordinator)
          const testStartTime = Date.now();
          this.logger.info('Running test execution coordination...'); 
          try {
            const testResult = await this.testCoordinator.runTestsAndReport();
            
            // --- Determine FINAL Test Step Status & Error --- 
            testStepSuccess = testResult.success; // Start with command exit status
            testStepError = testResult.error;   // Get potential error from validator

            // If command succeeded BUT validator reported an error (e.g., parsing failure)
            // THEN the step overall is considered FAILED for reporting.
            if (testResult.success === true && testResult.error) { 
                 this.recordWarning(testResult.error, 'Validation', 'Test Execution', 'warning'); 
                 testStepSuccess = false; // <<< OVERRIDE success to FALSE
                 testStepError = testResult.error; // Make sure this error message is used
                 logger.warn(`Test Execution step outcome OVERRIDDEN to FAILED due to validator error: ${testStepError}`);
            } 
            // If command failed without a specific validator error message
            else if (testResult.success === false && !testResult.error) {
                 testStepError = 'Test execution command failed without specific error message.';
                 this.recordWarning(testStepError, 'Validation', 'Test Execution', 'error'); 
                 testStepSuccess = false;
            }
             // If command failed WITH a specific validator error message, ensure status is false
            else if (testResult.success === false && testResult.error) {
                 testStepSuccess = false;
                 // Error message might already be in warnings via testResult.warnings loop below
                 if (!this.workflowWarnings.some(w => w.message === testResult.error)) {
                    this.recordWarning(testResult.error, 'Validation', 'Test Execution', 'error'); 
                 }
            }

            // Record specific warnings from test coordinator output (e.g., actual test failures)
            if (testResult.warnings && testResult.warnings.length > 0) {
              testResult.warnings.forEach(warning => {
                 const message = typeof warning === 'object' ? warning.message : warning;
                 if (message) { this.recordWarning(message, 'Validation', 'Test Execution', 'error'); }
              });
               // Also mark the step as failed if there were test assertion failures reported as warnings
               if (testStepSuccess) { // Only mark failed if not already failed by command/parsing
                 testStepSuccess = false;
                 testStepError = testStepError || 'One or more tests failed.'; 
                 logger.warn('Test Execution step marked as failed due to test assertion failures.');
               }
            }

            // --- Process Test Metrics (Placeholder - uses final determined testStepSuccess) ---
            this.metrics.testResults = this.metrics.testResults || {};
            this.metrics.testResults.testStepsSuccess = testStepSuccess;
            const unitTestData = testResult.unitTests || {};
            this.metrics.testResults.unitTestsPassed = unitTestData.passed ?? 0;
            this.metrics.testResults.unitTestsTotal = unitTestData.total ?? 0;
            this.metrics.testResults.testFiles = unitTestData.files ?? [];
            this.metrics.testResults.coverage = (typeof testResult.coverage === 'number' && !isNaN(testResult.coverage))
                                              ? testResult.coverage
                                              : null;
            
            // Add detailed error information if tests failed
            if (!testStepSuccess && testStepError) {
              this.metrics.testResults.error = testStepError;
            }
            
            this.logger.info('Processing of Unit Test and Coverage results complete.');
            logger.debug(`Updated test metrics: ${JSON.stringify(this.metrics.testResults)}`);
            // --- End Test Metrics Processing ---

          } catch (error) {
              // Handle errors from invoking the test coordinator itself 
              const testErrorMsg = `Test coordination failed: ${error.message}`;
              this.logger.error(testErrorMsg);
              testStepSuccess = false; 
              testStepError = testErrorMsg;
              // Record step failure HERE, before trying to record again below
              this.recordWorkflowStep('Test Execution', 'Validation', false, Date.now() - testStartTime, testErrorMsg); 
          }
          // Record the Test Execution step using the final determined status AFTER try/catch
          // Avoid recording twice if catch block already did
          if (!this.workflowSteps.has('Test Execution')) {
                this.recordWorkflowStep('Test Execution', 'Validation', testStepSuccess, Date.now() - testStartTime, testStepError);
          }
      }
        
      // Run advanced checks 
      this.logger.info("Running advanced checks...");
      const advancedCheckStartTime = Date.now();
      try {
          // Run TypeScript and ESLint checks in parallel first
          const criticalChecks = ['typescript', 'lint'];
          
          if (!this.options.skipAdvancedChecks) {
            this.logger.info(`Running critical checks in parallel: ${criticalChecks.join(', ')}...`);
            
            // Setup common options for both checks
            const commonOptions = {
              phase: 'Validation',
              skipAdvancedChecks: this.options.skipAdvancedChecks,
              treatLintAsWarning: true,
              verbose: this.options.verbose,
              silentMode: true,
              recordWarning: (message, phase, step, severity) => 
                this.recordWarning(message, phase, step, severity),
              recordStep: (name, phase, success, duration, error) => 
                this.recordWorkflowStep(name, phase, success, duration, error)
            };
            
            // Run TypeScript and ESLint checks in parallel
            const [tsResult, lintResult] = await Promise.all([
              runSingleCheckWithWorkflowIntegration('typescript', {
                ...commonOptions,
                timeout: { typescript: 45000 }
              }),
              runSingleCheckWithWorkflowIntegration('lint', {
                ...commonOptions,
                timeout: { lint: 45000 }
              })
            ]);
            
            // Store results for the dashboard
            this.advancedCheckResults = {
              typescript: tsResult,
              lint: lintResult
            };
            
            // Run health check after TypeScript and ESLint have completed
            if (!this.options.skipHealthCheck) {
              this.logger.info('Running health check...');
              const healthResult = await runSingleCheckWithWorkflowIntegration('health', {
                ...commonOptions,
                timeout: { health: 60000 }
              });
              
              this.advancedCheckResults.health = healthResult;
            }
          }
          
          // Run remaining advanced checks in parallel
          const remainingChecks = {
            skipBundleCheck: this.options.skipAdvancedChecks || this.options.skipBundleCheck || false,
            skipDocsCheck: this.options.skipAdvancedChecks || this.options.skipDocsCheck || false,
            skipDocsFreshnessCheck: this.options.skipAdvancedChecks || this.options.skipDocsFreshnessCheck || false,
            skipDeadCodeCheck: this.options.skipAdvancedChecks || this.options.skipDeadCodeCheck || false,
            skipTypeScriptBuild: this.options.skipAdvancedChecks || this.options.skipTypeScriptBuild || false,
            skipLintCheck: true, // Skip lint check as we already ran it
            skipWorkflowValidation: this.options.skipAdvancedChecks || this.options.skipWorkflowValidation || false,
            skipHealthCheck: true, // Skip health check as we already ran it
            ignoreAdvancedFailures: true,
            parallelChecks: true, // Enable parallel check execution
            verbose: this.options.verbose,
            treatLintAsWarning: true,
            treatHealthAsWarning: true,
            silentMode: true,
            promptFn: null,
            timeout: {
              docsFreshness: 60000,
              docsQuality: 30000,
              bundleSize: 60000,
              deadCode: 45000,
              workflowValidation: 30000
            }
          };
          
          this.logger.info("Running remaining checks...");
          const remainingResults = await runAllAdvancedChecks(remainingChecks);
          
          // Ensure the remaining results don't contain a potentially incorrect 'health' entry
          if (remainingResults.results && remainingResults.results.health) {
            delete remainingResults.results.health;
          }
          
          // Merge results, the initial health check (if run) will be preserved
          this.advancedCheckResults = {
            ...this.advancedCheckResults,
            ...(remainingResults.results || {})
          };
          
          // Process documentation quality results
          if (this.advancedCheckResults.docsQuality && 
              this.advancedCheckResults.docsQuality.data && 
              this.advancedCheckResults.docsQuality.data.issues) {
            const fileIssuesList = this.advancedCheckResults.docsQuality.data.issues; // Array of { file: '...', issues: ['...'] }
            fileIssuesList.forEach(fileIssue => { // fileIssue = { file: '...', issues: ['...'] }
              const filePath = fileIssue.file;
              if (fileIssue.issues && Array.isArray(fileIssue.issues)) {
                fileIssue.issues.forEach(message => { // message = "Missing main heading (H1)" etc.
                  this.recordWarning(
                    `Documentation issue: ${message} (${filePath})`, // Use message and filePath
                    'Validation',
                    'Documentation' // Keep the step name general
                  );
                });
              }
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
          
          // Process TypeScript build errors
          if (this.advancedCheckResults.typescriptBuild && 
              this.advancedCheckResults.typescriptBuild.data && 
              this.advancedCheckResults.typescriptBuild.data.errors) {
            const tsBuildErrors = this.advancedCheckResults.typescriptBuild.data.errors;
            
            // Add each error as a separate warning item in the dashboard
            tsBuildErrors.forEach(error => {
              // Format the error message
              const errorMessage = error.file && error.line 
                ? `Build Error: ${error.file}:${error.line}:${error.column} - ${error.message}`
                : `Build Error: ${error.message || 'Unknown error'}`;
                
              this.recordWarning(
                errorMessage,
                'Validation',
                'TypeScript Build',
                'error',
                error.file
              );
            });
            
            // Add a summary warning if there are many errors
            if (tsBuildErrors.length > 10) {
              this.recordWarning(
                `Found ${tsBuildErrors.length} TypeScript build errors. Fix these issues before committing.`,
                'Validation',
                'TypeScript Build',
                'error'
              );
            }
            
            // Add specific actionable guidance for common errors
            const unusedVarsCount = tsBuildErrors.filter(err => err.code === 'TS6133').length;
            if (unusedVarsCount > 0) {
              this.recordWarning(
                `Found ${unusedVarsCount} unused variables. Fix by removing or prefixing with underscore (_).`,
                'Validation',
                'TypeScript Build',
                'info'
              );
            }
            
            const propNotExistCount = tsBuildErrors.filter(err => err.code === 'TS2339').length;
            if (propNotExistCount > 0) {
              this.recordWarning(
                `Found ${propNotExistCount} 'property does not exist' errors. Check interface definitions to add missing properties.`,
                'Validation',
                'TypeScript Build',
                'info'
              );
            }
          }
          
          // ENHANCED ERROR COLLECTION: Ensure ALL advanced check errors are collected
          // This ensures all errors show up in the Issues & Warnings section
          
          if (this.advancedCheckResults) {
            // Process all advanced checks for warnings and errors
            Object.entries(this.advancedCheckResults).forEach(([checkName, check]) => {
              // First check for success/error flags
              if (check.success === false || check.status === 'error') {
                // Extract detailed error information
                const errorMessage = check.error || check.message || `${checkName} check failed`;
                this.recordWarning(
                  errorMessage,
                  'Validation',
                  checkName,
                  'error'
                );
              }
              
              // Then process warnings array if present
              if (Array.isArray(check.warnings) && check.warnings.length > 0) {
                check.warnings.forEach(warning => {
                  this.recordWarning(
                    warning.message || warning,
                    'Validation',
                    checkName,
                    'warning',
                    warning.context || warning.file
                  );
                });
              }
              
              // Process issues array if present (often used instead of warnings)
              if (Array.isArray(check.issues) && check.issues.length > 0) {
                check.issues.forEach(issue => {
                  this.recordWarning(
                    issue.message || issue,
                    'Validation',
                    checkName,
                    issue.severity || 'warning',
                    issue.context || issue.file
                  );
                });
              }
              
              // Process data.issues array if present (nested data structure)
              if (check.data && Array.isArray(check.data.issues) && check.data.issues.length > 0) {
                check.data.issues.forEach(issue => {
                  this.recordWarning(
                    issue.message || issue,
                    'Validation',
                    checkName,
                    issue.severity || 'warning',
                    issue.context || issue.file
                  );
                });
              }
            });
          }
          
          // --- Determine Advanced Checks step success/error based on results --- 
          advancedChecksSuccess = true; // Assume success initially
          advancedChecksError = null;
          
          // Check if any advanced check failed (respecting treatAsWarning flags)
          if (!this.options.ignoreAdvancedFailures && this.advancedCheckResults) { // Check if results exist
               for (const [checkName, checkResult] of Object.entries(this.advancedCheckResults)) {
                   // FIX 2: Ensure the checkResult itself reflects the final status, not just the step
                   // The object this.advancedCheckResults[checkName] passed to the dashboard
                   // needs its 'status' field updated here if it hasn't been already.
                   // The runSingleCheck... and runAll... should ideally return the final status directly.
                   // Let's double-check if the results object IS being updated correctly.
                   // Add a debug log to see the state *before* recording the step.
                   this.logger.debug(`[Advanced Check Finalization] Check: ${checkName}, Result before step record:`, JSON.stringify(checkResult));

                   // Default treatAsWarning to false if not specified for a check
                   const treatAsWarning = (checkName === 'lint' && this.options.treatLintAsWarning) ||
                                          (checkName === 'health' && this.options.treatHealthAsWarning) ||
                                          false; // Default
                                          
                   // If the check object exists and explicitly failed, and is not treated as just a warning
                   if (checkResult && checkResult.success === false && !treatAsWarning) { 
                       advancedChecksSuccess = false; 
                       // Prioritize the error message from the failed check
                       advancedChecksError = checkResult.error || checkResult.message || `${checkName} check failed`; 
                       logger.warn(`Advanced check [${checkName}] failed, marking overall Advanced Checks step as failed. Error: ${advancedChecksError}`);
                       break; // Stop on first critical failure
                   }
               }
           }
           // --- End Determination --- 
           
           // FIX 2: Explicitly update the status field in the instance results object
           if (this.advancedCheckResults) {
             Object.entries(this.advancedCheckResults).forEach(([checkName, checkResult]) => {
               if (checkResult && typeof checkResult === 'object') { // Ensure result object exists
                 // Determine final status based on success flag (defaulting to pending if success is undefined)
                 const finalStatus = typeof checkResult.success === 'boolean' 
                   ? (checkResult.success ? 'success' : 'failed') 
                   : 'pending'; 
                 // Ensure the status property exists before assigning
                 if (!Object.hasOwn(this.advancedCheckResults[checkName], 'status')) {
                    this.advancedCheckResults[checkName].status = 'pending'; // Initialize if needed
                 }
                 this.advancedCheckResults[checkName].status = finalStatus;
                 this.logger.debug(`[Advanced Check Status Update] Set ${checkName} status to: ${finalStatus}`);
               }
             });
           }
 
           this.recordWorkflowStep('Advanced Checks', 'Validation', advancedChecksSuccess, Date.now() - advancedCheckStartTime, advancedChecksError);
      } catch (error) {
          // Handle errors *during* the advanced checks execution block
          this.logger.error(`Advanced checks execution error: ${error.message}`);
          advancedChecksError = `Advanced checks failed: ${error.message}`;
          this.recordWarning(advancedChecksError, 'Validation', 'Advanced Checks', 'error');
          advancedChecksSuccess = false; // Mark as failed
          if(!this.workflowSteps.has('Advanced Checks')) {
              const duration = Date.now() - advancedCheckStartTime;
              // Always record a minimum duration of 1ms to avoid zero timing issues
              this.recordWorkflowStep('Advanced Checks', 'Validation', false, Math.max(duration, 1), advancedChecksError);
          }
      }

      // --- Finalize Validation Phase Status Recording --- 
      let overallSuccess = advancedChecksSuccess && testStepSuccess; 
      let overallError = null; 
      
      if (!testStepSuccess) {
          overallError = testStepError || 'Test Execution failed'; 
      } else if (!advancedChecksSuccess) {
          overallError = advancedChecksError || 'Advanced checks failed';
      } 
       
      logger.debug(`--- Final Validation Phase Status Check ---`);
      logger.debug(`testStepSuccess: ${testStepSuccess}, testStepError: ${testStepError}`);
      logger.debug(`advancedChecksSuccess: ${advancedChecksSuccess}, advancedChecksError: ${advancedChecksError}`);
      logger.debug(`Calculated overallSuccess: ${overallSuccess}, overallError: ${overallError}`);

      this.progressTracker.completeStep(overallSuccess, `Validation phase completed${overallSuccess ? '' : ' with issues'}`);
      this.recordWorkflowStep('Validation Phase', 'Validation', overallSuccess, Date.now() - phaseStartTime, overallError); 
      
    } catch (error) {
        // Outer catch handles errors from Package Analysis etc.
         this.progressTracker.completeStep(false, `Validation failed: ${error.message}`);
         if (!this.workflowSteps.get('Validation Phase')?.success) { // Check if phase already marked failed
             this.recordWorkflowStep('Validation Phase', 'Validation', false, Date.now() - phaseStartTime, error.message);
         }
         this.logger.error('\nValidation Phase Failed:');
         this.logger.error(`➤ ${error.message}`);
         if (error.output) {
             this.logger.error('\nCommand Output:');
             this.logger.error(error.output);
         }
         throw error;
    }
    
    // Calculate phase duration
    const phaseEndTime = Date.now();
    this.metrics.phaseDurations.validation = phaseEndTime - phaseStartTime;
    this.metrics.duration = phaseEndTime - this.metrics.setupStart;
  }

  /**
   * Executes the build phase of the workflow.
   * Builds the 'admin' and 'hours' packages in parallel.
   * Records build metrics (duration, size, file count, success/error) for each package.
   * Calculates overall build performance metrics.
   * Skips execution if `this.options.skipBuild` is true.
   * Calculates and records the total build phase duration in `this.metrics.phaseDurations.build`,
   * regardless of build success or failure.
   * 
   * @async
   * @returns {Promise<Object|undefined>} A promise that resolves with an object containing the 
   *                                      metrics for each built package (keyed by package name), 
   *                                      or undefined if the build is skipped.
   * @throws {Error} If any package build fails and `this.options.ignoreBuildFailures` (or similar) is not set.
   */
  async build() {
    this.progressTracker.startStep('Build Phase');
    this.logger.sectionHeader('Building Application');
    
    const phaseStartTime = Date.now();
    this.metrics.buildStart = phaseStartTime;
    
    try {
      // Skip build if requested
      if (this.options.skipBuild) {
        this.logger.warn('Skipping build due to --skip-build flag');
        this.progressTracker.completeStep(true, 'Build skipped');
        this.recordWorkflowStep('Package Build', 'Build', true, 0, 'Skipped'); // Record skip
        this.recordWorkflowStep('Build Phase', 'Build', true, Date.now() - phaseStartTime);
        return;
      }

      // Build logic - create a completely new packageMetrics object for clean state
      this.metrics.packageMetrics = {};
      this.logger.info('Building application...');
      const packagesToBuild = ['admin', 'hours'];
      this.packages = packagesToBuild.map(name => ({ name, buildResult: null, testResults: null }));

      // Run builds for each package
      const buildPromises = packagesToBuild.map(async (packageName) => {
        let buildResult;
        try {
          this.logger.info(`Building package: ${packageName}...`);
          // Call the individual build function directly for cleaner data flow
          buildResult = await buildPackageWithWorkflowTracking({
            package: packageName,
            timeout: this.options.buildTimeout || 300000,
            recordWarning: (message, phase, step, severity) => this.recordWarning(message, phase, step, severity),
            recordStep: (name, phase, success, duration, error) => this.recordWorkflowStep(name, phase, success, duration, error),
            phase: 'Build'
          });
          
          // Debug log the raw build result
          this.logger.debug(`Raw buildResult for ${packageName}: ${JSON.stringify(buildResult)}`);

          // Store build metrics with consistent property names
          // Initialize the packageMetrics object for this package if needed
          if (!this.metrics.packageMetrics[packageName]) {
            this.metrics.packageMetrics[packageName] = {};
          }
          
          // Store metrics with consistent property names (totalSize not size)
          this.metrics.packageMetrics[packageName] = {
            success: buildResult.success === true,
            duration: typeof buildResult.duration === 'number' ? buildResult.duration : 0,
            fileCount: typeof buildResult.fileCount === 'number' ? buildResult.fileCount : 0,
            totalSize: typeof buildResult.totalSize === 'number' ? buildResult.totalSize : 0,
            sizeBytes: typeof buildResult.totalSize === 'number' ? buildResult.totalSize : 0,
            formattedSize: typeof buildResult.totalSize === 'number' ? 
              this.formatBytes(buildResult.totalSize) : 'N/A',
            warnings: Array.isArray(buildResult.warnings) ? buildResult.warnings : [],
            error: buildResult.success !== true ? (buildResult.error || 'Unknown build error') : null
          };
          
          // Log the stored metrics for debugging
          this.logger.debug(`Stored metrics for ${packageName}: ${JSON.stringify(this.metrics.packageMetrics[packageName])}`);
          
          // Return success or failure for this package
          if (buildResult.success === true) {
            this.logger.success(`✓ Build successful for package: ${packageName}`);
            return { success: true, packageName };
          } else {
            const errorMsg = `Build failed for package ${packageName}: ${buildResult.error || 'Unknown error'}`;
            this.logger.error(errorMsg);
            return { success: false, error: errorMsg, packageName };
          }
        } catch (error) {
          const errorMsg = `Exception during build for package ${packageName}: ${error.message}`;
          this.logger.error(errorMsg);
          
          // Store error metrics
          if (!this.metrics.packageMetrics[packageName]) {
            this.metrics.packageMetrics[packageName] = {};
          }
          
          this.metrics.packageMetrics[packageName] = { 
            success: false, 
            duration: 0, 
            error: errorMsg,
            fileCount: 0,
            totalSize: 0,
            sizeBytes: 0,
            formattedSize: 'N/A'
          };
          
          return { success: false, error: errorMsg, packageName }; 
        }
      });

      // Process the build results
      const results = await Promise.all(buildPromises);
      const validResults = results.filter(r => r && typeof r === 'object');
      const failedBuilds = validResults.filter(r => !r.success);
      
      if (failedBuilds.length > 0) {
        const errorMsg = `Build phase failed for ${failedBuilds.length} package(s): ${failedBuilds.map(f => f.packageName).join(', ')}`;
        this.recordWorkflowStep('Build Phase', 'Build', false, Date.now() - phaseStartTime, errorMsg);
        failedBuilds.forEach(f => this.logger.error(` - ${f.packageName}: ${f.error}`));
        throw new Error(errorMsg);
      }
      
      this.progressTracker.completeStep(true, 'Build completed');
      this.recordWorkflowStep('Build Phase', 'Build', true, Date.now() - phaseStartTime);
      
      // Calculate overall build metrics
      const buildDurations = Object.values(this.metrics.packageMetrics)
        .map(pkg => typeof pkg.duration === 'number' ? pkg.duration : 0);
        
      const totalFileCount = Object.values(this.metrics.packageMetrics)
        .reduce((sum, pkg) => sum + (typeof pkg.fileCount === 'number' ? pkg.fileCount : 0), 0);
        
      const totalSize = Object.values(this.metrics.packageMetrics)
        .reduce((sum, pkg) => sum + (typeof pkg.totalSize === 'number' ? pkg.totalSize : 0), 0);
      
      // Store calculated metrics for build performance
      this.metrics.buildPerformance = {
        totalBuildTime: buildDurations.reduce((sum, d) => sum + d, 0),
        averageBuildTime: buildDurations.length > 0 ? 
          buildDurations.reduce((sum, d) => sum + d, 0) / buildDurations.length : 0,
        buildSuccessRate: packagesToBuild.length > 0 ?
          (packagesToBuild.length - failedBuilds.length) / packagesToBuild.length : 0,
        totalFileCount: totalFileCount,
        totalSize: totalSize,
        formattedTotalSize: this.formatBytes(totalSize)
      };
      
      // Debug log build performance metrics
      this.logger.debug('Build performance metrics:');
      this.logger.debug(JSON.stringify(this.metrics.buildPerformance, null, 2));
      
    } catch (error) {
      this.logger.error('🔴 Build Phase Failed:');
      this.logger.error(`➤ Error Details: ${error.message}`);

      if (this.options.verbose && error.stack) {
        this.logger.error('\nStack Trace:');
        this.logger.error(error.stack);
      }

      this.progressTracker.completeStep(false, `Build failed: ${error.message}`);
      this.recordWorkflowStep('Package Build', 'Build', false, 0, error.message);
      this.recordWorkflowStep('Build Phase', 'Build', false, Date.now() - phaseStartTime, error.message);
      throw error;
    } finally {
      // Calculate phase duration
      const phaseEndTime = Date.now();
      this.metrics.phaseDurations.build = phaseEndTime - phaseStartTime;
    }

    // Return the package metrics
    return this.metrics.packageMetrics; 
  }
  
  // Helper function to format bytes
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0 || isNaN(bytes)) return '0 B';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Deploy Phase
   */
  async deploy() {
    this.metrics.deployStart = Date.now();
    getWorkflowStateInstance().setCurrentStep('Deploy Phase');
    const startTime = Date.now();
    let deploySuccess = true;
    let deployError = null;

    if (this.options.skipDeploy) {
      logger.warn('Deployment skipped due to options.');
      this.recordWorkflowStep('Deploy Phase', 'Deploy', true, 0, 'Skipped');
      getWorkflowStateInstance().completeStep('Deploy Phase', { success: true, skipped: true });
      return { success: true, skipped: true };
    }

    logger.sectionHeader('Deploying Preview');
    
    // Re-initialize previewUrls for this run
    this.previewUrls = { admin: null, hours: null }; 

    try {
      const channelId = await createChannelId();
      logger.info(`Using preview channel ID: ${channelId}`);
      getWorkflowStateInstance().updateMetrics({ channelId }); // Store channel ID

      // --- FIX: Remove loop and call deployment function ONCE --- 
      logger.info('Starting deployment process for all targets...');
      const deployResult = await deployPackageWithWorkflowIntegration({
        // No target needed here as the function handles both
        channelId,
        recordWarning: this.recordWarning.bind(this),
        recordStep: this.recordWorkflowStep.bind(this),
        phase: 'Deploy'
      });

      // --- FIX: Correctly handle the result object --- 
      if (deployResult.success) {
        deploySuccess = true; // Mark phase as success
        if (deployResult.urls && (deployResult.urls.admin || deployResult.urls.hours)) {
          this.previewUrls = deployResult.urls; // Store the fetched URLs
          getWorkflowStateInstance().setPreviewUrls(this.previewUrls);
          logger.success('Deployment successful. Preview URLs:');
          if (this.previewUrls.admin) logger.info(`  Admin: ${this.previewUrls.admin}`);
          if (this.previewUrls.hours) logger.info(`  Hours: ${this.previewUrls.hours}`);
          // Save successful URLs for next run
          await getWorkflowStateInstance().saveLastSuccessfulPreview(this.previewUrls);
        } else {
          // Deployment command succeeded, but URL fetch failed or returned null
          logger.warn('Deployment command succeeded, but failed to retrieve preview URLs.');
          // Keep deploySuccess = true, but previewUrls will remain null
        }
      } else {
        // Deployment failed (either command failed or URL fetch logic had critical error)
        deploySuccess = false;
        deployError = deployResult.error || 'Unknown deployment failure'; 
        logger.error(`Deployment failed: ${deployError}`);
        this.recordWorkflowError(deployError, 'Deploy', 'Package Deployment'); // Record the specific error
      }
      // --- END FIX --- 

    } catch (error) {
      // Catch errors from createChannelId or unexpected errors within the try block
      deploySuccess = false;
      deployError = `Deployment phase failed: ${error.message}`;
      logger.error(deployError);
      // Ensure error is recorded if not already done by the logic above
      if (!this.workflowErrors.some(e => e.message === deployError)) {
          this.recordWorkflowError(deployError, 'Deploy');
      }
    } finally {
      const phaseEndTime = Date.now();
      this.metrics.phaseDurations.deploy = phaseEndTime - startTime;
      this.metrics.duration = phaseEndTime - this.metrics.setupStart;
      // FIX 1 RE-APPLY (Corrected Logic): Use deploySuccess flag if status is still pending
      if (this.metrics.deploymentStatus?.status === 'pending') {
        if (this.options.skipDeploy) {
          this.logger.debug('Deployment status was pending in finally (deploy skipped). Setting to skipped.');
          this.metrics.deploymentStatus = {
            status: 'skipped',
            timestamp: new Date().toISOString(),
            details: { info: 'Deployment skipped via option.' }
          };
        } else {
            // If not skipped, determine status based on the reliable deploySuccess flag
            const finalStatus = deploySuccess ? 'success' : 'failed';
            this.logger.warn(`Deployment status was still pending in finally. Setting based on deploySuccess flag: ${finalStatus}`);
            this.metrics.deploymentStatus = {
              status: finalStatus,
              timestamp: new Date().toISOString(),
              details: { error: deploySuccess ? null : (deployError || 'Deployment failed but status was pending.') }
            };
        }
      }
    }

    // Record the overall Deploy Phase step status based on deploySuccess
    this.recordWorkflowStep('Deploy Phase', 'Deploy', deploySuccess, Date.now() - startTime, deployError); 
    getWorkflowStateInstance().completeStep('Deploy Phase', { success: deploySuccess, error: deployError });
    
    return { 
      success: deploySuccess, 
      error: deployError, 
      urls: this.previewUrls 
    };
  }

  /**
   * Generate results and dashboard
   * 
   * This method is responsible for generating the final dashboard from the workflow execution data.
   * It cleans up Firebase channels, generates the dashboard, and records metrics about the results phase.
   * 
   * @returns {Promise<boolean>} Success status of the dashboard generation
   */
  async generateResults() {
    this.metrics.resultsStart = Date.now();
    getWorkflowStateInstance().setCurrentStep('Results Phase'); 
    const startTime = Date.now();
    let resultsSuccess = true;
    let resultsError = null;
    

    logger.sectionHeader('Generating Results');

    try {
        // Perform channel cleanup first
        logger.info('Running channel cleanup...');
        const cleanupResult = await cleanupChannels({
            verbose: this.options.verbose,
            recordWarning: this.recordWarning.bind(this),
            recordStep: this.recordWorkflowStep.bind(this),
            phase: 'Results'
        });
        // Store cleanup results in the main metrics object of the Workflow instance
        this.metrics.channelCleanup = cleanupResult; 

        // Inject previous preview URLs into the main metrics object
        const workflowState = getWorkflowStateInstance();
        if (workflowState.state.lastSuccessfulPreview) {
          this.metrics.lastSuccessfulPreview = workflowState.state.lastSuccessfulPreview;
          // DEBUG: Log the previous preview data being injected
          logger.debug('[DEBUG] Injecting lastSuccessfulPreview into metrics:', JSON.stringify(this.metrics.lastSuccessfulPreview, null, 2));
        } else {
          logger.debug('[DEBUG] No lastSuccessfulPreview found in workflow state.');
        }
        
        logger.info('Generating workflow dashboard...');

        // --- Prepare data FOR the dashboard from the Workflow instance --- 
        const dashboardData = {
          // Determine overall status based on errors collected in THIS instance
          status: this.workflowErrors.length > 0 ? 'failed' : 'success', 
          startTime: this.startTime, // Use start time from THIS instance
          endTime: Date.now(), 
          options: this.options, // Use options from THIS instance
          metrics: this.metrics, // Pass metrics collected by THIS instance
          steps: Array.from(this.workflowSteps.values()), // Use steps from THIS instance
          errors: this.workflowErrors, // Use errors from THIS instance
          warnings: this.workflowWarnings, // Use warnings from THIS instance
          previewUrls: this.previewUrls, // Use preview URLs from THIS instance
          // FIX: Add the missing advanced check results
          advancedCheckResults: this.advancedCheckResults, 
          // Get supplemental info from singleton if needed
          channelId: workflowState.state.channelId,
          // *** ADD EXPLICIT PREVIOUS URL DATA (Correct Location) ***
          previousPreviewData: this.metrics?.channelCleanup?.stats?.previewComparison ?? null
        };
        // --- End Prepare data --- 

        // Debug logging remains the same...
        logger.debug("--- Data PREPARED for generateWorkflowDashboard ---");
        logger.debug(`Steps Count: ${dashboardData.steps?.length}`);
        logger.debug(`Errors Count: ${dashboardData.errors?.length}`);
        logger.debug(`Warnings Count: ${dashboardData.warnings?.length}`);
        logger.debug(`Metrics Keys: ${Object.keys(dashboardData.metrics || {}).join(', ')}`);
        logger.debug("-------------------------------------------------");

        // *** FIX: Pass the CORRECT dashboardData object ***
        const dashboardResult = await generateWorkflowDashboard(
            dashboardData, // <-- PASS THE PREPARED DATA HERE
            {
                isCI: false, 
                noOpen: false, 
                verbose: this.options.verbose
            }
        );

        if (!dashboardResult.success) {
            resultsSuccess = false;
            resultsError = dashboardResult.error?.message || 'Dashboard generation failed';
            // Record error using the Workflow instance's method
            this.recordWorkflowError(resultsError, 'Results', 'Generate Dashboard'); 
        } else {
            // Store dashboard path in metrics if successful
            this.metrics.dashboardPath = dashboardResult.reportPath;
        }

        // ** Inject lastSuccessfulPreview from the CURRENT run for persistence ***
        if (this.previewUrls && this.metrics.deploymentStatus.status === 'success') { 
            this.metrics.lastSuccessfulPreview = { ...this.previewUrls };
            this.logger.debug('[DEBUG] Injecting lastSuccessfulPreview into metrics:', JSON.stringify(this.metrics.lastSuccessfulPreview));
        }
            
    } catch (error) {
        resultsSuccess = false;
        resultsError = `Results phase failed: ${error.message}`;
        logger.error(resultsError);
        // Record error using the Workflow instance's method
        this.recordWorkflowError(resultsError, 'Results'); 
    }

    const duration = Date.now() - startTime;
    this.metrics.phaseDurations.results = duration;
    // Record step using the Workflow instance's method
    this.recordWorkflowStep('Results Phase', 'Results', resultsSuccess, duration, resultsError); 
    // Update singleton state if needed (maybe just final status?)
    getWorkflowStateInstance().completeStep('Results Phase', { success: resultsSuccess, error: resultsError });

    // Display final summary/options
    if (resultsSuccess && this.workflowErrors.length === 0) {
        logger.sectionHeader('Workflow Complete');
    } else {
        logger.sectionHeader('Workflow Completed with Errors/Failures');
        if (resultsError) logger.error(`Results Phase Error: ${resultsError}`);
    }

    // *** FIX: Update singleton state AFTER workflow run completes ***
    logger.debug('Updating workflowState singleton with final results from workflow instance...');
    const finalInstanceMetrics = this.metrics;
    const finalInstanceChecks = this.advancedCheckResults;

    if (finalInstanceMetrics && finalInstanceMetrics.deploymentStatus) {
      // Update deployment status and potentially other final metrics
      logger.debug('Updating singleton deploymentStatus:', JSON.stringify(finalInstanceMetrics.deploymentStatus));
      getWorkflowStateInstance().updateMetrics({ 
        deploymentStatus: finalInstanceMetrics.deploymentStatus, 
        // Optionally add other final metrics here if needed by dashboard
        // e.g., buildPerformance: finalInstanceMetrics.buildPerformance 
      });
    } else {
      logger.warn('Final instance metrics or deploymentStatus not found for singleton update.');
    }
    
    if (finalInstanceChecks) {
      // Update advanced check results
      logger.debug('Updating singleton advancedChecks:', JSON.stringify(finalInstanceChecks));
      getWorkflowStateInstance().updateAdvancedChecks(finalInstanceChecks);
    } else {
       logger.warn('Final instance advancedChecks not found for singleton update.');
    }
    logger.debug('Singleton state update complete.');
    // *** END FIX ***
  }

  /**
   * Cleanup Phase
   * Rotates old report files and command logs.
   */
  async cleanup() {
    this.progressTracker.startStep('Cleanup Phase');
    this.logger.sectionHeader('Cleaning Up Old Files');
    const phaseStartTime = Date.now();
    
    // Store the start time in metrics
    this.metrics.cleanupStart = phaseStartTime;
    
    let overallSuccess = true;

    try {
      const keepCount = 10; // Number of files to keep

      // Rotate report files
      this.logger.info(`Rotating report files in ./reports, keeping ${keepCount}...`);
      const reportDir = path.join(process.cwd(), 'reports');
      const reportResult = await rotateFiles(reportDir, 'workflow-report-', '.json', keepCount, ['latest-report.json']);
      const reportHtmlResult = await rotateFiles(reportDir, 'workflow-report-', '.html', keepCount, ['latest-report.html']);
      this.logger.info(`Reports cleanup: Deleted ${reportResult.deletedCount + reportHtmlResult.deletedCount}, Kept ${reportResult.keptCount + reportHtmlResult.keptCount}`);
      this.recordWorkflowStep('Rotate Reports', 'Cleanup', true, 0);

      // Rotate command logs
      this.logger.info(`Rotating command logs in ./temp/command-logs, keeping ${keepCount}...`);
      const logDir = path.join(process.cwd(), 'temp', 'command-logs');
      // Check if logDir exists before attempting rotation
      if (fs.existsSync(logDir)) {
        const logResult = await rotateFiles(logDir, 'command-log-', '.log', keepCount);
        this.logger.info(`Command logs cleanup: Deleted ${logResult.deletedCount}, Kept ${logResult.keptCount}`);
      } else {
        this.logger.debug(`Command log directory not found, skipping rotation: ${logDir}`);
      }
      this.recordWorkflowStep('Rotate Command Logs', 'Cleanup', true, 0);

      // Rotate performance metrics logs
      this.logger.info(`Rotating performance metrics in ./temp/metrics, keeping ${keepCount}...`);
      const metricsDir = path.join(process.cwd(), 'temp', 'metrics');
      // Check if metricsDir exists before attempting rotation
      if (fs.existsSync(metricsDir)) {
        const metricsResult = await rotateFiles(metricsDir, 'workflow-metrics-', '.json', keepCount);
        this.logger.info(`Metrics cleanup: Deleted ${metricsResult.deletedCount}, Kept ${metricsResult.keptCount}`);
      } else {
        this.logger.debug(`Metrics directory not found, skipping rotation: ${metricsDir}`);
      }
      this.recordWorkflowStep('Rotate Metrics Logs', 'Cleanup', true, 0);

    } catch (error) {
      this.logger.error(`Cleanup phase failed: ${error.message}`);
      this.recordWorkflowStep('Cleanup Phase', 'Cleanup', false, Date.now() - phaseStartTime, error.message);
      overallSuccess = false;
      // Don't re-throw, allow workflow to finish reporting if possible
    }

    if (overallSuccess) {
        this.progressTracker.completeStep(true, 'Cleanup complete');
        this.recordWorkflowStep('Cleanup Phase', 'Cleanup', true, Date.now() - phaseStartTime);
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
  --skip-typescript-build   Skip TypeScript build check
  --skip-advanced-checks    Skip all advanced checks
  
Performance Options:
  --no-cache                Disable caching for validation and build phases
  
  --help, -h                Show this help information

Examples:
  node scripts/improved-workflow.js
  node scripts/improved-workflow.js --skip-tests --skip-build
  node scripts/improved-workflow.js --verbose
  node scripts/improved-workflow.js --skip-advanced-checks
  node scripts/improved-workflow.js --no-cache
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
    skipAdvancedChecks: false,
    skipTypeScriptBuild: false, // Add new option for TypeScript build check
    // Caching option
    noCache: false
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
    if (arg === '--skip-typescript-build') options.skipTypeScriptBuild = true;
    // Cache option
    if (arg === '--no-cache') options.noCache = true;
    if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    }
  }
  
  return options;
}

/**
 * Main function to run the workflow
 */
async function main() {
  logger.init();
  const options = parseArgs();

  // Get the singleton instance of the workflow state manager
  const workflowState = getWorkflowStateInstance(); 

  // Clean up previous runs
  cleanupPreviousRuns();

  // Initialize workflow state (NOW using the instance)
  // Pass parsed args or an empty object
  workflowState.initialize(options); 

  const workflow = new Workflow(options);
  
  // Setup performance monitoring
  performanceMonitor.start('Total Workflow');
  
  try {
    await workflow.run();
    
    // Log final status
    logger.info("Workflow completed successfully.");

    // *** FIX: Update singleton state AFTER workflow run completes ***
    logger.debug('Updating workflowState singleton with final results from workflow instance...');
    const finalInstanceMetrics = workflow.metrics; 
    const finalInstanceChecks = workflow.advancedCheckResults;

    // Get the singleton instance
    const workflowStateSingleton = getWorkflowStateInstance(); // Get instance here

    if (finalInstanceMetrics && finalInstanceMetrics.deploymentStatus) {
      // Update deployment status and potentially other final metrics
      logger.debug('Updating singleton deploymentStatus:', JSON.stringify(finalInstanceMetrics.deploymentStatus));
      workflowStateSingleton.updateMetrics({ 
        deploymentStatus: finalInstanceMetrics.deploymentStatus, 
        // Optionally add other final metrics here if needed by dashboard
        // e.g., buildPerformance: finalInstanceMetrics.buildPerformance 
      });
    } else {
      logger.warn('Final instance metrics or deploymentStatus not found for singleton update.');
    }
    
    if (finalInstanceChecks) {
      // Update advanced check results
      logger.debug('Updating singleton advancedChecks:', JSON.stringify(finalInstanceChecks));
      workflowStateSingleton.updateAdvancedChecks(finalInstanceChecks);
    } else {
       logger.warn('Final instance advancedChecks not found for singleton update.');
    }
    logger.debug('Singleton state update complete.');
    // *** END FIX ***
    
  } catch (error) {
    logger.error(`Workflow failed: ${error.message}`);
    if (options.verbose && error.stack) {
      logger.error(error.stack);
    }
    
    // Record the failure in the state
    workflowState.fail(error); 
    
    process.exitCode = 1; // Indicate failure
    
  } finally {
    // Ensure performance monitoring ends
    performanceMonitor.end('Total Workflow');
    
    // Ensure state reflects completion or failure
    if (process.exitCode !== 1 && workflowState.getStatus() !== 'failed') {
       workflowState.complete('success');
    }
    
    // Generate dashboard regardless of success/failure
    try {
       await generateWorkflowDashboard(workflowState.getState());
       logger.info("Workflow dashboard generated.");
    } catch (dashboardError) {
       logger.error(`Failed to generate workflow dashboard: ${dashboardError.message}`);
    }
    
    logger.info("Workflow finished.");
  }
}

main(); 