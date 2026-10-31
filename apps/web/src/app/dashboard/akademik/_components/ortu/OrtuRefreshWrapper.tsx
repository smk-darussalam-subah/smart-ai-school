'use client';

import { type ReactNode, useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DataRefreshIndicator } from '@/components/ui/data-refresh-indicator';

interface OrtuRefreshWrapperProps {
  children: ReactNode;
  initialRevision?: string | null;
  initialScopeRevision?: string | null;
}

/** Check private metadata; only refresh the full parent page when needed. */
export default function OrtuRefreshWrapper({
  children,
  initialRevision = null,
  initialScopeRevision = null,
}: OrtuRefreshWrapperProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [error, setError] = useState(false);
  const [scopePending, setScopePending] = useState(false);
  const [denied, setDenied] = useState(false);
  const revision = useRef(initialRevision);
  const scopeRevision = useRef(initialScopeRevision);
  const inFlight = useRef(false);
  const lastFullRefresh = useRef(Date.now());
  useEffect(() => {
    revision.current = initialRevision;
    scopeRevision.current = initialScopeRevision;
    lastFullRefresh.current = Date.now();
    setScopePending(false);
    setDenied(false);
  }, [children, initialRevision, initialScopeRevision]);

  const refresh = useCallback(() => {
    if (!pending) startTransition(() => router.refresh());
  }, [pending, router]);

  useEffect(() => {
    if (denied) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const fallbackMs = 300_000 + Math.floor(Math.random() * 60_000);
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
          const response = await fetch('/api/backend/student-dashboard/parent-changes', {
            cache: 'no-store',
            signal: request.signal,
          });
          if (!stopped && (response.status === 401 || response.status === 403)) {
            // Withdraw obsolete private content while the new authorized page loads.
            setDenied(true);
            startTransition(() => router.refresh());
            return;
          }
          if (!response.ok) throw new Error('Changes unavailable');
          const body: unknown = await response.json();
          if (
            !body ||
            typeof body !== 'object' ||
            !('revision' in body) ||
            !('scopeRevision' in body) ||
            typeof body.revision !== 'string' ||
            !/^[a-f0-9]{64}$/.test(body.revision) ||
            typeof body.scopeRevision !== 'string' ||
            !/^[a-f0-9]{64}$/.test(body.scopeRevision)
          )
            throw new Error('Invalid revision');
          if (!stopped) {
            const scopeChanged = scopeRevision.current !== body.scopeRevision;
            if (scopeChanged) setScopePending(true);
            if (
              scopeChanged ||
              revision.current !== body.revision ||
              Date.now() - lastFullRefresh.current >= fallbackMs
            )
              startTransition(() => router.refresh());
            setCheckedAt(new Date());
            setError(false);
            // Only a new Server Component render can advance the accepted hashes.
          }
        } catch {
          if (!stopped) setError(true);
        } finally {
          clearTimeout(timeout);
          controller.signal.removeEventListener('abort', abort);
          inFlight.current = false;
        }
      }
      if (!stopped) timer = setTimeout(check, 60_000 + Math.floor(Math.random() * 30_000));
    };
    timer = setTimeout(check, 1000 + Math.floor(Math.random() * 14_000));
    return () => {
      stopped = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [denied, pending, router]);

  return (
    <>
      <DataRefreshIndicator lastRefreshed={checkedAt} isRefreshing={pending} onRefresh={refresh} />
      {error && !denied && (
        <p role="status" className="px-4 py-1 text-xs text-amber-700 dark:text-amber-300">
          Pembaruan belum dapat diperiksa. Data terakhir tetap ditampilkan.
        </p>
      )}
      {denied || scopePending ? (
        <p role="status" className="px-4 py-4 text-sm text-[var(--muted)]">
          {denied
            ? 'Akses data anak perlu diperiksa kembali. Muat ulang halaman untuk melanjutkan.'
            : 'Memperbarui data anak…'}
        </p>
      ) : (
        children
      )}
    </>
  );
}
