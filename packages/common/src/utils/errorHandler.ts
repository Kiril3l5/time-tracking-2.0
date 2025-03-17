/**
 * Global error handling utility
 * This can be expanded with error logging services like Sentry
 */

// Error severity levels
export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  FATAL = 'fatal',
}

// Error context information
interface ErrorContext {
  userId?: string;
  component?: string;
  action?: string;
  additionalData?: Record<string, unknown>;
}

/**
 * Log an error to the console and potentially to an error tracking service
 */
export function logError(
  error: Error | string,
  severity: ErrorSeverity = ErrorSeverity.ERROR,
  context: ErrorContext = {}
): void {
  const errorObj = typeof error === 'string' ? new Error(error) : error;

  // Always log to console in development
  if (process.env.NODE_ENV !== 'production') {
    console.group(`[${severity.toUpperCase()}] Error Logged`);
    console.error('Error:', errorObj);
    console.info('Context:', context);
    console.groupEnd();
  }

  // In production, we could send this to an error tracking service
  if (process.env.NODE_ENV === 'production') {
    // Example integration with error tracking service (replace with actual implementation)
    // sendToErrorTrackingService(errorObj, severity, context);
  }
}

/**
 * Set up global error handlers for unhandled exceptions and promise rejections
 */
export function setupGlobalErrorHandlers(): void {
  // Handle all uncaught exceptions
  window.addEventListener('error', event => {
    logError(event.error || new Error(event.message), ErrorSeverity.FATAL, {
      action: 'global_uncaught_exception',
      additionalData: {
        fileName: event.filename,
        lineNumber: event.lineno,
        columnNumber: event.colno,
      },
    });
  });

  // Handle all unhandled promise rejections
  window.addEventListener('unhandledrejection', event => {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));

    logError(error, ErrorSeverity.ERROR, {
      action: 'unhandled_promise_rejection',
      additionalData: {
        reason: event.reason,
      },
    });
  });
}

/**
 * Create an async error handler that catches and logs errors from async functions
 */
export function createAsyncErrorHandler<T extends (...args: any[]) => Promise<any>>(
  asyncFn: T,
  context: ErrorContext = {}
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    try {
      return await asyncFn(...args);
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        ErrorSeverity.ERROR,
        context
      );
      throw error;
    }
  };
}
