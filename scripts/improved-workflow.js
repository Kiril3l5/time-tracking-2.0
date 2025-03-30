#!/usr/bin/env node

/* global process */
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from './core/logger.js';
import workflowEngine from './workflow/workflow-engine.js';
import getWorkflowState from './workflow/workflow-state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get workflow state instance
const workflowState = getWorkflowState();

/**
 * Improved Workflow Module
 * 
 * This is the main orchestration script for the development workflow.
 * It coordinates all aspects of the development process from branch creation
 * to preview deployment and PR creation.
 * 
 * Architecture: (Simplified view from entry point)
 * 1. Parse Arguments
 * 2. Execute Workflow via WorkflowEngine
 * 3. Report Results via WorkflowState
 * 
 * Usage:
 * ```bash
 * node improved-workflow.js [-v | --verbose] [-q | --quick] [--skip-tests] [--skip-lint]
 * ```
 * 
 * @module improved-workflow
 */

/**
 * Parse command line arguments
 * @returns {Object} Parsed options
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    verbose: false,
    quick: false,
    skipTests: false,
    skipLint: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--quick':
      case '-q':
        options.quick = true;
        logger.info("Note: '--quick' flag received, relevant steps should implement skipping logic.");
        break;
      case '--skip-tests':
        options.skipTests = true;
        logger.info("Note: '--skip-tests' flag received, relevant steps should implement skipping logic.");
        break;
      case '--skip-lint':
        options.skipLint = true;
        logger.info("Note: '--skip-lint' flag received, relevant steps should implement skipping logic.");
        break;
      default:
        logger.warn(`Unknown option: ${arg}`);
    }
  }

  return options;
}

/**
 * Main workflow execution
 */
async function main() {
  try {
    // Parse command line arguments
    const options = parseArgs();
    logger.setVerbose(options.verbose);
    logger.info('Parsed options:', options);

    // Execute workflow via the engine
    logger.info('Starting workflow execution via engine...');
    const finalState = await workflowEngine.executeWorkflow(options);

    // Log final results based on the state returned by the engine
    if (workflowState.isCompleted()) {
      logger.success('Workflow completed successfully');
      logger.info(`Duration: ${workflowState.getDuration()}ms`);
      
      const metrics = workflowState.getMetrics();
      if (Object.keys(metrics).length > 0) {
        logger.info('Metrics:', JSON.stringify(metrics, null, 2));
      }
      const warnings = workflowState.getWarnings();
      if (warnings.length > 0) {
        logger.warn('Workflow completed with warnings:');
        warnings.forEach(warning => {
          logger.warn(`- ${warning.message || JSON.stringify(warning)}`);
        });
      }
      process.exit(0);
    } else if (finalState.status === 'completed_with_errors') {
      logger.warn('Workflow completed with non-critical errors.');
      logger.info(`Duration: ${workflowState.getDuration()}ms`);
      const errors = workflowState.getErrors();
      errors.forEach(error => {
        logger.error(`- Step "${error.step || 'unknown'}": ${error.message}`);
      });
      const warnings = workflowState.getWarnings();
      if (warnings.length > 0) {
        logger.warn('Warnings also occurred:');
        warnings.forEach(warning => {
          logger.warn(`- ${warning.message || JSON.stringify(warning)}`);
        });
      }
      process.exit(0);
    } else if (workflowState.isFailed()) {
      logger.error('Workflow failed due to critical error(s).');
      const errors = workflowState.getErrors();
      errors.forEach(error => {
        logger.error(`- Step "${error.step || 'workflow setup'}": ${error.message}`);
        if (options.verbose && error.stack) {
          logger.debug(error.stack);
        }
      });
      process.exit(1);
    } else {
      logger.error(`Workflow finished with unexpected status: ${finalState.status}`);
      process.exit(1);
    }

  } catch (error) {
    logger.error('Unhandled error during workflow orchestration:', error.message);
    if (logger.verbose && error.stack) {
      logger.debug(error.stack);
    }
    if (!workflowState.isFailed()) {
      const errorToFailWith = error instanceof Error ? error : new Error(error?.message || `Unhandled orchestration error.`);
      workflowState.fail(errorToFailWith);
    }
    process.exit(1);
  }
}

// Execute main function
main(); 