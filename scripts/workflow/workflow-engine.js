/* global process */

/**
 * Workflow Engine Module
 * 
 * Orchestrates the execution of workflow steps and manages workflow state.
 * Integrates with package coordinator for monorepo support.
 */

// Core Dependencies
import { logger } from '../core/logger.js';
// import { setInterval, clearInterval } from 'timers/promises'; // Removed, assuming not needed now
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { commandRunner } from '../core/command-runner.js';
import { performanceMonitor } from '../core/performance-monitor.js';
import errorHandler from '../core/error-handler.js';

// Workflow Components
import { WORKFLOW_STEPS, stepRunner } from './step-runner.js';
import getWorkflowState from './workflow-state.js';
import { PackageCoordinator } from './package-coordinator.js';
import { QualityChecker } from './quality-checker.js';
import * as branchManager from './branch-manager.js';
import { verifyAllAuth } from '../auth/auth-manager.js';
import { getCurrentBranch, hasUncommittedChanges, switchBranch, handleUncommittedChanges } from './branch-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create instances
const packageCoordinator = new PackageCoordinator();
const qualityChecker = new QualityChecker();
const workflowState = getWorkflowState();

/**
 * Format duration in milliseconds to human readable string
 * @param {number} milliseconds - Duration in milliseconds
 * @returns {string} - Formatted duration
 */
function formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes === 0) {
    return `${seconds} seconds`;
  }
  
  return `${minutes} minute${minutes !== 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
}

/**
 * Workflow Engine Class
 * 
 * Orchestrates the execution of workflow steps defined in WORKFLOW_STEPS.
 */
export class WorkflowEngine {
  constructor(options = {}) {
    this.logger = logger;
    this.commandRunner = commandRunner;
    this.performanceMonitor = performanceMonitor;
    this.errorHandler = errorHandler;
    this.workflowState = workflowState;
    this.stepRunner = stepRunner;
    this.packageCoordinator = packageCoordinator;
    this.qualityChecker = qualityChecker;
    this.options = options;
    
    // Set verbose mode from options
    if (this.logger) {
      this.logger.setVerbose(options.verbose || false);
    }

    // Check for recoverable state
    if (this.workflowState.isRecoverable()) {
      this.logger.info('Recoverable workflow state detected. Attempting recovery...');
      try {
        this.workflowState.recover();
        this.logger.success('Successfully recovered workflow state');
      } catch (error) {
        this.logger.error('Failed to recover workflow state:', error);
        this.workflowState.reset();
      }
    }
  }

  /**
   * Run initial health checks before starting the main workflow.
   * @private
   * @returns {Promise<void>}
   * @throws {Error} If health checks fail.
   */
  async runInitialHealthChecks() {
    this.logger.info('Running initial health checks...');
    
    // First verify authentication
    const authResult = await verifyAllAuth({
      requireFirebase: true,
      requireGit: true,
      progressTracker: this.options.progressTracker
    });

    if (!authResult.success) {
      throw new Error(authResult.errors.join(', '));
    }

    this.logger.info(`Authenticated as ${authResult.services.firebase.user}`);

    // Then check for uncommitted changes
    if (await hasUncommittedChanges()) {
      this.logger.warn('You have uncommitted changes.');
      const shouldContinue = await handleUncommittedChanges();
      if (!shouldContinue) {
        throw new Error('Workflow aborted due to uncommitted changes');
      }
    }

    this.logger.success('✓ Initial health checks passed.');
  }

  /**
   * Execute the defined workflow steps.
   * @param {Object} options - Workflow options passed from the entry script.
   * @returns {Promise<Object>} Workflow result (final state).
   */
  async executeWorkflow(options = {}) {
    this.logger.info('Starting workflow execution...');
    const startTime = Date.now();
    
    // Start performance monitoring
    this.performanceMonitor.start();
    
    try {
      // Initialize workflow state
      this.workflowState.initialize(options);

      // Get current branch first - needed for context
      const currentBranch = await this.commandRunner.runCommand('git rev-parse --abbrev-ref HEAD', {
        stdio: 'pipe',
        ignoreError: true
      });

      if (!currentBranch.success) {
        throw new Error('Failed to get current branch');
      }

      const branchName = currentBranch.output.trim();
      this.logger.info(`Current branch: ${branchName}`);

      // Run initial health checks (only uncommitted changes now)
      await this.runInitialHealthChecks();

      // Analyze dependencies first - needed for all subsequent steps
      this.logger.info('Analyzing package dependencies...');
      this.workflowState.setCurrentStep('analyze-dependencies');
      const depsAnalysis = await this.packageCoordinator.analyzeDependencies();
      
      if (!depsAnalysis || !depsAnalysis.buildOrder) {
        throw new Error('Failed to analyze dependencies: No packages found');
      }

      this.workflowState.updateMetrics({ dependencies: depsAnalysis });
      this.workflowState.completeStep('analyze-dependencies', { 
        success: true, 
        buildOrder: depsAnalysis.buildOrder, 
        graph: depsAnalysis.graph 
      });
      this.logger.success('Dependency analysis complete.');

      // Execute workflow steps sequentially
      this.logger.info(`Executing ${WORKFLOW_STEPS.length} workflow steps...`);
      const stepResults = [];
      for (const step of WORKFLOW_STEPS) {
        const stepContext = {
          logger: this.logger,
          commandRunner: this.commandRunner,
          performanceMonitor: this.performanceMonitor,
          errorHandler: this.errorHandler,
          workflowState: this.workflowState,
          packageCoordinator: this.packageCoordinator,
          qualityChecker: this.qualityChecker,
          options: options,
          buildOrder: depsAnalysis.buildOrder,
          dependencyGraph: depsAnalysis.graph,
          branchManager,
          currentBranch: branchName,
        };
        
        this.logger.info(`--- Starting step: ${step.name} ---`);
        this.workflowState.setCurrentStep(step.name);
        const stepStartTime = Date.now();
        
        try {
          const result = await this.stepRunner.executeStep(step, stepContext);
          stepResults.push({ name: step.name, ...result });
          
          if (!result || !result.success) {
            this.logger.error(`Step "${step.name}" failed.`);
            const errorToAdd = result?.error instanceof Error ? result.error : new Error(result?.error || `Step ${step.name} failed without specific error message.`);
            this.workflowState.addError(errorToAdd);
            
            // Handle different error types
            if (errorToAdd instanceof this.errorHandler.ValidationError) {
              this.logger.error('Validation error:', errorToAdd.message);
            } else if (errorToAdd instanceof this.errorHandler.WorkflowError) {
              this.logger.error('Workflow error:', errorToAdd.message);
            }
            
            if (step.critical) {
              this.logger.error(`Critical step "${step.name}" failed. Aborting workflow.`);
              throw new Error(`Critical step "${step.name}" failed.`);
            } else {
              this.logger.warn(`Non-critical step "${step.name}" failed. Continuing workflow...`);
            }
          } else {
            this.logger.success(`--- Completed step: ${step.name} (Duration: ${formatDuration(Date.now() - stepStartTime)}) ---`);
            this.workflowState.completeStep(step.name, result);
          }

        } catch (error) {
          this.logger.error(`Error during step "${step.name}": ${error.message}`);
          const errorToAdd = error instanceof Error ? error : new Error(error?.message || `Unknown error during step ${step.name}.`);
          this.workflowState.addError(errorToAdd);
          
          // Handle different error types
          if (error instanceof this.errorHandler.ValidationError) {
            this.logger.error('Validation error:', error.message);
          } else if (error instanceof this.errorHandler.WorkflowError) {
            this.logger.error('Workflow error:', error.message);
          }
          
          if (step.critical) {
            this.logger.error(`Critical step "${step.name}" failed. Aborting workflow.`);
            throw error;
          } else {
            this.logger.warn(`Non-critical step "${step.name}" failed. Continuing workflow...`);
            stepResults.push({ name: step.name, success: false, error: error.message });
          }
        }
      }

      const finalStatus = this.workflowState.hasErrors() ? 'completed_with_errors' : 'completed';
      const finalResult = {
        status: finalStatus,
        steps: stepResults,
        metrics: this.workflowState.getMetrics(),
        warnings: this.workflowState.getWarnings(),
        performance: this.performanceMonitor.getPerformanceSummary()
      };
      
      this.workflowState.complete(finalResult);
      const duration = Date.now() - startTime;
      this.logger.info(`Workflow finished with status: ${finalStatus}. Total duration: ${formatDuration(duration)}`);

      return this.workflowState.getState();

    } catch (error) {
      this.logger.error('Workflow execution failed:', error.message);
      throw error;
    }
  }
}

// Create and export default instance
export default new WorkflowEngine();