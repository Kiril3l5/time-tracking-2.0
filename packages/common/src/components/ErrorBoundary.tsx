import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logError } from '../utils/logging';

// Define props interface for ErrorBoundary
interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

// Define state interface
interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary component to catch JavaScript errors anywhere in the component tree
 * Displays a fallback UI instead of crashing the whole application
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  // Update state when error occurs
  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  // Log error details
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to console or service
    logError('Error caught by ErrorBoundary', { error, errorInfo });
    
    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render(): ReactNode {
    const { hasError } = this.state;
    const { children, fallback } = this.props;

    // If error occurred, render fallback UI
    if (hasError) {
      // If custom fallback provided, render it
      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <div className="error-boundary">
          <h2>Something went wrong.</h2>
          <p>Please try refreshing the page or contact support if the problem persists.</p>
        </div>
      );
    }

    // No error, render children normally
    return children;
  }
}

export default ErrorBoundary;

/**
 * HOC to wrap components with ErrorBoundary
 * @param Component The component to wrap
 * @param fallback Optional fallback UI
 * @param onError Optional error handler
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode,
  onError?: (error: Error, errorInfo: ErrorInfo) => void
) {
  const displayName = Component.displayName || Component.name || 'Component';

  function WithErrorBoundary(props: P): React.ReactElement {
    return (
      <ErrorBoundary fallback={fallback} onError={onError}>
        <Component {...props} />
      </ErrorBoundary>
    );
  }

  WithErrorBoundary.displayName = `WithErrorBoundary(${displayName})`;
  return WithErrorBoundary;
}

/**
 * Hook for handling errors in components that can't be wrapped with ErrorBoundary
 * @param onError Optional callback when an error occurs
 */
export function useErrorHandler(onError?: (error: Error) => void): (error: Error) => void {
  return (error: Error) => {
    logError('Error caught by useErrorHandler', { error });
    if (onError) {
      onError(error);
    }
    throw error; // This will be caught by the nearest ErrorBoundary
  };
}
