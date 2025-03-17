import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logError } from '../utils/logging';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component to catch JavaScript errors in child components
 * and display a fallback UI instead of the component tree that crashed.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render shows the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error to an error reporting service
    logError('Error caught by ErrorBoundary:', { error, errorInfo });

    // Call the onError callback if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Render the fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="p-4 border border-red-300 rounded bg-red-50 text-red-700">
          <h2 className="text-lg font-semibold mb-2">Something went wrong.</h2>
          <p className="mb-4">We&apos;re sorry, but there was an error processing your request.</p>
          <p className="text-sm font-mono bg-red-100 p-2 rounded">
            {this.state.error?.message || 'Unknown error'}
          </p>
          <button
            className="btn btn-primary mt-4"
            onClick={() => {
              this.setState({ hasError: false });
              window.location.href = '/';
            }}
          >
            Return to home page
          </button>
        </div>
      );
    }

    // If there's no error, render the children
    return this.props.children;
  }
}
