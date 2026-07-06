import React from 'react';

interface ErrorBoundaryState {
  error: Error | null;
}

type ErrorBoundaryProps = React.PropsWithChildren<Record<string, never>>;

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare props: ErrorBoundaryProps;
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[app] render failed', error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-800/40 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-red-200 rounded-2xl p-6 shadow-xl shadow-slate-200/50">
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100">Dashboard failed to render</p>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
            Refresh the page. If it stays stuck, sign out and sign in again so the browser clears the old session.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-red-50 p-3 text-xs text-red-700 whitespace-pre-wrap">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
          >
            Reload dashboard
          </button>
        </div>
      </div>
    );
  }
}
