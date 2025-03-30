/**
 * Step Runner Module
 * 
 * Manages the execution of workflow steps with proper error handling
 * and performance tracking.
 */

/* global process */

import { logger } from '../core/logger.js';
import { progressTracker } from '../core/progress-tracker.js';
import { commandRunner } from '../core/command-runner.js';
import { performanceMonitor } from '../core/performance-monitor.js';
import getWorkflowState, { WorkflowError } from './workflow-state.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { setTimeout } from 'timers/promises';

// Import specific functions from modules
import { verifyAllAuth } from '../auth/auth-manager.js';
import { getCurrentBranch, hasUncommittedChanges, switchBranch } from './branch-manager.js';
import { checkDocumentation } from '../checks/doc-freshness.js';
import { analyzeBundles } from '../checks/bundle-analyzer.js';
import { analyzeDeadCode } from '../checks/dead-code-detector.js';
import { generateDashboard } from './dashboard-generator.js';
import { generateReport } from './consolidated-report.js';
import { runChecks } from '../checks/health-checker.js';
import errorHandler from '../core/error-handler.js';
import { QualityChecker } from './quality-checker.js';
import { PackageCoordinator } from './package-coordinator.js';
import { deployPackage } from './deployment-manager.js';
import { analyzeDependencies } from './package-coordinator.js';
import { runQualityChecks } from './quality-checker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create instances
const qualityChecker = new QualityChecker();
const packageCoordinator = new PackageCoordinator();
const workflowState = getWorkflowState();

// Constants
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} initialDelay - Initial delay in milliseconds
 * @returns {Promise<any>} - Result of the function
 */
async function withRetry(fn, maxRetries = MAX_RETRIES, initialDelay = RETRY_DELAY) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry if it's not a transient error
      if (error instanceof errorHandler.ValidationError || 
          error instanceof errorHandler.WorkflowError) {
        throw error;
      }
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = initialDelay * Math.pow(2, attempt - 1);
      logger.warn(`Attempt ${attempt} failed, retrying in ${delay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// Standard workflow steps with package awareness
export const WORKFLOW_STEPS = [
  {
    id: 1,
    name: 'Authentication & Branch Management',
    description: 'Verify authentication and manage branch state',
    critical: true,
    async execute(options) {
      const { workspaceState } = options;
      const startTime = Date.now();
      
      try {
        // Verify authentication using auth manager
        const authResult = await verifyAllAuth({
          requireFirebase: true,
          requireGit: true,
          progressTracker: options.progressTracker
        });

        if (!authResult.success) {
          throw new Error(authResult.errors.join(', '));
        }

        // Log authentication status
        logger.info(`Authenticated as ${authResult.services.firebase.user}`);

        // Handle branch management
        const currentBranch = getCurrentBranch();
        
        // Log current branch without switching
        logger.info(`Current branch: ${currentBranch}`);
        
        // Check for uncommitted changes
        if (hasUncommittedChanges()) {
          logger.warn('You have uncommitted changes.');
          
          const options = [
            'Stash changes and continue',
            'Commit changes',
            'Abort workflow'
          ];
          
          const choice = await commandRunner.promptWorkflowOptions(
            'Please choose how to handle your uncommitted changes:',
            options
          );
          
          let message;
          switch(choice) {
            case '1':
              await commandRunner.runCommand('git stash');
              logger.info('Changes stashed');
              break;
            case '2':
              message = await commandRunner.promptText('Enter commit message: ');
              await commandRunner.runCommand(`git add . && git commit -m "${message}"`);
              logger.info('Changes committed');
              break;
            case '3':
            default:
              throw new Error('Workflow aborted due to uncommitted changes');
          }
        }

        // Track performance
        const duration = Date.now() - startTime;
        performanceMonitor.trackStepPerformance('auth-branch', duration);

        return {
          success: true,
          duration,
          output: {
            branch: currentBranch,
            isNewBranch: false,
            auth: authResult
          }
        };
      } catch (error) {
        // Track error
        logger.error(`Step ${this.name} failed:`, error);
        workflowState.trackError(error, this.name, this.critical);

        return {
          success: false,
          duration: Date.now() - startTime,
          error: error.message
        };
      }
    }
  },
  {
    id: 2,
    name: 'Code Changes',
    description: 'Handle code changes and commits',
    critical: true,
    async execute(options) {
      const { workspaceState } = options;
      const startTime = Date.now();
      
      try {
        // Check for uncommitted changes
        const hasChanges = hasUncommittedChanges();
        if (hasChanges) {
          logger.warn('There are uncommitted changes in the workspace');
        }

        // Track performance
        const duration = Date.now() - startTime;
        performanceMonitor.trackStepPerformance('code-changes', duration);

        return {
          success: true,
          duration,
          output: {
            hasChanges,
            commitMessage: hasChanges ? 'Uncommitted changes detected' : 'No changes'
          }
        };
      } catch (error) {
        // Track error
        logger.error(`Step ${this.name} failed:`, error);
        workflowState.trackError(error, this.name, this.critical);

        return {
          success: false,
          duration: Date.now() - startTime,
          error: error.message
        };
      }
    }
  },
  {
    id: 3,
    name: 'Quality Checks',
    description: 'Run quality checks across packages',
    critical: true,
    async execute(options) {
      const { workspaceState } = options;
      const startTime = Date.now();
      const packageMetrics = new Map();
      
      try {
        // Run quality checks in dependency order
        for (const pkg of workspaceState.buildOrder) {
          const pkgStartTime = Date.now();
          const result = await qualityChecker.runQualityChecks(pkg, options);
          
          if (!result.success) {
            throw new Error(`Quality checks failed for package ${pkg}`);
          }

          // Track package metrics
          const pkgDuration = Date.now() - pkgStartTime;
          packageMetrics.set(pkg, {
            duration: pkgDuration,
            issues: result.issues,
            warnings: result.warnings
          });

          // Track performance
          performanceMonitor.trackStepPerformance(`quality-${pkg}`, pkgDuration);
        }

        // Track total performance
        const duration = Date.now() - startTime;
        performanceMonitor.trackStepPerformance('quality-total', duration);

        return {
          success: true,
          duration,
          packageMetrics: Object.fromEntries(packageMetrics)
        };
      } catch (error) {
        // Track error
        logger.error(`Step ${this.name} failed:`, error);
        workflowState.trackError(error, this.name, this.critical);

        return {
          success: false,
          duration: Date.now() - startTime,
          error: error.message
        };
      }
    }
  },
  {
    id: 4,
    name: 'Build Application',
    description: 'Build packages in dependency order',
    critical: true,
    async execute(options) {
      const { workspaceState } = options;
      const startTime = Date.now();
      const packageMetrics = new Map();
      
      try {
        // Build packages in dependency order
        for (const pkg of workspaceState.buildOrder) {
          const pkgStartTime = Date.now();
          const result = await commandRunner.runCommand(`pnpm --filter ${pkg} build`, {
            cwd: dirname(__dirname),
            stdio: 'inherit'
          });

          if (!result.success) {
            throw new Error(`Build failed for package ${pkg}`);
          }

          // Track package metrics
          const pkgDuration = Date.now() - pkgStartTime;
          packageMetrics.set(pkg, {
            duration: pkgDuration,
            output: result.output
          });

          // Track performance
          performanceMonitor.trackStepPerformance(`build-${pkg}`, pkgDuration);
        }

        // Track total performance
        const duration = Date.now() - startTime;
        performanceMonitor.trackStepPerformance('build-total', duration);

        return {
          success: true,
          duration,
          packageMetrics: Object.fromEntries(packageMetrics)
        };
      } catch (error) {
        // Track error
        logger.error(`Step ${this.name} failed:`, error);
        workflowState.trackError(error, this.name, this.critical);

        return {
          success: false,
          duration: Date.now() - startTime,
          error: error.message
        };
      }
    }
  },
  {
    id: 5,
    name: 'Deployment',
    description: 'Deploy packages to preview environment',
    critical: true,
    async execute(options) {
      const { workspaceState } = options;
      const startTime = Date.now();
      const packageMetrics = new Map();
      
      try {
        // Deploy packages in dependency order
        for (const pkg of workspaceState.buildOrder) {
          const pkgStartTime = Date.now();
          const result = await deployPackage(pkg, options);

          if (!result.success) {
            throw new Error(`Deployment failed for package ${pkg}: ${result.error}`);
          }

          // Track package metrics
          const pkgDuration = Date.now() - pkgStartTime;
          packageMetrics.set(pkg, {
            duration: pkgDuration,
            previewUrl: result.previewUrl
          });

          // Track performance
          performanceMonitor.trackStepPerformance(`deploy-${pkg}`, pkgDuration);
        }

        // Track total performance
        const duration = Date.now() - startTime;
        performanceMonitor.trackStepPerformance('deploy-total', duration);

        return {
          success: true,
          duration,
          packageMetrics: Object.fromEntries(packageMetrics)
        };
      } catch (error) {
        // Track error
        logger.error(`Step ${this.name} failed:`, error);
        workflowState.trackError(error, this.name, this.critical);

        return {
          success: false,
          duration: Date.now() - startTime,
          error: error.message
        };
      }
    }
  },
  {
    id: 6,
    name: 'Reports',
    description: 'Generate reports and dashboard',
    critical: false,
    async execute(options) {
      const { workspaceState } = options;
      const startTime = Date.now();
      
      try {
        // Generate dashboard
        const dashboardResult = await generateDashboard({
          ...options,
          workspaceState
        });

        // Generate consolidated report
        const reportResult = await generateReport({
          ...options,
          workspaceState
        });

        // Track performance
        const duration = Date.now() - startTime;
        performanceMonitor.trackStepPerformance('reports', duration);

        return {
          success: true,
          duration,
          output: {
            dashboard: dashboardResult,
            report: reportResult
          }
        };
      } catch (error) {
        // Track error
        logger.error(`Step ${this.name} failed:`, error);
        workflowState.trackError(error, this.name, this.critical);

        return {
          success: false,
          duration: Date.now() - startTime,
          error: error.message
        };
      }
    }
  }
];

/**
 * Get all workflow steps
 * @returns {Array<Object>} List of workflow steps
 */
export function getWorkflowSteps() {
  return WORKFLOW_STEPS;
}

/**
 * Check if a step should be run
 * @param {Object} step - Step to check
 * @param {Object} state - Current workflow state
 * @returns {boolean} Whether step should be run
 */
export function shouldRunStep(step, state) {
  // Skip if step is already completed
  if (state.completedSteps.includes(step.name)) {
    return false;
  }

  // Skip if step is in progress
  if (state.currentStep === step.name) {
    return false;
  }

  // Skip if step is failed and not retryable
  if (state.errors.some(e => e.step === step.name)) {
    return workflowState.canRetryStep(step.name);
  }

  // Check dependencies
  const dependencies = step.dependencies || [];
  return dependencies.every(dep => state.completedSteps.includes(dep));
}

/**
 * Execute a workflow step with error handling and performance tracking.
 * @param {Object} step - Step definition from WORKFLOW_STEPS
 * @param {Object} context - Execution context containing dependencies
 * @returns {Promise<Object>} Step execution result
 */
export async function executeStep(step, context) {
  const { logger, commandRunner, performanceMonitor, errorHandler, workflowState } = context;
  const stepStartTime = Date.now();
  
  try {
    logger.info(`Starting step: ${step.name}`);
    performanceMonitor.startStep(step.name);
    
    // Execute step with retry logic
    const result = await withRetry(async () => {
      switch (step.name) {
        case 'verify-authentication':
          return await verifyAllAuth({
            requireFirebase: true,
            requireGit: true,
            trackProgress: true
          });
          
        case 'analyze-dependencies':
          return await analyzeDependencies();
          
        case 'run-quality-checks':
          return await runQualityChecks(context);
          
        case 'deploy-packages':
          return await deployPackage(context);
          
        default:
          throw new errorHandler.WorkflowError(`Unknown step: ${step.name}`);
      }
    });
    
    const duration = Date.now() - stepStartTime;
    performanceMonitor.endStep(step.name, duration);
    
    logger.success(`Completed step: ${step.name} (Duration: ${duration}ms)`);
    return {
      success: true,
      duration,
      output: result
    };
    
  } catch (error) {
    const duration = Date.now() - stepStartTime;
    performanceMonitor.endStep(step.name, duration, error);
    
    // Handle different error types
    if (error instanceof errorHandler.ValidationError) {
      logger.error(`Validation error in step ${step.name}:`, error.message);
    } else if (error instanceof errorHandler.WorkflowError) {
      logger.error(`Workflow error in step ${step.name}:`, error.message);
    } else {
      logger.error(`Error in step ${step.name}:`, error.message);
    }
    
    // Add error to workflow state
    workflowState.addError(error);
    
    return {
      success: false,
      duration,
      error: error.message
    };
  }
}

export class StepRunner {
  constructor() {
    this.logger = logger;
    this.progressTracker = progressTracker;
    this.commandRunner = commandRunner;
    this.performanceMonitor = performanceMonitor;
  }

  /**
   * Execute a workflow step
   * @param {Object} step - Step to execute
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Step execution result
   */
  async executeStep(step, context) {
    const startTime = Date.now();
    
    try {
      // Validate step
      if (!step || !step.name || !step.execute) {
        throw new WorkflowError(
          'Invalid step structure',
          'validation',
          'error'
        );
      }

      // Execute step
      const result = await step.execute({
        ...context,
        logger: this.logger,
        commandRunner: this.commandRunner,
        progressTracker: this.progressTracker,
        performanceMonitor: this.performanceMonitor
      });

      // Validate result
      if (!result || typeof result !== 'object') {
        throw new WorkflowError(
          'Invalid step result',
          'validation',
          'error'
        );
      }

      // Add timing information
      result.startTime = startTime;
      result.duration = Date.now() - startTime;

      return result;
    } catch (error) {
      // Convert unknown errors to WorkflowError
      if (!(error instanceof WorkflowError)) {
        throw new WorkflowError(
          `Step ${step.name} failed`,
          'workflow',
          'error'
        );
      }
      throw error;
    }
  }
}

// Export singleton instance
export const stepRunner = new StepRunner();

export default {
  WORKFLOW_STEPS,
  getWorkflowSteps,
  shouldRunStep,
  executeStep
}; 