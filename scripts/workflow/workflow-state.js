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
import fsPromises from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants for workflow state persistence
const WORKFLOW_STATE_FILE = path.resolve(process.cwd(), 'temp', 'workflow-state.json');
const BACKUP_DIR = path.resolve(process.cwd(), 'temp', 'backups');
// Define path for persistent last successful preview data
const LAST_PREVIEW_FILE_PATH = path.resolve(process.cwd(), 'temp', 'last-successful-preview.json');

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
      },
      lastSuccessfulPreview: null,
      options: {}
    };
    
    // Ensure temp directories exist
    this._ensureTempDirs();
    
    // Try to load previous state if it exists
    this._loadState();
    this._loadLastSuccessfulPreview(); // Load previous data
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
        const fieldsToLoad = ['metrics', 'warnings', 'errors', 'lastSuccessfulPreview'];
        
        fieldsToLoad.forEach(field => {
          if (loadedState[field]) {
            this.state[field] = loadedState[field];
          }
        });
        
        logger.debug('Loaded previous workflow state');
      } else {
        this.state = this._getDefaultState(); // Use default if no file
      }
    } catch (error) {
      logger.warn(`Failed to load previous workflow state: ${error.message}. Using default state.`);
      this.state = this._getDefaultState();
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
      },
      lastSuccessfulPreview: this.state.lastSuccessfulPreview,
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
   * @param {string} [severity] - Warning severity (error, warning, info)
   */
  addWarning(warning, step = null, category = 'general', severity = 'warning') {
    // Format the warning object
    const warningData = typeof warning === 'string' 
      ? { message: warning } 
      : warning;
      
    // Add metadata
    warningData.step = step || warningData.step || null;
    warningData.category = category || warningData.category || 'general';
    warningData.timestamp = warningData.timestamp || Date.now();
    warningData.severity = severity || warningData.severity || 'warning';
    
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
    // Ensure we have a valid metrics object
    if (!metrics || typeof metrics !== 'object') {
      logger.warn('Invalid metrics object provided to updateMetrics');
      return;
    }

    // Update metrics with proper type checking
    this.state.metrics = {
      ...this.state.metrics,
      ...Object.entries(metrics).reduce((acc, [key, value]) => {
        // Handle special cases
        if (key === 'deploymentStatus') {
          acc[key] = {
            ...this.state.metrics?.deploymentStatus,
            ...value
          };
        } else if (key === 'channelCleanup') {
          acc[key] = {
            ...value,
            // Explicitly preserve existing stats if it exists
            stats: this.state.metrics?.channelCleanup?.stats ?? value.stats, 
            // Ensure status/counts are set reliably (using merged value first)
            status: value.status ?? this.state.metrics?.channelCleanup?.status ?? 'pending',
            cleanedChannels: value.cleanedChannels || 0,
            failedChannels: value.failedChannels || 0
          };
        } else {
          acc[key] = value;
        }
        return acc;
      }, {})
    };
    
    this._saveState();
  }

  /**
   * Set preview URLs for the current workflow
   * @param {Object} urls - Preview URLs object with hours and admin properties
   */
  setPreviewUrls(urls) {
    if (!urls || typeof urls !== 'object') {
      logger.warn('Invalid preview URLs provided to setPreviewUrls');
      return;
    }

    // Update preview URLs with proper validation
    this.state.previewUrls = {
      ...this.state.previewUrls,
      ...Object.entries(urls).reduce((acc, [key, value]) => {
        if (key === 'hours' || key === 'admin') {
          acc[key] = value || null;
        }
        return acc;
      }, {})
    };
    
    // Also add to metrics for easier tracking
    this.updateMetrics({
      previewUrls: this.state.previewUrls
    });
    
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
    return { ...this.state, lastSuccessfulPreview: this.state.lastSuccessfulPreview || null };
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
   * Update general state properties
   * @param {Object} updates - Object with state properties to update
   */
  updateState(updates) {
    if (typeof updates === 'object' && updates !== null) {
      this.state = { ...this.state, ...updates };
      this._saveState();
    }
  }
  
  /**
   * Clear workflow state
   */
  clearState() {
    this.state = this._getDefaultState();
    this._loadLastSuccessfulPreview(); // Reload it after clearing
    this._saveState(); // Save the cleared state
  }

  // --- New methods for handling last successful preview --- 
  _loadLastSuccessfulPreview() {
    try {
      if (fs.existsSync(LAST_PREVIEW_FILE_PATH)) {
        const data = fs.readFileSync(LAST_PREVIEW_FILE_PATH, 'utf8');
        this.state.lastSuccessfulPreview = JSON.parse(data);
        logger.debug('Loaded last successful preview URLs from file.');
      } else {
        this.state.lastSuccessfulPreview = null; // Initialize if file doesn't exist
        logger.debug('No last successful preview file found.');
      }
    } catch (error) {
      logger.warn(`Could not load or parse last successful preview file: ${error.message}`);
      this.state.lastSuccessfulPreview = null;
    }
  }

  async saveLastSuccessfulPreview(previewUrls) {
    if (!previewUrls || (previewUrls.admin === null && previewUrls.hours === null)) {
        logger.warn('Attempted to save empty or null last successful preview URLs. Skipping.');
        return;
    }
    try {
      await fsPromises.writeFile(LAST_PREVIEW_FILE_PATH, JSON.stringify(previewUrls, null, 2));
      logger.debug(`Saved last successful preview URLs to ${LAST_PREVIEW_FILE_PATH}`);
      // Update current state as well for immediate use if needed?
      this.state.lastSuccessfulPreview = previewUrls;
    } catch (error) {
      logger.error(`Could not save last successful preview URLs: ${error.message}`);
    }
  }
  // --- End new methods --- 

  _getDefaultState() {
    // Provides a default structure if no state file is loaded
    return {
        currentStep: null,
        completedSteps: [],
        errors: [],
        warnings: [],
        metrics: { phaseDurations: {}, buildPerformance: {}, packageMetrics: {}, testResults: {} },
        startTime: null,
        endTime: null,
        status: 'idle',
        channelId: null,
        previewUrls: { hours: null, admin: null },
        lastSuccessfulPreview: null, // Add field here
        options: {}
    };
  }

  // Method to inject previous preview into current metrics before dashboard generation
  injectPreviousPreviewIntoMetrics() {
      if (this.state.lastSuccessfulPreview) {
          logger.debug('Injecting previous preview URLs into current metrics');
          this.updateMetrics({ 
              previousPreview: this.state.lastSuccessfulPreview 
          });
          // Note: We don't save the main state file here, 
          // as this is just for the current run's dashboard generation.
          // The persistent saving happens via saveLastSuccessfulPreview.
      } else {
          logger.debug('No last successful preview data available to inject into metrics.');
      }
  }

  /**
   * Explicitly update the advanced checks results in the state.
   * Used to merge the final results from the workflow instance before dashboard generation.
   * @param {Object} advancedChecksResults - The final results object from the workflow instance.
   */
  updateAdvancedChecks(advancedChecksResults) {
    if (advancedChecksResults && typeof advancedChecksResults === 'object') {
      // Ensure metrics.advancedChecks exists
      if (!this.state.metrics.advancedChecks) {
        this.state.metrics.advancedChecks = {};
      }
      // Deep merge might be safer, but for now, let's overwrite/merge at top level
      this.state.metrics.advancedChecks = {
        ...this.state.metrics.advancedChecks, 
        ...advancedChecksResults 
      };
      logger.debug('Updated advanced checks in singleton state:', JSON.stringify(this.state.metrics.advancedChecks));
      this._saveState();
    } else {
      logger.warn('Attempted to update advanced checks with invalid data.');
    }
  }
}

// Create a singleton instance
const workflowState = new WorkflowState();

// Export a function to get the singleton instance
export default function getWorkflowState() {
  return workflowState;
} 