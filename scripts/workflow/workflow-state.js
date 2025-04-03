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

// Constants for workflow state persistence
const WORKFLOW_STATE_FILE = path.resolve(process.cwd(), 'temp', 'workflow-state.json');
const BACKUP_DIR = path.resolve(process.cwd(), 'temp', 'backups');

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
      status: 'idle',
      channelId: null,
      previewUrls: {
        hours: null,
        admin: null
      }
    };
    
    // Ensure temp directories exist
    this._ensureTempDirs();
    
    // Try to load previous state if it exists
    this._loadState();
  }

  /**
   * Ensure temp directories exist
   * @private
   */
  _ensureTempDirs() {
    try {
      // Create temp directory if it doesn't exist
      const tempDir = path.dirname(WORKFLOW_STATE_FILE);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Create backup directory if it doesn't exist
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }
    } catch (error) {
      logger.warn(`Failed to create temp directories: ${error.message}`);
    }
  }

  /**
   * Load previous state from file
   * @private
   */
  _loadState() {
    try {
      if (fs.existsSync(WORKFLOW_STATE_FILE)) {
        const content = fs.readFileSync(WORKFLOW_STATE_FILE, 'utf8');
        const loadedState = JSON.parse(content);
        
        // Only load certain fields from the previous state
        const fieldsToLoad = ['metrics', 'warnings', 'errors'];
        
        fieldsToLoad.forEach(field => {
          if (loadedState[field]) {
            this.state[field] = loadedState[field];
          }
        });
        
        logger.debug('Loaded previous workflow state');
      }
    } catch (error) {
      logger.debug(`Failed to load previous workflow state: ${error.message}`);
    }
  }

  /**
   * Save current state to file with backup
   * @private
   */
  _saveState() {
    try {
      // Create a backup of the current state file if it exists
      if (fs.existsSync(WORKFLOW_STATE_FILE)) {
        const backupFileName = `workflow-state-${Date.now()}.json`;
        const backupPath = path.join(BACKUP_DIR, backupFileName);
        fs.copyFileSync(WORKFLOW_STATE_FILE, backupPath);
      }
      
      // Save current state
      const content = JSON.stringify(this.state, null, 2);
      fs.writeFileSync(WORKFLOW_STATE_FILE, content, 'utf8');
    } catch (error) {
      logger.warn(`Failed to save workflow state: ${error.message}`);
    }
  }

  /**
   * Initialize workflow state
   * @param {Object} options - Workflow options
   */
  initialize(options = {}) {
    // Preserve certain parts of the existing state
    const existingWarnings = [...this.state.warnings];
    const existingErrors = [...this.state.errors];
    const existingMetrics = { ...this.state.metrics };
    
    // Create new state
    this.state = {
      currentStep: null,
      completedSteps: [],
      errors: existingErrors,
      warnings: existingWarnings,
      metrics: existingMetrics,
      startTime: Date.now(),
      endTime: null,
      status: 'running',
      options,
      channelId: null,
      previewUrls: {
        hours: null,
        admin: null
      }
    };
    
    // Save new state
    this._saveState();
    
    return this.state;
  }

  /**
   * Update current step
   * @param {string} step - Step name
   */
  setCurrentStep(step) {
    this.state.currentStep = step;
    this._saveState();
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
    
    this._saveState();
  }

  /**
   * Add error to state
   * @param {Error} error - Error object
   * @param {string} step - Step where error occurred
   * @param {boolean} critical - Whether error is critical
   */
  trackError(error, step, critical = false) {
    const errorData = {
      message: error.message,
      stack: error.stack,
      step,
      critical,
      timestamp: Date.now()
    };
    
    // Prevent duplicate errors
    const isDuplicate = this.state.errors.some(e => 
      e.message === errorData.message && e.step === errorData.step
    );
    
    if (!isDuplicate) {
      this.state.errors.push(errorData);
      this._saveState();
    }
  }

  /**
   * Add warning to state
   * @param {string|Object} warning - Warning message or object
   * @param {string} [step] - Step where warning occurred
   * @param {string} [category] - Warning category
   */
  addWarning(warning, step = null, category = 'general') {
    // Format the warning object
    const warningData = typeof warning === 'string' 
      ? { message: warning } 
      : warning;
      
    // Add metadata
    warningData.step = step || warningData.step || null;
    warningData.category = category || warningData.category || 'general';
    warningData.timestamp = warningData.timestamp || Date.now();
    
    // Prevent duplicate warnings
    const isDuplicate = this.state.warnings.some(w => 
      w.message === warningData.message && 
      w.step === warningData.step &&
      w.category === warningData.category
    );
    
    if (!isDuplicate) {
      this.state.warnings.push(warningData);
      this._saveState();
    }
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
    
    this._saveState();
  }

  /**
   * Update preview URLs
   * @param {Object} urls - Preview URLs
   */
  setPreviewUrls(urls) {
    this.state.previewUrls = {
      ...this.state.previewUrls,
      ...urls
    };
    
    this._saveState();
  }

  /**
   * Set channel ID
   * @param {string} channelId - Firebase channel ID
   */
  setChannelId(channelId) {
    this.state.channelId = channelId;
    this._saveState();
  }

  /**
   * Complete workflow
   * @param {Object} result - Final workflow result
   */
  complete(result) {
    this.state.endTime = Date.now();
    this.state.status = 'completed';
    this.state.result = result;
    
    this._saveState();
  }

  /**
   * Fail workflow
   * @param {Error} error - Error that caused failure
   */
  fail(error) {
    this.state.endTime = Date.now();
    this.state.status = 'failed';
    this.state.error = error;
    
    // Add the error to the errors list
    this.trackError(error, this.state.currentStep, true);
    
    this._saveState();
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
   * Get preview URLs
   * @returns {Object} Preview URLs
   */
  getPreviewUrls() {
    return { ...this.state.previewUrls };
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
    
    this._saveState();
    
    return this.state;
  }
  
  /**
   * Clear workflow state
   */
  clearState() {
    this.state = {
      currentStep: null,
      completedSteps: [],
      errors: [],
      warnings: [],
      metrics: {},
      startTime: null,
      endTime: null,
      status: 'idle',
      channelId: null,
      previewUrls: {
        hours: null,
        admin: null
      }
    };
    
    this._saveState();
  }
}

// Create a singleton instance
const workflowState = new WorkflowState();

// Export a function to get the singleton instance
export default function getWorkflowState() {
  return workflowState;
} 