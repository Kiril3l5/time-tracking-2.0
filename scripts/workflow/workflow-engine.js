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
    this.workflowState.setCurrentStep('initial-health-checks');
    try {
      // Check Node.js version
      const nodeVersionResult = await this.commandRunner.runCommand('node --version');
      if (!nodeVersionResult.success) {
        throw new this.errorHandler.ValidationError(
          'Failed to get Node.js version',
          'node-version'
        );
      }
      
      // Parse version number (remove 'v' prefix)
      const nodeVersion = nodeVersionResult.output.trim().replace('v', '');
      const [majorVersion] = nodeVersion.split('.');
      
      if (parseInt(majorVersion, 10) < 18) {
        throw new this.errorHandler.ValidationError(
          'Node.js version 18 or higher is required',
          'node-version'
        );
      }

      // Check pnpm version
      const pnpmVersionResult = await this.commandRunner.runCommand('pnpm --version');
      if (!pnpmVersionResult.success) {
        throw new this.errorHandler.ValidationError(
          'Failed to get pnpm version',
          'pnpm-version'
        );
      }
      
      // Parse pnpm version
      const pnpmVersion = pnpmVersionResult.output.trim();
      const [pnpmMajorVersion] = pnpmVersion.split('.');
      
      if (parseInt(pnpmMajorVersion, 10) < 8) {
        throw new this.errorHandler.ValidationError(
          'pnpm version 8 or higher is required',
          'pnpm-version'
        );
      }

      // Check git status
      const gitStatusResult = await this.commandRunner.runCommand('git status --porcelain');
      if (gitStatusResult.success && gitStatusResult.output) {
        this.logger.warn('Working directory has uncommitted changes.');
      }

      this.logger.success('Initial health checks passed.');
      this.workflowState.completeStep('initial-health-checks', { success: true });
    } catch (error) {
      this.logger.error(`Initial health check failed: ${error.message}`);
      this.workflowState.addError(error);
      throw error;
    }
  }

  /**
   * Execute the defined workflow steps.
   * @param {Object} options - Workflow options passed from the entry script.
   * @returns {Promise<Object>} Workflow result (final state).
   */
  async executeWorkflow(options = {}) {
    this.logger.info('Starting workflow execution...');
    const workflowStartTime = Date.now();
    
    // Start performance monitoring
    this.performanceMonitor.start();
    
    try {
      // Initialize workflow state
      this.workflowState.initialize(options);

      // Run initial health checks
      await this.runInitialHealthChecks();

      // Analyze dependencies
      this.logger.info('Analyzing package dependencies...');
      this.workflowState.setCurrentStep('analyze-dependencies');
      const depsAnalysis = await this.packageCoordinator.analyzeDependencies();
      this.workflowState.updateMetrics({ dependencies: depsAnalysis });
      this.workflowState.completeStep('analyze-dependencies', { success: true, buildOrder: depsAnalysis.buildOrder, graph: depsAnalysis.graph });
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
      this.logger.info(`Workflow finished with status: ${finalStatus}. Total duration: ${formatDuration(Date.now() - workflowStartTime)}`);

      return this.workflowState.getState();

    } catch (error) {
      this.logger.error(`Workflow execution failed: ${error.message}`);
      this.workflowState.fail(error);
      return this.workflowState.getState();
    } finally {
      // End performance monitoring
      this.performanceMonitor.end();
    }
  }
}

export default new WorkflowEngine(); 