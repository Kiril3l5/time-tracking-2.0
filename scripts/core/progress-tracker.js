#!/usr/bin/env node

/**
 * Progress Tracker Module
 * 
 * Provides utilities for visualizing multi-step processes in the terminal.
 * Tracks progress through numbered steps with timing information and provides
 * a consistent visual representation of workflow progress.
 * 
 * Features:
 * - Step-by-step progress tracking with numbering
 * - Automatic timing for each step and overall process
 * - Visual formatting with colors and status indicators
 * - Integration with the logger module for consistent output
 * - Support for success/failure status indications
 * 
 * @module core/progress-tracker
 * @example
 * // Basic usage example
 * import * as progressTracker from './core/progress-tracker.js';
 * 
 * // Initialize with 3 steps
 * progressTracker.initProgress(3, 'My Workflow');
 * 
 * // Execute first step
 * progressTracker.startStep('Preparing Environment');
 * // ... do work ...
 * progressTracker.updateStep('Installing dependencies...');
 * // ... more work ...
 * progressTracker.completeStep(true, 'Environment ready');
 * 
 * // Execute second step
 * progressTracker.startStep('Building Project');
 * // ... do work ...
 * progressTracker.completeStep(true);
 * 
 * // Execute final step and finish
 * progressTracker.startStep('Deploying');
 * // ... do work ...
 * progressTracker.completeStep(true);
 * 
 * // Show final summary
 * progressTracker.finishProgress(true, 'Deployment successful!');
 */

/* global console */

import * as logger from './logger.js';
import { colors, styled } from './colors.js';

// Track the current state
let startTime = 0;
let stepStartTime = 0;
let currentStep = 0;
let totalSteps = 0;
let stepTimes = [];

/**
 * Initialize the progress tracker
 * 
 * @function initProgress
 * @param {number} steps - Total number of steps in the process
 * @param {string} [title] - Optional title for the process
 * @description Sets up the progress tracker with the total number of steps and
 * optionally displays a section title. Resets all internal counters and timers.
 * This should be called once at the beginning of a workflow before tracking steps.
 * @example
 * // Initialize a 5-step workflow with a title
 * progressTracker.initProgress(5, 'Deployment Workflow');
 * 
 * // Initialize a workflow without specifying the number of steps upfront
 * progressTracker.initProgress(0);
 * // Later steps will be automatically numbered
 */
export function initProgress(steps, title) {
  startTime = Date.now();
  stepStartTime = startTime;
  currentStep = 0;
  totalSteps = steps;
  stepTimes = [];
  
  if (title) {
    logger.section(title);
  }
}

/**
 * Start a new step in the process
 * 
 * @function startStep
 * @param {string} title - Title of the step
 * @returns {number} - Current step number
 * @description Begins a new step in the workflow, automatically incrementing the
 * step counter. Displays a formatted header for the step with numbering information.
 * Records timing information from the previous step if there was one.
 * If called without initializing progress first, it will auto-initialize.
 * @example
 * // Start a step with a descriptive title
 * progressTracker.startStep('Authentication Verification');
 * 
 * // The output would look something like:
 * // Step 1/5: Authentication Verification
 */
export function startStep(title) {
  // If this is the first step, initialize if not already done
  if (currentStep === 0 && totalSteps === 0) {
    initProgress(1); // Assume at least 1 step
  }
  
  // Record timing of previous step if there was one
  if (currentStep > 0) {
    const stepTime = Date.now() - stepStartTime;
    stepTimes.push(stepTime);
  }
  
  // Update state
  currentStep++;
  stepStartTime = Date.now();
  
  // Format step counter
  let displayStep = currentStep;
  
  // If current step exceeds total steps, log a debug message but cap display value
  if (totalSteps > 0 && currentStep > totalSteps) {
    // Debug log if available
    if (typeof logger.debug === 'function') {
      logger.debug(`Warning: Current step (${currentStep}) exceeds total steps (${totalSteps})`);
    }
    displayStep = totalSteps;
  }
  
  const stepCounter = `Step ${displayStep}${totalSteps ? '/' + totalSteps : ''}`;
  const stepInfo = styled.bold(`${colors.magenta}${stepCounter}:${colors.reset}`);
  
  // Print step header
  logger.info(`\n${stepInfo} ${title}`);
  
  return currentStep;
}

/**
 * Update the current step with a progress message
 * 
 * @function updateStep
 * @param {string} message - Progress message to display
 * @description Displays a message indicating progress within the current step,
 * without marking the step as complete. Useful for communicating intermediate
 * progress on long-running steps. If no step is active, just logs the message.
 * @example
 * progressTracker.startStep('Building Project');
 * progressTracker.updateStep('Compiling JavaScript...');
 * // ... work happens ...
 * progressTracker.updateStep('Bundling assets...');
 * // ... more work ...
 * progressTracker.completeStep(true);
 */
export function updateStep(message) {
  if (currentStep === 0) {
    // No active step, just log the message
    logger.info(message);
    return;
  }
  
  logger.info(`  ${message}`);
}

/**
 * Mark the current step as completed
 * 
 * @function completeStep
 * @param {boolean} [success=true] - Whether the step was successful
 * @param {string} [message] - Optional completion message
 * @returns {number} - Elapsed time for the step in milliseconds
 * @description Marks the current step as completed, displaying a success or failure
 * indicator and the time taken. Optionally includes a completion message.
 * Records the step timing information for later reporting.
 * @example
 * // Complete a step successfully with a message
 * progressTracker.completeStep(true, 'Authentication successful');
 * 
 * // Complete a step with a failure
 * progressTracker.completeStep(false, 'Build failed due to compilation errors');
 */
export function completeStep(success = true, message) {
  if (currentStep === 0) {
    return 0;
  }
  
  const elapsed = Date.now() - stepStartTime;
  stepTimes.push(elapsed);
  
  const elapsedSec = (elapsed / 1000).toFixed(1);
  const statusIcon = success ? styled.success('✓') : styled.error('✗');
  const timeText = styled.cyan(`(${elapsedSec}s)`);
  
  // Display a cleaner output
  if (message) {
    logger.info(`  ${statusIcon} ${message} ${timeText}`);
  } else {
    // If no message is provided, just show a simple status indicator with time
    logger.info(`  ${statusIcon} ${timeText}`);
  }
  
  return elapsed;
}

/**
 * Finish and display the overall progress
 * 
 * @param {boolean} success - Whether the overall workflow was successful
 * @param {string} message - Final message to display
 */
export function finishProgress(success, message) {
  // Log total duration
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  // Use appropriate styling for success/failure
  console.log('\n');
  
  if (success) {
    console.log('==================================================');
    console.log(`\x1b[32m\x1b[1mCOMPLETED SUCCESSFULLY (${totalDuration}s)\x1b[0m`);
    console.log(message);
    console.log('==================================================');
  } else {
    console.log('==================================================');
    console.log(`\x1b[31m\x1b[1mCOMPLETED WITH ERRORS (${totalDuration}s)\x1b[0m`);
    console.log(`\x1b[31m${message}\x1b[0m`);
    console.log('==================================================');
  }
  
  // Reset state after completion
  currentStep = 0;
  totalSteps = 0;
}

/**
 * Get the current elapsed time in milliseconds
 * 
 * @function getElapsedTime
 * @returns {number} - Elapsed time since progress tracking started in milliseconds
 * @description Calculates and returns the total time elapsed since the progress tracking
 * was initialized. Useful for implementing custom timing logic or progress indicators.
 * @example
 * // Check if a workflow is taking too long
 * const elapsedMs = progressTracker.getElapsedTime();
 * if (elapsedMs > 5 * 60 * 1000) { // 5 minutes
 *   logger.warn('Workflow is taking longer than expected');
 * }
 */
export function getElapsedTime() {
  return Date.now() - startTime;
}

/**
 * Get elapsed time for the current step in milliseconds
 * 
 * @function getStepElapsedTime
 * @returns {number} - Elapsed time for current step in milliseconds
 * @description Calculates and returns the time elapsed since the current step was started.
 * Useful for implementing timeouts or warnings for steps that are taking too long.
 * @example
 * // Check if the current step is taking too long
 * if (progressTracker.getStepElapsedTime() > 60000) { // 1 minute
 *   logger.warn('Current step is taking longer than expected');
 * }
 */
export function getStepElapsedTime() {
  return Date.now() - stepStartTime;
}

/**
 * Format milliseconds as a human-readable duration
 * 
 * @function formatDuration
 * @param {number} ms - Milliseconds to format
 * @returns {string} - Formatted duration string (e.g., "1h 30m 45s" or "45s")
 * @description Converts a millisecond duration into a human-friendly string format,
 * automatically selecting appropriate units (hours, minutes, seconds) based on the
 * duration length. Omits unnecessary units for shorter durations.
 * @example
 * // Format various durations
 * console.log(progressTracker.formatDuration(1500)); // "1s"
 * console.log(progressTracker.formatDuration(65000)); // "1m 5s"
 * console.log(progressTracker.formatDuration(3665000)); // "1h 1m 5s"
 */
export function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  
  // Always show seconds unless we're in hours territory
  if (hours === 0) parts.push(`${seconds}s`);
  
  return parts.join(' ');
}

/**
 * Get summary statistics about progress
 * 
 * @function getProgressStats
 * @returns {Object} - Progress statistics object containing:
 *   - startTime {number}: Timestamp when tracking started
 *   - currentStep {number}: Current step number
 *   - totalSteps {number}: Total number of steps
 *   - elapsedMs {number}: Total elapsed time in milliseconds
 *   - stepTimes {number[]}: Array of individual step times
 *   - currentStepElapsedMs {number}: Elapsed time for current step
 * @description Provides comprehensive statistics about the current progress state,
 * including timing information and step counts. Useful for creating custom progress
 * displays or for logging detailed progress information.
 * @example
 * // Get progress statistics and calculate average step time
 * const stats = progressTracker.getProgressStats();
 * const completedSteps = stats.stepTimes.length;
 * 
 * if (completedSteps > 0) {
 *   const avgStepTime = stats.stepTimes.reduce((a, b) => a + b, 0) / completedSteps;
 *   console.log(`Average step time: ${avgStepTime/1000}s`);
 *   
 *   // Estimate remaining time
 *   const remainingSteps = stats.totalSteps - stats.currentStep;
 *   const estimatedRemainingMs = remainingSteps * avgStepTime;
 *   console.log(`Estimated time remaining: ${progressTracker.formatDuration(estimatedRemainingMs)}`);
 * }
 */
export function getProgressStats() {
  return {
    startTime,
    currentStep,
    totalSteps,
    elapsedMs: getElapsedTime(),
    stepTimes,
    currentStepElapsedMs: getStepElapsedTime()
  };
}

/**
 * Generate a simple performance report summary
 * 
 * @returns {string} - Formatted performance report string
 */
export function generateReport() {
  const stats = getProgressStats();
  const totalTime = getElapsedTime();
  
  return `
Total execution time: ${formatDuration(totalTime)}
Steps completed: ${stats.completed}/${stats.total}
Success rate: ${stats.successRate}%

Note: Detailed metrics collection has been disabled to reduce file generation.
  `;
}

export default {
  initProgress,
  startStep,
  updateStep,
  completeStep,
  finishProgress,
  getElapsedTime,
  getStepElapsedTime,
  formatDuration,
  getProgressStats,
  generateReport
}; 