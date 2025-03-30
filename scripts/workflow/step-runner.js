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
import { getCurrentBranch, hasUncommittedChanges, switchBranch, handleUncommittedChanges } from './branch-manager.js';
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
    name: 'Workflow Engine Initialization',
    description: 'Initialize all workflow components',
    critical: true,
    async execute(options) {
      const startTime = Date.now();
      
      try {
        // Initialize only the components we have
        await Promise.all([
          options.packageCoordinator.initialize(),
          options.qualityChecker.initialize()
        ]);

        // Track performance
        const duration = Date.now() - startTime;
        performanceMonitor.trackStepPerformance('initialization', duration);

        return {
          success: true,
          duration
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
    name: 'Environment Validation',
    description: 'Validate environment and dependencies',
    critical: true,
    async execute(options) {
      const startTime = Date.now();
      
      try {
        // Run health checks
        const healthResult = await runChecks();
        if (!healthResult.success) {
          throw new Error('Health checks failed');
        }

        // Track performance
        const duration = Date.now() - startTime;
        performanceMonitor.trackStepPerformance('environment-validation', duration);

        return {
          success: true,
          duration,
          output: healthResult
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
    name: 'Security & Git Checks',
    description: 'Run security and Git configuration checks',
    critical: true,
    async execute(options) {
      const startTime = Date.now();
      
      try {
        // Run security vulnerability scanning
        const securityResult = await runChecks.securityScan();
        if (!securityResult.success) {
          throw new Error('Security vulnerability scan failed');
        }

        // Run Git configuration checks
        const gitResult = await runChecks.validateGitConfig();
        if (!gitResult.success) {
          throw new Error('Git configuration validation failed');
        }

        // Track performance
        const duration = Date.now() - startTime;
        performanceMonitor.trackStepPerformance('security-git-checks', duration);

        return {
          success: true,
          duration,
          output: {
            security: securityResult,
            git: gitResult
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
    id: 4,
    name: 'Quality Checks',
    description: 'Run quality checks across packages',
    critical: true,
    async execute(options) {
      const startTime = Date.now();
      
      try {
        // Run quality checks
        const qualityResult = await qualityChecker.runQualityChecks(options);
        if (!qualityResult.success) {
          throw new Error('Quality checks failed');
        }

        // Track performance
        const duration = Date.now() - startTime;
        performanceMonitor.trackStepPerformance('quality-checks', duration);

        return {
          success: true,
          duration,
          output: qualityResult
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
    name: 'Build Application',
    description: 'Build packages in dependency order',
    critical: true,
    async execute(options) {
      const startTime = Date.now();
      
      try {
        // Build packages
        const buildResult = await commandRunner.runCommand('pnpm build', {
          cwd: dirname(__dirname),
          stdio: 'inherit'
        });
        if (!buildResult.success) {
          throw new Error('Build failed');
        }

        // Track performance
        const duration = Date.now() - startTime;
        performanceMonitor.trackStepPerformance('build', duration);

        return {
          success: true,
          duration,
          output: buildResult
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
    name: 'Deployment',
    description: 'Deploy packages to preview environment',
    critical: true,
    async execute(options) {
      const startTime = Date.now();
      
      try {
        // Deploy preview
        const deployResult = await deployPackage(options);
        if (!deployResult.success) {
          throw new Error('Deployment failed');
        }

        // Track performance
        const duration = Date.now() - startTime;
        performanceMonitor.trackStepPerformance('deployment', duration);

        return {
          success: true,
          duration,
          output: deployResult
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
    id: 7,
    name: 'Results & Cleanup',
    description: 'Generate reports and clean up resources',
    critical: false,
    async execute(options) {
      const startTime = Date.now();
      
      try {
        // Generate dashboard
        const dashboardResult = await generateDashboard({
          ...options,
          workspaceState: options.workflowState
        });

        // Generate consolidated report
        const reportResult = await generateReport({
          ...options,
          workspaceState: options.workflowState
        });

        // Clean up resources
        await Promise.all([
          options.deploymentManager.cleanup(),
          options.dashboardGenerator.cleanup(),
          options.consolidatedReport.cleanup()
        ]);

        // Track performance
        const duration = Date.now() - startTime;
        performanceMonitor.trackStepPerformance('results-cleanup', duration);

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

      // Execute step with retry logic
      const result = await withRetry(async () => {
        return await step.execute({
          ...context,
          logger: this.logger,
          commandRunner: this.commandRunner,
          progressTracker: this.progressTracker,
          performanceMonitor: this.performanceMonitor
        });
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

// Export executeStep function
export async function executeStep(step, context) {
  return stepRunner.executeStep(step, context);
}

export default {
  WORKFLOW_STEPS,
  getWorkflowSteps,
  shouldRunStep,
  executeStep
}; 