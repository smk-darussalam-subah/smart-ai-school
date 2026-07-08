'use client';

// DataRefreshIndicator — Minimal, non-intrusive data freshness indicator.
// WCAG 2.1 AA: aria-live, aria-label, keyboard accessible.
// Mobile: compact mode (icon-only with tooltip timestamp).

import { RefreshCw, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(date: Date): string {
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function formatCountdown(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

// ── Props ───────────────────────────────────────────────────────────────────

export interface DataRefreshIndicatorProps {
  /** Timestamp of the last refresh, or null if never refreshed. */
  lastRefreshed: Date | null;
  /** True while a refresh is in progress. */
  isRefreshing: boolean;
  /** Manually trigger a refresh. */
  onRefresh: () => void;
  /** Seconds remaining until the next auto-refresh. */
  countdown: number;
  /** Optional className for the wrapper. */
  className?: string;
}

// ── Component ───────────────────────────────────────────────────────────────

export function DataRefreshIndicator({
  lastRefreshed,
  isRefreshing,
  onRefresh,
  countdown,
  className,
}: DataRefreshIndicatorProps) {
  const timeLabel = lastRefreshed
    ? `Terakhir diperbarui: ${formatTime(lastRefreshed)}`
    : 'Belum diperbarui';

  // When countdown < 5 seconds, show nothing (avoid anxiety)
  const isNearRefresh = countdown > 0 && countdown < 5;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface)]/60 px-4 py-1.5 text-xs text-[var(--muted)] backdrop-blur-sm',
        // Mobile compact
        'sm:px-5 sm:py-2',
        className,
      )}
      aria-live="polite"
      aria-label={timeLabel}
      role="status"
    >
      {/* Left: timestamp + countdown */}
      <div className="flex items-center gap-2 min-w-0">
        <Clock className="h-3 w-3 shrink-0 text-[var(--muted)] sm:h-3.5 sm:w-3.5" aria-hidden="true" />

        {/* Desktop: full text */}
        <span className="hidden sm:inline truncate">
          {lastRefreshed ? (
            <>
              Diperbarui{' '}
              <time dateTime={lastRefreshed.toISOString()} className="font-semibold text-[var(--text)]">
                {formatTime(lastRefreshed)}
              </time>
              {!isNearRefresh && (
                <span className="ml-1 text-[var(--muted)]">
                  · berikutnya {formatCountdown(countdown)}
                </span>
              )}
            </>
          ) : (
            'Menunggu pembaruan pertama...'
          )}
        </span>

        {/* Mobile: compact — timestamp only, no countdown text */}
        <span className="sm:hidden truncate" title={timeLabel}>
          {lastRefreshed ? (
            <time dateTime={lastRefreshed.toISOString()} className="font-semibold text-[var(--text)]">
              {formatTime(lastRefreshed)}
            </time>
          ) : (
            '—'
          )}
        </span>
      </div>

      {/* Right: refresh button */}
      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        className={cn(
          'flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
          'hover:bg-[var(--surface2)] hover:text-[var(--text)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'text-[var(--muted)]',
        )}
        aria-label="Perbarui data"
        tabIndex={0}
      >
        {isRefreshing ? (
          <>
            <RefreshCw className="h-3 w-3 animate-spin sm:h-3.5 sm:w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Memperbarui...</span>
          </>
        ) : (
          <>
            <RefreshCw className="h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Segarkan</span>
          </>
        )}
      </button>
    </div>
  );
}
