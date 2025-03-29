/**
 * Workflow Step Runner Module
 * 
 * Handles execution of workflow steps with progress tracking
 * and consistent formatting.
 */

import * as originalLogger from '../core/logger.js';

// Create a wrapper for logger to control output
const logger = {
  ...originalLogger,
  // Add filtering when needed
};

/**
 * Define standard workflow steps
 */
export const WORKFLOW_STEPS = [
  { id: 1, name: 'BRANCH MANAGEMENT', description: 'Setting up your working branch' },
  { id: 2, name: 'CODE CHANGES', description: 'Managing your code changes' },
  { id: 3, name: 'QUALITY CHECKS', description: 'Running ESLint, TypeScript, and tests' },
  { id: 4, name: 'AUTO FIXES', description: 'Fixing common issues automatically' },
  { id: 5, name: 'ADVANCED ANALYSIS', description: 'Running additional code analysis' },
  { id: 6, name: 'BUILD APPLICATION', description: 'Building application for deployment' },
  { id: 7, name: 'DEPLOYMENT', description: 'Deploying to Firebase preview channels' },
  { id: 8, name: 'REPORTS', description: 'Generating and opening dashboard' },
  { id: 9, name: 'PULL REQUEST', description: 'Creating or updating a PR' }
];

/**
 * Sub-step definitions for each main step
 */
export const SUB_STEPS = {
  QUALITY_CHECKS: [
    { id: 1, name: 'ESLint' },
    { id: 2, name: 'TypeScript' },
    { id: 3, name: 'Unit Tests' }
  ],
  
  AUTO_FIXES: [
    { id: 1, name: 'Test Dependencies' },
    { id: 2, name: 'React Query Types' },
    { id: 3, name: 'TypeScript Errors' }
  ],
  
  ADVANCED_ANALYSIS: [
    { id: 1, name: 'Dependency Scan' },
    { id: 2, name: 'Dead Code Detection' },
    { id: 3, name: 'Documentation Quality' },
    { id: 4, name: 'Module Syntax' }
  ],
  
  BUILD: [
    { id: 1, name: 'Environment Setup' },
    { id: 2, name: 'Clean Build Directory' },
    { id: 3, name: 'Build Process' },
    { id: 4, name: 'Validate Output' },
    { id: 5, name: 'Analyze Bundle' }
  ],
  
  DEPLOYMENT: [
    { id: 1, name: 'Authentication' },
    { id: 2, name: 'Deploy to Firebase' },
    { id: 3, name: 'Extract URLs' },
    { id: 4, name: 'Channel Cleanup' }
  ],
  
  REPORTS: [
    { id: 1, name: 'Collect Data' },
    { id: 2, name: 'Generate Dashboard' },
    { id: 3, name: 'Clean Temporary Files' }
  ]
};

/**
 * Show current workflow progress
 * @param {number} stepId - The current step ID
 * @param {Object} options - Options for sub-step tracking
 * @param {number} options.totalSubSteps - Total number of sub-steps
 * @param {number} options.currentSubStep - Current sub-step number
 * @param {string} options.subStepName - Name of the current sub-step
 */
export function showWorkflowProgress(stepId, options = {}) {
  const step = WORKFLOW_STEPS.find(s => s.id === stepId);
  if (!step) return;
  
  logger.info('\n');
  
  // Build step display with sub-step information if provided
  let stepDisplay = `STEP ${stepId}/${WORKFLOW_STEPS.length}: ${step.name}`;
  
  if (options.totalSubSteps && options.currentSubStep) {
    stepDisplay += ` (${options.currentSubStep}/${options.totalSubSteps}: ${options.subStepName})`;
  }
  
  logger.info(stepDisplay);
  logger.info('='.repeat(80));
  logger.info(`${step.description}`);
}

/**
 * Show sub-step progress
 * @param {Array} subSteps - Array of sub-steps
 * @param {number} mainStepId - The parent step ID
 * @param {number} subStepId - The current sub-step ID
 */
export function showSubStepProgress(subSteps, mainStepId, subStepId) {
  const mainStep = WORKFLOW_STEPS.find(s => s.id === mainStepId);
  const subStep = subSteps.find(s => s.id === subStepId);
  
  if (!mainStep || !subStep) return;
  
  const totalSubSteps = subSteps.length;
  showWorkflowProgress(mainStepId, {
    totalSubSteps: totalSubSteps,
    currentSubStep: subStepId,
    subStepName: subStep.name
  });
}

/**
 * Run a workflow step with proper error handling and progress tracking
 * @param {number} stepId - The step ID to run
 * @param {Function} stepFunction - The function to execute for this step
 * @param {Object} context - The workflow context/state
 * @param {boolean} continueOnError - Whether to prompt to continue on error
 * @param {Function} promptFn - Function to prompt the user
 * @returns {Promise<boolean>} - Whether the step was successful
 */
export async function runWorkflowStep(stepId, stepFunction, context, continueOnError = false, promptFn) {
  showWorkflowProgress(stepId);
  
  try {
    const result = await stepFunction(context);
    return result;
  } catch (error) {
    logger.error(`Error during ${WORKFLOW_STEPS.find(s => s.id === stepId)?.name || 'step'}: ${error.message}`);
    
    if (continueOnError && typeof promptFn === 'function') {
      const continueAnyway = await promptFn("Continue despite errors? (y/N)", "N");
      return continueAnyway.toLowerCase() === 'y';
    }
    
    return false;
  }
}

export default {
  WORKFLOW_STEPS,
  SUB_STEPS,
  showWorkflowProgress,
  showSubStepProgress,
  runWorkflowStep
}; 