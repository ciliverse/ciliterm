import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** Shown to the user as "<label> unavailable". */
  label: string;
  className?: string;
  children: ReactNode;
}

interface State {
  message: string | null;
}

/**
 * Keeps one panel's failure inside that panel.
 *
 * The eye-candy panels are the ones that reach for hardware the host may not
 * have — the globe needs a WebGL context, and machines behind RDP, in a VM or
 * on a blocklisted driver simply do not get one. Without a boundary that throw
 * unmounts the whole app and leaves an empty window, which for a terminal is
 * the worst possible failure: the shell still works, the user just cannot see it.
 */
export class PanelErrorBoundary extends Component<Props, State> {
  override state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`[ciliterm] ${this.props.label} panel failed:`, error, info.componentStack);
  }

  override render(): ReactNode {
    const { message } = this.state;
    if (message === null) return this.props.children;

    return (
      <div className={this.props.className ?? 'panel globe-panel globe-loading'}>
        <div className="panel-error">
          <div className="panel-error-title">{this.props.label} unavailable</div>
          <div className="panel-error-detail">{message}</div>
        </div>
      </div>
    );
  }
}
