import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

/**
 * Error Boundary component that catches JavaScript errors anywhere in the child component tree
 * Logs errors and displays a fallback UI instead of crashing the entire app
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details to console
    console.error('Error Boundary caught an error:', error, errorInfo);

    // Store error info in state
    this.setState({
      error,
      errorInfo
    });

    // Call optional onError callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleClearStorage = () => {
    if (confirm('This will clear all saved data and reload the page. Continue?')) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="h-screen w-screen bg-gray-900 text-gray-200 flex items-center justify-center p-8">
          <div className="max-w-2xl w-full bg-gray-800 rounded-lg shadow-2xl p-8 border border-red-500/30">
            <div className="flex items-center mb-6">
              <svg className="w-12 h-12 text-red-500 mr-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h1 className="text-3xl font-bold text-red-500">Something Went Wrong</h1>
            </div>

            <p className="text-gray-300 mb-6 text-lg">
              The application encountered an unexpected error. Don't worry, your work may still be recoverable.
            </p>

            {/* Error details (collapsible) */}
            <details className="mb-6 bg-gray-900/50 rounded p-4 border border-gray-700">
              <summary className="cursor-pointer text-gray-400 hover:text-gray-200 font-medium mb-2">
                View Technical Details
              </summary>
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-red-400 mb-1">Error:</p>
                  <pre className="text-xs bg-black/30 p-3 rounded overflow-x-auto text-red-300">
                    {this.state.error?.toString()}
                  </pre>
                </div>
                {this.state.errorInfo && (
                  <div>
                    <p className="text-sm font-semibold text-yellow-400 mb-1">Component Stack:</p>
                    <pre className="text-xs bg-black/30 p-3 rounded overflow-x-auto text-yellow-300">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </div>
                )}
              </div>
            </details>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={this.handleReset}
                className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-medium transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded font-medium transition-colors"
              >
                Reload Page
              </button>
              <button
                onClick={this.handleClearStorage}
                className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded font-medium transition-colors"
              >
                Clear Data & Reset
              </button>
              <button
                onClick={() => {
                  const errorText = `Error: ${this.state.error?.toString()}\n\nStack: ${this.state.errorInfo?.componentStack}`;
                  navigator.clipboard.writeText(errorText);
                  this.setState({ copied: true });
                  setTimeout(() => this.setState({ copied: false }), 2000);
                }}
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded font-medium transition-colors"
              >
                {this.state.copied ? '✓ Copied!' : 'Copy Error Details'}
              </button>
            </div>

            {/* Helpful tips */}
            <div className="mt-6 p-4 bg-blue-900/20 border border-blue-500/30 rounded">
              <p className="text-sm text-blue-300">
                <strong>Tip:</strong> If this error persists, try clearing your browser cache or using "Clear Data & Reset" above.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
