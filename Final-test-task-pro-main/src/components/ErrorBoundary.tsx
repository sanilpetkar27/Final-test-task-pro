import React, { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}


// Note: Error boundaries do not catch async errors (Promise rejections, event handlers, setTimeout).
// For async failures, use try/catch and surface errors via toasts or inline UI.
class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('\u{1F534} Error Boundary caught an error:', {
      timestamp: new Date().toISOString(),
      error: error.toString(),
      message: error.message,
      stack: error.stack,
      errorInfo: errorInfo.componentStack,
      userAgent: navigator.userAgent,
    });

    this.setState({ errorInfo });

    // TODO: Send to error reporting service (Sentry, LogRocket, etc.)
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { hasError, error, errorInfo } = this.state;

    if (hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
          <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
              <AlertTriangle className="h-10 w-10 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Oops! Something went wrong</h1>
            <p className="mt-2 text-sm text-gray-600">
              We&apos;ve encountered an unexpected error. Please try refreshing the page.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Reload Page
              </button>
              <button
                type="button"
                onClick={() => (window.location.href = '/')}
                className="text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                Go to Dashboard
              </button>
            </div>

            {import.meta.env.DEV && error && (
              <details className="mt-6 text-left">
                <summary className="cursor-pointer text-sm text-gray-600">
                  Technical Details (Dev Only)
                </summary>
                <pre className="mt-2 max-h-56 overflow-auto rounded bg-gray-100 p-2 text-xs text-gray-700">
                  {error.toString()}
                  {errorInfo?.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return (
      <>
        {this.props.children}
      </>
    );
  }
}

export default ErrorBoundary;
