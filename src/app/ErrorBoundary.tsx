import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Top-level safety net. Without this, an uncaught render error unmounts the entire
 * React tree, leaving a blank white page in production (no explanation at all) — the
 * app has no other global recovery path. This never replaces fixing the underlying
 * bug, but a broken tool shouldn't take down the whole editor with zero feedback.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Full detail to the console for developers; the UI only ever shows a plain message.
    console.error('GifForge crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-surface-0 p-8 text-center">
        <div className="text-2xl font-bold text-slate-100">
          Gif<span className="text-accent">Forge</span>
        </div>
        <p className="max-w-md text-sm text-slate-300">
          Something went wrong and GifForge needs to restart. Your last autosaved project is still on
          this device and will be offered back after reloading.
        </p>
        <button
          className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          onClick={() => window.location.reload()}
        >
          Reload GifForge
        </button>
      </div>
    )
  }
}
