'use client';

// useDataRefresh — Polling-first client-side data refresh for Siswa/Ortu dashboards.
//
// FUTURE: Replace polling with SSE when backend implements grade event stream.
// Migration path:
//   1. Backend: Add SSE endpoint GET /grades/stream (similar to assessment/:id/stream)
//   2. Backend: Add listener on EVENTS.GRADE_SUBMITTED → push to SSE subscribers
//   3. Frontend: Replace useDataRefresh polling with EventSource consumer
//   4. Hook interface stays the same — only internal implementation changes
//
// SSE-ready interfaces for future upgrade:
//   interface SseGradeEvent { type: 'grade.submitted'; payload: GradeSubmittedPayload; }
//   interface SseRefreshConsumer { connect(): void; disconnect(): void; onRefresh(cb: () => void): void; }

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface UseDataRefreshOptions {
  /** Polling interval in milliseconds. Default: 30000 (30 detik). */
  intervalMs?: number;
  /** Enable/disable polling. Default: true. */
  enabled?: boolean;
  /** Callback invoked after each successful refresh. */
  onRefresh?: () => void;
}

export interface UseDataRefreshReturn {
  /** Timestamp of the last successful refresh, or null if never refreshed. */
  lastRefreshed: Date | null;
  /** True while a refresh is in progress. */
  isRefreshing: boolean;
  /** Manually trigger a refresh. Returns a promise that resolves when done. */
  refresh: () => Promise<void>;
  /** Seconds remaining until the next auto-refresh. */
  countdown: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Returns true if the user is currently interacting with a form element. */
function isFormActive(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useDataRefresh(
  options: UseDataRefreshOptions = {},
): UseDataRefreshReturn {
  const { intervalMs = 30_000, enabled = true, onRefresh } = options;

  const router = useRouter();
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(Math.floor(intervalMs / 1000));

  // Refs to avoid stale closures in interval callbacks
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const enabledRef = useRef(enabled);
  const intervalMsRef = useRef(intervalMs);
  const onRefreshRef = useRef(onRefresh);

  // Keep refs in sync
  enabledRef.current = enabled;
  intervalMsRef.current = intervalMs;
  onRefreshRef.current = onRefresh;

  // ── refresh (manual or auto) ─────────────────────────────────────────────

  const refresh = useCallback(async (): Promise<void> => {
    if (isFormActive()) return; // Don't refresh while user is typing

    setIsRefreshing(true);
    try {
      router.refresh();
      const now = new Date();
      setLastRefreshed(now);
      setCountdown(Math.floor(intervalMsRef.current / 1000));
      onRefreshRef.current?.();
    } finally {
      setIsRefreshing(false);
    }
  }, [router]);

  // ── Polling lifecycle ────────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;

    const startPolling = (): void => {
      // Clear any existing intervals first
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);

      // Reset countdown
      setCountdown(Math.floor(intervalMsRef.current / 1000));

      // Countdown tick every second
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          const next = prev - 1;
          if (next <= 0) return Math.floor(intervalMsRef.current / 1000);
          return next;
        });
      }, 1000);

      // Auto-refresh at the configured interval
      intervalRef.current = setInterval(() => {
        if (!enabledRef.current) return;
        if (document.visibilityState === 'hidden') return;
        if (isFormActive()) return;
        refresh();
      }, intervalMsRef.current);
    };

    const stopPolling = (): void => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };

    // ── Visibility change handler ────────────────────────────────────────

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        // Resume: restart polling from a fresh countdown
        startPolling();
      } else {
        // Pause: stop all intervals
        stopPolling();
      }
    };

    // Start polling initially
    startPolling();

    // Listen for tab visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, refresh]);

  return { lastRefreshed, isRefreshing, refresh, countdown };
}
