// Import required modules
import { logger } from '../utils/logger.js';
import { captureErrorService } from '../services/error-capture-service.js';
import getWorkflowState from './workflow-state.js';

/**
 * Create a structured error info object
 * 
 * @param {Object} options - Error info options
 * @param {Error|string} options.error - The error object or message
 * @param {string} [options.source] - Source of the error (file, module, function)
 * @param {string} [options.context] - Additional context about what happened
 * @param {boolean} [options.isFatal=false] - If true, this error should stop the process
 * @param {boolean} [options.shouldRetry=false] - If true, the operation should be retried
 * @param {number} [options.retryCount=0] - Number of times this has been retried already
 * @returns {Object} Structured error info
 */
export function createErrorInfo(options = {}) {
  const { error, source, context, isFatal = false, shouldRetry = false, retryCount = 0 } = options;
  
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : new Error().stack;
  const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
  
  return {
    message: errorMessage,
    stack: errorStack,
    errorType,
    source,
    context,
    isFatal,
    shouldRetry,
    retryCount,
    timestamp: new Date().toISOString()
  };
}

/**
 * Log error details to the appropriate channels
 * 
 * @param {Object} errorInfo - Structured error info
 */
export function logErrorDetails(errorInfo) {
  const { message, errorType, source, context, isFatal, shouldRetry, retryCount } = errorInfo;
  
  let logMessage = `[${errorType}] ${message}`;
  
  if (source) {
    logMessage += ` (in ${source})`;
  }
  
  if (context) {
    logMessage += ` - ${context}`;
  }
  
  if (shouldRetry) {
    logMessage += ` - Will retry (attempt ${retryCount + 1})`;
  }
  
  if (isFatal) {
    logger.error(`FATAL: ${logMessage}`);
    // Also log stack trace for fatal errors
    logger.error(`Stack trace: ${errorInfo.stack}`);
  } else {
    logger.warn(logMessage);
  }
}

/**
 * Capture large or important errors to error tracking service
 * 
 * @param {Object} errorInfo - Structured error info
 * @returns {Object} Capture result
 */
export function maybeCaptureLargeError(errorInfo) {
  const { isFatal, errorType } = errorInfo;
  
  // Capture all fatal errors and certain types of errors
  const shouldCapture = isFatal || 
    ['DataCorruptionError', 'SecurityError', 'DatabaseError'].includes(errorType);
  
  if (shouldCapture) {
    try {
      captureErrorService.capture(errorInfo);
      return { captured: true };
    } catch (captureError) {
      logger.error(`Failed to capture error: ${captureError.message}`);
      return { captured: false, captureError };
    }
  }
  
  return { captured: false };
}

/**
 * Execute the appropriate error handling strategy
 * 
 * @param {Object} errorInfo - Structured error info
 * @returns {Object} Strategy result
 */
export function executeErrorStrategy(errorInfo) {
  const { isFatal, shouldRetry, errorType } = errorInfo;
  
  // For fatal errors, prepare for graceful shutdown
  if (isFatal) {
    return {
      action: 'shutdown',
      message: 'Preparing for graceful shutdown due to fatal error'
    };
  }
  
  // For retry errors, prepare retry logic
  if (shouldRetry) {
    return {
      action: 'retry',
      message: 'Preparing to retry operation'
    };
  }
  
  // For known error types, execute specific strategies
  switch (errorType) {
    case 'NetworkError':
      return {
        action: 'wait-and-retry',
        message: 'Network error detected, waiting before retry'
      };
    case 'RateLimitError':
      return {
        action: 'backoff',
        message: 'Rate limit reached, applying exponential backoff'
      };
    default:
      return {
        action: 'continue',
        message: 'Continuing execution with logged error'
      };
  }
}

/**
 * Main error handling function
 * 
 * @param {Error|string} error - The error object or message
 * @param {Object} options - Error handling options
 * @param {string} [options.source] - Source of the error (file, module, function)
 * @param {string} [options.context] - Additional context about what happened
 * @param {boolean} [options.isFatal=false] - If true, this error should stop the process
 * @param {boolean} [options.shouldRetry=false] - If true, the operation should be retried
 * @param {number} [options.retryCount=0] - Number of times this has been retried already
 * @returns {Object} Error handling result
 */
export function handleError(error, options = {}) {
  try {
    // Create detailed error info
    const errorInfo = createErrorInfo({
      error,
      ...options
    });
    
    // Log the error
    logErrorDetails(errorInfo);
    
    // Capture the error
    const captureResult = maybeCaptureLargeError(errorInfo);
    
    // Execute appropriate error strategy
    const strategyResult = executeErrorStrategy(errorInfo);
    
    // Return result
    return {
      handled: true,
      errorInfo,
      captured: captureResult.captured,
      strategyResult,
      shouldExit: options.isFatal,
      shouldRetry: options.shouldRetry
    };
  } catch (handlerError) {
    // Error happened while handling error - log but don't recurse
    logger.error(`Error while handling error: ${handlerError.message}`);
    
    return {
      handled: false,
      errorInfo: {
        message: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        isFatal: true
      },
      shouldExit: true,
      shouldRetry: false
    };
  }
}

/**
 * Handle an error with workflow tracking integration
 * 
 * @param {Error|string} error - The error object or message
 * @param {Object} options - Error handling options
 * @param {string} [options.source] - Source of the error (file, module, function)
 * @param {string} [options.context] - Additional context about what happened
 * @param {boolean} [options.isFatal=false] - If true, this error should stop the process
 * @param {boolean} [options.shouldRetry=false] - If true, the operation should be retried
 * @param {number} [options.retryCount=0] - Number of times this has been retried already
 * @param {string} [options.phase='Error'] - Current workflow phase
 * @param {string} [options.stepName='Error Handling'] - Name of the current step
 * @returns {Object} Error handling result
 */
export function handleErrorWithWorkflowTracking(error, options = {}) {
  const {
    source,
    context,
    isFatal = false,
    shouldRetry = false,
    retryCount = 0,
    phase = 'Error',
    stepName = 'Error Handling'
  } = options;
  
  // Get workflow state for tracking
  const workflowState = getWorkflowState();
  
  const startTime = Date.now();
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : null;
  
  // Start step tracking
  workflowState.setCurrentStep(stepName);
  
  try {
    // Create detailed error info
    const errorInfo = createErrorInfo({
      error,
      source,
      context,
      isFatal,
      shouldRetry,
      retryCount
    });
    
    // Log the error
    logErrorDetails(errorInfo);
    
    // Record as a warning in workflow
    // Format a detailed warning message
    let warningMessage = `${errorInfo.errorType}: ${errorInfo.message}`;
    
    if (source) {
      warningMessage += ` (in ${source})`;
    }
    
    if (context) {
      warningMessage += ` - ${context}`;
    }
    
    // Add metadata about retries
    if (shouldRetry) {
      warningMessage += ` - Will retry (attempt ${retryCount + 1})`;
    }
    
    // Record the warning
    workflowState.addWarning(warningMessage, stepName, phase, isFatal ? 'error' : 'warning');
    
    // If we have stack trace and it's a fatal error, record it too
    if (isFatal && errorStack) {
      workflowState.addWarning(`Stack trace: ${errorStack.split('\n')[1].trim()}`, stepName, phase, 'debug');
    }
    
    // Capture the error
    const captureResult = maybeCaptureLargeError(errorInfo);
    
    // Execute appropriate error strategy
    const strategyResult = executeErrorStrategy(errorInfo);
    
    // Track error in workflow state
    workflowState.trackError(error, stepName, isFatal);
    
    // Complete step tracking
    workflowState.completeStep(stepName, { 
      success: !isFatal,
      error: isFatal ? errorMessage : null,
      strategy: strategyResult.action,
      duration: Date.now() - startTime
    });
    
    // Return result
    return {
      handled: true,
      errorInfo,
      captured: captureResult.captured,
      strategyResult,
      shouldExit: isFatal,
      shouldRetry
    };
  } catch (handlerError) {
    // Error happened while handling error - log but don't recurse
    logger.error(`Error while handling error: ${handlerError.message}`);
    
    // Record meta-error in workflow
    workflowState.addWarning(`Meta-error: Error occurred while handling another error: ${handlerError.message}`, 
      stepName, phase, 'error');
    
    // Complete step tracking with failure
    workflowState.completeStep(stepName, { 
      success: false, 
      error: handlerError.message,
      metaError: true,
      duration: Date.now() - startTime
    });
    
    return {
      handled: false,
      errorInfo: {
        message: errorMessage,
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        isFatal: true
      },
      shouldExit: true,
      shouldRetry: false
    };
  }
}

export default {
  createErrorInfo,
  logErrorDetails,
  maybeCaptureLargeError,
  executeErrorStrategy,
  handleError,
  handleErrorWithWorkflowTracking
}; 