/**
 * Workflow State Module
 * 
 * Handles tracking and persistence of workflow state.
 */

/* global process */
import { logger } from '../core/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Workflow Error class for categorized errors
 */
export class WorkflowError extends Error {
  constructor(message, category = 'workflow', severity = 'error') {
    super(message);
    this.name = 'WorkflowError';
    this.category = category;
    this.severity = severity;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Manages workflow state tracking
 */
class WorkflowState {
  constructor() {
    this.state = {
      currentStep: null,
      completedSteps: [],
      errors: [],
      warnings: [],
      metrics: {},
      startTime: null,
      endTime: null,
      status: 'idle'
    };
  }

  /**
   * Initialize workflow state
   * @param {Object} options - Workflow options
   */
  initialize(options = {}) {
    this.state = {
      currentStep: null,
      completedSteps: [],
      errors: [],
      warnings: [],
      metrics: {},
      startTime: Date.now(),
      endTime: null,
      status: 'running',
      options
    };
    
    return this.state;
  }

  /**
   * Update current step
   * @param {string} step - Step name
   */
  setCurrentStep(step) {
    this.state.currentStep = step;
  }

  /**
   * Mark step as completed
   * @param {string} step - Step name
   * @param {Object} result - Step result
   */
  completeStep(step, result) {
    this.state.completedSteps.push({
      name: step,
      result,
      timestamp: Date.now()
    });
  }

  /**
   * Add error to state
   * @param {Error} error - Error object
   * @param {string} step - Step where error occurred
   * @param {boolean} critical - Whether error is critical
   */
  trackError(error, step, critical = false) {
    this.state.errors.push({
      message: error.message,
      stack: error.stack,
      step,
      critical,
      timestamp: Date.now()
    });
  }

  /**
   * Add warning to state
   * @param {string} warning - Warning message
   */
  addWarning(warning) {
    this.state.warnings.push({
      message: warning,
      timestamp: Date.now()
    });
  }

  /**
   * Update metrics
   * @param {Object} metrics - Metrics to update
   */
  updateMetrics(metrics) {
    this.state.metrics = {
      ...this.state.metrics,
      ...metrics
    };
  }

  /**
   * Complete workflow
   * @param {Object} result - Final workflow result
   */
  complete(result) {
    this.state.endTime = Date.now();
    this.state.status = 'completed';
    this.state.result = result;
  }

  /**
   * Fail workflow
   * @param {Error} error - Error that caused failure
   */
  fail(error) {
    this.state.endTime = Date.now();
    this.state.status = 'failed';
    this.state.error = error;
  }

  /**
   * Get current state
   * @returns {Object} Current state
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Get workflow status
   * @returns {string} Workflow status
   */
  getStatus() {
    return this.state.status;
  }

  /**
   * Get workflow metrics
   * @returns {Object} Workflow metrics
   */
  getMetrics() {
    return { ...this.state.metrics };
  }

  /**
   * Get errors
   * @returns {Array} List of errors
   */
  getErrors() {
    return [...this.state.errors];
  }

  /**
   * Get warnings
   * @returns {Array} List of warnings
   */
  getWarnings() {
    return [...this.state.warnings];
  }

  /**
   * Update arbitrary state properties
   * @param {Object} updates - State updates to apply
   */
  updateState(updates) {
    this.state = {
      ...this.state,
      ...updates
    };
    return this.state;
  }
}

// Create a singleton instance
const workflowState = new WorkflowState();

// Export a function to get the singleton instance
export default function getWorkflowState() {
  return workflowState;
} 