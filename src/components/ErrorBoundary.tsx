import { Component, type ErrorInfo, type ReactNode } from 'react';
import { wasFrameActive } from '@/frame/frameSession';

interface Props {
  children: ReactNode;
  /** Compact fallback (used inside the frame so one broken mode never blanks the whole frame). */
  compact?: boolean;
  onReset?: () => void;
}
interface State {
  error: Error | null;
}

const COMPACT_RETRY_MS = 10_000;
const ROOT_RELOAD_MS = 60_000;

/**
 * Appliance-grade error boundary: it shows what went wrong but never waits forever for a human.
 * - compact (inside the frame): retries rendering automatically after 10 s.
 * - root: if the frame was running unattended, reloads the page after 60 s (the frame auto-resumes).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  private timer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ui] render error', error, info.componentStack);
    this.clearTimer();
    if (this.props.compact) {
      this.timer = setTimeout(this.reset, COMPACT_RETRY_MS);
    } else if (wasFrameActive()) {
      this.timer = setTimeout(() => window.location.reload(), ROOT_RELOAD_MS);
    }
  }

  componentWillUnmount(): void {
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  reset = (): void => {
    this.clearTimer();
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    if (this.props.compact) {
      return (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'rgba(244,236,225,.6)', textAlign: 'center', padding: 40 }}>
          <div>
            <div style={{ fontSize: 28, fontFamily: 'var(--serif)', marginBottom: 12 }}>This view hit a snag</div>
            <div style={{ fontSize: 16, marginBottom: 16 }}>{this.state.error.message}</div>
            <div style={{ fontSize: 14, marginBottom: 16, opacity: 0.7 }}>Retrying automatically in a few seconds.</div>
            <button type="button" className="btn" onClick={this.reset}>Try again now</button>
          </div>
        </div>
      );
    }
    return (
      <div className="error-screen">
        <div className="card stack">
          <h2>Something went wrong</h2>
          <p className="muted">{this.state.error.message}</p>
          {wasFrameActive() && <p className="small faint">The frame will reload itself in about a minute.</p>}
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={this.reset}>Try again</button>
            <button type="button" className="btn" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      </div>
    );
  }
}
