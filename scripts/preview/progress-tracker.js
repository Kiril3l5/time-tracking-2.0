#!/usr/bin/env node

/**
 * Progress Tracker Module
 * 
 * Provides utilities for visualizing multi-step processes in the terminal.
 * Tracks progress through numbered steps with timing information.
 * 
 * @module preview/progress-tracker
 */

import * as logger from './logger.js';
import { colors, styled } from './colors.js';

/* global process */

// Track the current state
let startTime = 0;
let stepStartTime = 0;
let currentStep = 0;
let totalSteps = 0;
let stepTimes = [];

/**
 * Initialize the progress tracker
 * @param {number} steps - Total number of steps in the process
 * @param {string} [title] - Optional title for the process
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
 * @param {string} title - Title of the step
 * @returns {number} - Current step number
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
  const stepCounter = `Step ${currentStep}${totalSteps ? '/' + totalSteps : ''}`;
  const stepInfo = styled.bold(`${colors.magenta}${stepCounter}:${colors.reset}`);
  
  // Print step header
  logger.info(`\n${stepInfo} ${title}`);
  
  return currentStep;
}

/**
 * Update the current step with a progress message
 * @param {string} message - Progress message
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
 * @param {boolean} [success=true] - Whether the step was successful
 * @param {string} [message] - Optional completion message
 * @returns {number} - Elapsed time for the step in milliseconds
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
  
  if (message) {
    logger.info(`  ${statusIcon} ${message} ${timeText}`);
  } else {
    const status = success ? 'Completed' : 'Failed';
    logger.info(`  ${statusIcon} Step ${status} ${timeText}`);
  }
  
  return elapsed;
}

/**
 * Finish the entire process and display a summary
 * @param {boolean} [success=true] - Whether the entire process was successful
 * @param {string} [message] - Optional completion message
 * @returns {Object} - Timing information
 */
export function finishProgress(success = true, message) {
  // Complete the current step if one is active
  if (currentStep > 0 && currentStep === totalSteps) {
    completeStep(success);
  }
  
  const totalElapsed = Date.now() - startTime;
  const totalSec = (totalElapsed / 1000).toFixed(1);
  
  const summaryTitle = success ? 'COMPLETED SUCCESSFULLY' : 'FAILED';
  const summaryStyle = success ? styled.success : styled.error;
  
  logger.info('\n' + summaryStyle('='.repeat(50)));
  logger.info(summaryStyle(`${summaryTitle} (${totalSec}s)`));
  
  if (message) {
    logger.info(summaryStyle(message));
  }
  
  logger.info(summaryStyle('='.repeat(50)) + '\n');
  
  return {
    success,
    elapsed: totalElapsed,
    steps: currentStep,
    stepTimes
  };
}

/**
 * Get the current elapsed time in milliseconds
 * @returns {number} - Elapsed time since progress tracking started
 */
export function getElapsedTime() {
  return Date.now() - startTime;
}

/**
 * Get elapsed time for the current step in milliseconds
 * @returns {number} - Elapsed time for current step
 */
export function getStepElapsedTime() {
  return Date.now() - stepStartTime;
}

/**
 * Format milliseconds as a human-readable duration
 * @param {number} ms - Milliseconds
 * @returns {string} - Formatted duration
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
 * @returns {Object} - Progress statistics
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

export default {
  initProgress,
  startStep,
  updateStep,
  completeStep,
  finishProgress,
  getElapsedTime,
  getStepElapsedTime,
  formatDuration,
  getProgressStats
}; 