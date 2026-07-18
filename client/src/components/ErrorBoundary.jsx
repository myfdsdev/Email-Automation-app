import * as React from 'react';
import { Button } from '@/components/ui/button';

/**
 * Catches render-time errors from any descendant so one crashing component shows a
 * recoverable message instead of unmounting the whole app to a blank screen.
 * (A Rules-of-Hooks violation in a single page previously blanked everything.)
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Unhandled UI error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            This page hit an unexpected error. Reloading usually clears it.
          </p>
          {import.meta.env.DEV && (
            <pre className="text-left text-xs bg-muted rounded-md p-3 overflow-auto max-h-48">
              {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
            </pre>
          )}
          <div className="flex items-center justify-center gap-2">
            <Button onClick={() => window.location.reload()}>Reload</Button>
            <Button variant="outline" onClick={() => { window.location.href = '/dashboard'; }}>
              Go to dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
