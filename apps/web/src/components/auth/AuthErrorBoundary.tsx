'use client';

/**
 * AuthErrorBoundary — Catches render errors in the auth experience.
 *
 * Prevents "white screen of death" when a child component throws.
 * Shows a branded fallback card matching the auth aesthetic.
 *
 * Usage: Wrap AuthShell children (or AuthShell itself) in this boundary.
 */
import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AuthErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Client-side error logging — @smk/logger is server-side (Winston)
    console.error('[Auth] Render error:', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          data-auth-theme="dark"
          className="flex min-h-screen w-full items-center justify-center bg-[#060d1a] p-6"
        >
          <div className="glass-card w-full max-w-[400px] p-8 text-center">
            {/* Error icon */}
            <div className="mb-4 flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/15">
                <span className="text-2xl" role="img" aria-label="Error">
                  ⚠
                </span>
              </div>
            </div>

            <h2 className="font-fraunces text-lg font-bold text-[#e8eef5]">
              Terjadi Kesalahan
            </h2>
            <p className="mt-2 text-sm text-[#7a8ba0]">
              Halaman login mengalami masalah. Silakan muat ulang.
            </p>

            <button
              type="button"
              onClick={this.handleReload}
              className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
            >
              Coba Muat Ulang
            </button>

            <p className="mt-4 text-[11px] text-[#4a5b70]">
              Jika masalah berlanjut, hubungi administrator sekolah.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
