/* global process */

/**
 * Workflow State Module
 * 
 * Handles persistence and recovery of workflow state with enhanced cleanup
 * and state synchronization.
 */

import { logger } from '../core/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { commandRunner } from '../core/command-runner.js';
import { setTimeout } from 'timers/promises';
import errorHandler from '../core/error-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fallback logging function when logger is not available
function log(level, ...args) {
  try {
    if (logger && typeof logger[level] === 'function') {
      logger[level](...args);
    } else {
      // Use process.stdout/stderr for fallback logging
      const output = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg
      ).join(' ');
      
      if (level === 'error') {
        process.stderr.write(`${output}\n`);
      } else if (level === 'warn') {
        process.stdout.write(`[WARN] ${output}\n`);
      } else {
        process.stdout.write(`${output}\n`);
      }
    }
  } catch (e) {
    // If all else fails, write to stderr
    process.stderr.write(`[ERROR] Failed to log: ${e.message}\n`);
  }
}

export class WorkflowError extends Error {
  constructor(message, category = 'workflow', severity = 'error') {
    super(message);
    this.name = 'WorkflowError';
    this.category = category;
    this.severity = severity;
    this.timestamp = new Date().toISOString();
  }
}

export class WorkflowState {
  constructor() {
    this.logger = logger;
    this.errorHandler = errorHandler;
    this.state = {
      currentStep: null,
      completedSteps: [],
      errors: [],
      warnings: [],
      metrics: {},
      startTime: null,
      endTime: null,
      duration: 0,
      status: 'idle'
    };

    // Enhanced validation rules
    this.validationRules = {
      maxRecoveryAttempts: 3,
      maxStateAge: 24 * 60 * 60 * 1000, // 24 hours
      requiredFields: ['currentStep', 'completedSteps', 'startTime', 'status'],
      stateSchema: {
        currentStep: ['string', 'null'],
        completedSteps: 'array',
        startTime: 'number',
        errors: 'array',
        warnings: 'array',
        status: 'string',
        lastUpdate: 'number',
        performance: 'object',
        workspaceState: 'object'
      }
    };

    this.stateFile = path.join(process.cwd(), 'temp', 'workflow-state.json');
    this.backupDir = path.join(process.cwd(), 'temp', 'backups');
    this.tempDir = path.join(process.cwd(), 'temp');
    
    // Ensure directories exist
    this.ensureDirectories();
    
    // Initialize state
    this.state = this.loadState();
    
    // Enhanced recovery options
    this.recoveryOptions = {
      maxRetries: 3,
      retryDelay: 5000,
      backoffFactor: 2,
      maxBackoff: 30000,
      cleanupOnRecovery: true
    };
    
    // Recovery state with enhanced tracking
    this.recoveryState = {
      isRecovering: false,
      recoveryAttempt: 0,
      lastRecoverySuccess: false,
      lastRecoveryTime: null,
      recoveryHistory: [],
      retryableSteps: new Set([
        'Authentication & Branch Management',
        'Quality Checks',
        'Build Process',
        'Deployment'
      ]),
      criticalSteps: new Set([
        'Authentication & Branch Management',
        'Build Process'
      ]),
      stepDependencies: {
        'Quality Checks': ['Authentication & Branch Management'],
        'Build Process': ['Quality Checks'],
        'Deployment': ['Build Process']
      }
    };

    // Cleanup options
    this.cleanupOptions = {
      removeTempFiles: true,
      clearBuildCache: false,
      resetState: false,
      keepBackups: 5,
      backupInterval: 30 * 60 * 1000 // 30 minutes
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
      duration: 0,
      status: 'running',
      options
    };
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
   */
  addError(error) {
    this.state.errors.push({
      message: error.message,
      stack: error.stack,
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
    this.state.duration = this.state.endTime - this.state.startTime;
    this.state.status = 'completed';
    this.state.result = result;
  }

  /**
   * Fail workflow
   * @param {Error} error - Error that caused failure
   */
  fail(error) {
    this.state.endTime = Date.now();
    this.state.duration = this.state.endTime - this.state.startTime;
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
   * Get workflow duration
   * @returns {number} Workflow duration in milliseconds
   */
  getDuration() {
    return this.state.duration;
  }

  /**
   * Get completed steps
   * @returns {Array} Completed steps
   */
  getCompletedSteps() {
    return [...this.state.completedSteps];
  }

  /**
   * Get errors
   * @returns {Array} Errors
   */
  getErrors() {
    return [...this.state.errors];
  }

  /**
   * Get warnings
   * @returns {Array} Warnings
   */
  getWarnings() {
    return [...this.state.warnings];
  }

  /**
   * Get metrics
   * @returns {Object} Metrics
   */
  getMetrics() {
    return { ...this.state.metrics };
  }

  /**
   * Check if workflow is running
   * @returns {boolean} Whether workflow is running
   */
  isRunning() {
    return this.state.status === 'running';
  }

  /**
   * Check if workflow is completed
   * @returns {boolean} Whether workflow is completed
   */
  isCompleted() {
    return this.state.status === 'completed';
  }

  /**
   * Check if workflow is failed
   * @returns {boolean} Whether workflow is failed
   */
  isFailed() {
    return this.state.status === 'failed';
  }

  /**
   * Check if workflow has errors
   * @returns {boolean} Whether workflow has errors
   */
  hasErrors() {
    return this.state.errors.length > 0;
  }

  /**
   * Check if workflow has warnings
   * @returns {boolean} Whether workflow has warnings
   */
  hasWarnings() {
    return this.state.warnings.length > 0;
  }

  /**
   * Reset workflow state
   */
  reset() {
    this.state = {
      currentStep: null,
      completedSteps: [],
      errors: [],
      warnings: [],
      metrics: {},
      startTime: null,
      endTime: null,
      duration: 0,
      status: 'idle'
    };
  }

  /**
   * Ensure required directories exist
   * @private
   */
  ensureDirectories() {
    const dirs = [
      path.dirname(this.stateFile),
      this.backupDir,
      this.tempDir
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Load state from file with validation
   * @returns {Object} The loaded state
   * @private
   */
  loadState() {
    try {
      if (!fs.existsSync(this.stateFile)) {
        log('info', 'No existing state file found, using default state');
        const defaultState = this.getDefaultState();
        
        // Save initial state
        this.saveState(defaultState);
        return defaultState;
      }

      const stateData = fs.readFileSync(this.stateFile, 'utf8');
      const state = JSON.parse(stateData);

      log('debug', 'Current state:', JSON.stringify(state, null, 2));
      log('debug', 'Validation rules:', JSON.stringify(this.validationRules, null, 2));

      // Validate state structure
      if (!this.validateStateStructure(state)) {
        log('warn', 'Invalid state structure, using default state');
        const defaultState = this.getDefaultState();
        this.saveState(defaultState);
        return defaultState;
      }

      // Check state age
      if (this.isStateTooOld(state)) {
        log('warn', 'State is too old, using default state');
        const defaultState = this.getDefaultState();
        this.saveState(defaultState);
        return defaultState;
      }

      return state;
    } catch (error) {
      log('error', 'Failed to load state:', error);
      const defaultState = this.getDefaultState();
      this.saveState(defaultState);
      return defaultState;
    }
  }

  /**
   * Get default state structure
   * @returns {Object} Default state
   * @private
   */
  getDefaultState() {
    return {
      currentStep: null,
      completedSteps: [],
      startTime: Date.now(),
      errors: [],
      warnings: [],
      status: 'initialized',
      lastUpdate: Date.now(),
      performance: {
        stepDurations: {},
        resourceUsage: {},
        lastCheck: Date.now()
      },
      workspaceState: {
        packages: [],
        dependencies: {},
        buildOrder: [],
        testOrder: [],
        sharedResources: [],
        performance: {
          packageMetrics: {},
          sharedMetrics: {},
          totalDuration: 0
        }
      }
    };
  }

  /**
   * Validate state structure
   * @param {Object} state - State to validate
   * @returns {boolean} Whether state is valid
   * @private
   */
  validateStateStructure(state) {
    if (!state || typeof state !== 'object') {
      log('warn', 'State is not an object');
      return false;
    }

    // Check required fields
    for (const field of this.validationRules.requiredFields) {
      if (!(field in state)) {
        log('warn', `Missing required field: ${field}`);
        return false;
      }
    }

    // Validate schema
    for (const [field, type] of Object.entries(this.validationRules.stateSchema)) {
      if (field in state) {
        const value = state[field];
        if (Array.isArray(type)) {
          // Handle multiple allowed types
          const valueType = value === null ? 'null' : typeof value;
          if (!type.includes(valueType)) {
            log('warn', `Field ${field} should be one of types ${type.join(', ')}, got ${valueType}`);
            return false;
          }
        } else if (type === 'array' && !Array.isArray(value)) {
          log('warn', `Field ${field} should be an array, got ${typeof value}`);
          return false;
        } else if (type !== 'array' && value !== null && typeof value !== type) {
          log('warn', `Field ${field} should be type ${type}, got ${typeof value}`);
          return false;
        }
      }
    }

    log('info', 'State validation passed');
    return true;
  }

  /**
   * Check if state is too old
   * @param {Object} state - State to check
   * @returns {boolean} Whether state is too old
   * @private
   */
  isStateTooOld(state) {
    if (!state.lastUpdate) return true;
    return Date.now() - state.lastUpdate > this.validationRules.maxStateAge;
  }

  /**
   * Save state to file
   * @param {Object} state - State to save
   * @private
   */
  saveState(state) {
    try {
      // Create backup directory if it doesn't exist
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
      }

      // Save current state
      fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));

      // Create backup with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(this.backupDir, `workflow-state-${timestamp}.json`);
      fs.writeFileSync(backupFile, JSON.stringify(state, null, 2));

      // Clean up old backups
      this.cleanupOldBackups();
    } catch (error) {
      log('error', 'Failed to save state:', error);
    }
  }

  /**
   * Clean up old backup files
   * @private
   */
  cleanupOldBackups() {
    try {
      const files = fs.readdirSync(this.backupDir);
      const backupFiles = files
        .filter(f => f.startsWith('workflow-state-'))
        .map(f => ({
          name: f,
          path: path.join(this.backupDir, f),
          time: fs.statSync(path.join(this.backupDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      // Keep only the most recent 5 backups
      const keepCount = 5;
      const filesToDelete = backupFiles.slice(keepCount);

      for (const file of filesToDelete) {
        fs.unlinkSync(file.path);
      }
    } catch (error) {
      log('error', 'Failed to clean up old backups:', error);
    }
  }

  /**
   * Update workflow state
   * @param {Object} updates - State updates
   */
  updateState(updates) {
    this.state = {
      ...this.state,
      ...updates,
      lastUpdate: Date.now()
    };
    this.saveState(this.state);
  }

  /**
   * Get recovery state
   * @returns {Object} Recovery state
   */
  getRecoveryState() {
    return this.recoveryState;
  }

  /**
   * Check if step can be retried
   * @param {string} stepName - Step name
   * @returns {boolean} Whether step can be retried
   */
  canRetryStep(stepName) {
    return (
      this.recoveryState.retryableSteps.has(stepName) &&
      this.recoveryState.recoveryAttempt < this.recoveryOptions.maxRetries
    );
  }

  /**
   * Start recovery attempt for a step
   * @param {string} stepName - Step name
   * @returns {boolean} Whether recovery can proceed
   */
  startRecovery(stepName) {
    if (!this.canRetryStep(stepName)) {
      return false;
    }

    this.recoveryState.isRecovering = true;
    this.recoveryState.recoveryAttempt++;
    this.recoveryState.lastRecoveryTime = Date.now();

    return true;
  }

  /**
   * End recovery attempt
   * @param {string} stepName - Step name
   * @param {boolean} success - Whether recovery was successful
   */
  endRecovery(stepName, success) {
    this.recoveryState.isRecovering = false;
    this.recoveryState.lastRecoverySuccess = success;
    this.recoveryState.lastRecoveryTime = Date.now();
    this.recoveryState.recoveryHistory.push({
      step: stepName,
      success,
      timestamp: Date.now()
    });
  }

  /**
   * Clean up workflow resources
   * @param {Object} options - Cleanup options
   */
  async cleanup(options = {}) {
    const cleanupOpts = {
      ...this.cleanupOptions,
      ...options
    };

    try {
      // Remove temp files
      if (cleanupOpts.removeTempFiles) {
        await this.cleanupTempFiles();
      }

      // Clear build cache
      if (cleanupOpts.clearBuildCache) {
        await this.cleanupBuildCache();
      }

      // Reset state if requested
      if (cleanupOpts.resetState) {
        this.state = this.getDefaultState();
        this.saveState(this.state);
      }

      log('success', 'Workflow cleanup completed successfully');
    } catch (error) {
      log('error', 'Failed to clean up workflow resources:', error);
      throw error;
    }
  }

  /**
   * Clean up temporary files
   * @private
   */
  async cleanupTempFiles() {
    try {
      const files = fs.readdirSync(this.tempDir);
      for (const file of files) {
        if (file !== 'workflow-state.json' && file !== 'backups') {
          const filePath = path.join(this.tempDir, file);
          if (fs.statSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
          }
        }
      }
    } catch (error) {
      log('error', 'Failed to clean up temporary files:', error);
      throw error;
    }
  }

  /**
   * Clean up build cache with retries
   * @private
   */
  async cleanupBuildCache() {
    const maxRetries = 2;
    const retryDelay = 500;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const buildCacheDir = path.join(process.cwd(), 'node_modules', '.cache');
        if (fs.existsSync(buildCacheDir)) {
          // Try to remove files individually first
          const files = fs.readdirSync(buildCacheDir);
          for (const file of files) {
            const filePath = path.join(buildCacheDir, file);
            try {
              if (fs.statSync(filePath).isFile()) {
                fs.unlinkSync(filePath);
              } else {
                fs.rmdirSync(filePath, { recursive: true });
              }
            } catch (error) {
              // If individual file removal fails, try force removal
              await commandRunner.runCommand(`rm -rf "${filePath}"`);
            }
          }
        }
        return; // Success
      } catch (error) {
        if (attempt === maxRetries - 1) {
          log('error', 'Failed to clean up build cache after multiple attempts:', error);
          throw error;
        }
        log('warn', `Cleanup attempt ${attempt + 1} failed, retrying in ${retryDelay}ms...`);
        await setTimeout(retryDelay);
      }
    }
  }

  /**
   * Track a workflow error
   * @param {Error} error - The error that occurred
   * @param {string} stepName - Name of the step where error occurred
   * @param {boolean} critical - Whether this is a critical error
   */
  trackError(error, stepName, critical = false) {
    const errorInfo = {
      step: stepName,
      message: error.message,
      timestamp: Date.now(),
      critical,
      category: error.category || 'workflow',
      severity: error.severity || 'error'
    };

    // Add to errors array in state
    this.state.errors = this.state.errors || [];
    this.state.errors.push(errorInfo);

    // Update state status if critical
    if (critical) {
      this.state.status = 'failed';
    }

    // Save state
    this.updateState(this.state);

    // Log error
    log('error', `Error in step ${stepName}:`, error.message);
  }

  /**
   * Check if the workflow state is recoverable
   * @returns {boolean} Whether the state can be recovered
   */
  isRecoverable() {
    try {
      // Check if state file exists
      if (!fs.existsSync(this.stateFile)) {
        return false;
      }

      // Load and validate state
      const savedState = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      
      // Check if state is recent enough
      const stateAge = Date.now() - (savedState.lastUpdate || 0);
      if (stateAge > this.validationRules.maxStateAge) {
        return false;
      }

      // Check if we haven't exceeded max recovery attempts
      if (this.recoveryState.recoveryAttempt >= this.recoveryOptions.maxRetries) {
        return false;
      }

      // Check if state has required fields
      for (const field of this.validationRules.requiredFields) {
        if (!(field in savedState)) {
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logger.debug(`State recovery check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Recover workflow state from saved state
   * @returns {boolean} Whether recovery was successful
   */
  recover() {
    try {
      // Load saved state
      const savedState = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));

      // Validate state before recovery
      if (!this.validateState(savedState)) {
        throw new Error('Invalid state file');
      }

      // Update recovery attempt counter
      this.recoveryState.recoveryAttempt++;
      this.recoveryState.isRecovering = true;

      // Restore state
      this.state = {
        ...savedState,
        recovered: true,
        recoveryTime: Date.now()
      };

      // Update recovery tracking
      this.recoveryState.lastRecoverySuccess = true;
      this.recoveryState.lastRecoveryTime = Date.now();
      this.recoveryState.recoveryHistory.push({
        timestamp: Date.now(),
        success: true,
        state: savedState.currentStep
      });

      // Perform cleanup if configured
      if (this.recoveryOptions.cleanupOnRecovery) {
        this.cleanup();
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to recover state: ${error.message}`);
      this.recoveryState.lastRecoverySuccess = false;
      this.recoveryState.recoveryHistory.push({
        timestamp: Date.now(),
        success: false,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Validate state object
   * @private
   * @param {Object} state - State to validate
   * @returns {boolean} Whether state is valid
   */
  validateState(state) {
    // Check required fields
    for (const field of this.validationRules.requiredFields) {
      if (!(field in state)) {
        return false;
      }
    }

    // Check field types
    for (const [field, types] of Object.entries(this.validationRules.stateSchema)) {
      if (field in state) {
        const value = state[field];
        if (Array.isArray(types)) {
          // Multiple allowed types
          if (!types.some(type => this.checkType(value, type))) {
            return false;
          }
        } else {
          // Single allowed type
          if (!this.checkType(value, types)) {
            return false;
          }
        }
      }
    }

    return true;
  }

  /**
   * Check value type
   * @private
   * @param {*} value - Value to check
   * @param {string} type - Expected type
   * @returns {boolean} Whether type matches
   */
  checkType(value, type) {
    if (value === null && type === 'null') {
      return true;
    }
    if (Array.isArray(value) && type === 'array') {
      return true;
    }
    return typeof value === type;
  }
}

// Create a singleton instance
let workflowStateInstance = null;

/**
 * Get the singleton instance of WorkflowState
 * @returns {WorkflowState} The workflow state instance
 */
export default function getWorkflowState() {
  if (!workflowStateInstance) {
    workflowStateInstance = new WorkflowState();
  }
  return workflowStateInstance;
} 