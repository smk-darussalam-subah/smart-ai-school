'use client';

import { type ReactNode, useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DataRefreshIndicator } from '@/components/ui/data-refresh-indicator';
import { LearningRefreshContext } from '@/lib/learning-refresh';

interface SiswaRefreshWrapperProps {
  children: ReactNode;
  initialRevision?: string | null;
}

export default function SiswaRefreshWrapper({
  children,
  initialRevision = null,
}: SiswaRefreshWrapperProps) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const [pending, startTransition] = useTransition();
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [error, setError] = useState(false);
  const revision = useRef<string | null>(initialRevision);
  const lastFullRefresh = useRef(Date.now());
  // Some shared presentation data (e.g. leaderboard names) is deliberately
  // outside the private revision. Retain a bounded, jittered fallback refresh.
  useEffect(() => {
    lastFullRefresh.current = Date.now();
  }, [children, initialRevision]);
  useEffect(() => {
    revision.current = initialRevision;
  }, [initialRevision]);
  const inFlight = useRef(false);
  const refresh = useCallback(() => {
    if (!paused && !pending) startTransition(() => router.refresh());
  }, [paused, pending, router]);

  useEffect(() => {
    if (paused) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const fallbackMs = 240_000 + Math.floor(Math.random() * 60_000);
    const check = async () => {
      const editing = document.activeElement?.matches(
        'input, textarea, select, [contenteditable="true"]',
      );
      if (
        !inFlight.current &&
        !pending &&
        document.visibilityState === 'visible' &&
        !editing &&
        navigator.onLine
      ) {
        inFlight.current = true;
        const request = new AbortController();
        const abort = () => request.abort();
        controller.signal.addEventListener('abort', abort, { once: true });
        const timeout = setTimeout(abort, 8000);
        try {
          const response = await fetch('/api/backend/student-dashboard/changes', {
            cache: 'no-store',
            signal: request.signal,
          });
          if (!stopped && (response.status === 401 || response.status === 403))
            startTransition(() => router.refresh());
          if (!response.ok) throw new Error('Changes unavailable');
          const body: unknown = await response.json();
          if (
            !body ||
            typeof body !== 'object' ||
            !('revision' in body) ||
            typeof body.revision !== 'string' ||
            !/^[a-f0-9]{64}$/.test(body.revision)
          )
            throw new Error('Invalid revision');
          if (!stopped) {
            if (
              revision.current !== body.revision ||
              Date.now() - lastFullRefresh.current >= fallbackMs
            )
              startTransition(() => router.refresh());
            setCheckedAt(new Date());
            setError(false);
          }
        } catch {
          if (!stopped) setError(true);
        } finally {
          clearTimeout(timeout);
          controller.signal.removeEventListener('abort', abort);
          inFlight.current = false;
        }
      }
      if (!stopped) timer = setTimeout(check, 30_000 + Math.floor(Math.random() * 10_000));
    };
    timer = setTimeout(check, 1000 + Math.floor(Math.random() * 10_000));
    return () => {
      stopped = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [paused, pending, router]);

  return (
    <LearningRefreshContext.Provider value={setPaused}>
      {paused ? (
        <p className="px-4 py-2 text-xs text-[var(--muted)]" role="status">
          Pembaruan ringkasan dijeda selama pengerjaan. Jawaban tetap disimpan.
        </p>
      ) : (
        <>
          <DataRefreshIndicator
            lastRefreshed={checkedAt}
            isRefreshing={pending}
            onRefresh={refresh}
          />
          {error && (
            <p role="status" className="px-4 py-1 text-xs text-amber-700 dark:text-amber-300">
              Pembaruan belum dapat diperiksa. Data terakhir tetap ditampilkan.
            </p>
          )}
        </>
      )}
      {children}
    </LearningRefreshContext.Provider>
  );
}
