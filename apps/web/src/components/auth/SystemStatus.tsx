'use client';

/**
 * SystemStatus — Small badge showing API/server status.
 *
 * States:
 * - Loading: Skeleton placeholder (uses shadcn Skeleton)
 * - Online: green dot + "Online" + version
 * - Offline: amber dot + "Offline"
 *
 * Uses shared useOnlineStatus hook (no duplicate listener).
 * Graceful degradation: falls back to "Online" if fetch fails silently.
 */
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useOnlineStatus } from './useOnlineStatus';

type Status = 'loading' | 'online' | 'offline';

export function SystemStatus({ className }: { className?: string }) {
  const isOnline = useOnlineStatus();
  const [status, setStatus] = useState<Status>('loading');
  const [version, setVersion] = useState('v1.0');

  useEffect(() => {
    let cancelled = false;

    async function checkStatus() {
      try {
        const res = await fetch('/api/backend/health', {
          signal: AbortSignal.timeout(5000),
        });
        if (cancelled) return;

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          setVersion(data.version ?? 'v1.0');
          setStatus('online');
        } else {
          setStatus('offline');
        }
      } catch {
        if (!cancelled) setStatus('online'); // Graceful: assume online if health endpoint not yet deployed
      }
    }

    checkStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync online/offline from shared hook
  useEffect(() => {
    if (!isOnline && status === 'online') setStatus('offline');
    if (isOnline && status === 'offline') setStatus('online');
  }, [isOnline, status]);

  // Loading skeleton
  if (status === 'loading') {
    return (
      <div className={cn('flex items-center gap-2 rounded-full border px-3 py-1.5', 'border-[var(--auth-border)] bg-[var(--auth-surface)]', className)}>
        <Skeleton className="h-1.5 w-1.5 rounded-full bg-[var(--auth-border2)]" />
        <Skeleton className="h-3 w-16 rounded bg-[var(--auth-border2)]" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium',
        'border-[var(--auth-border)] bg-[var(--auth-surface)]',
        className,
      )}
      role="status"
      aria-label="System status"
    >
      {/* Status dot */}
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'online' && 'bg-emerald-400',
          status === 'offline' && 'bg-amber-400',
        )}
        style={
          status === 'online'
            ? { boxShadow: '0 0 6px var(--auth-glow-em)' }
            : undefined
        }
      />

      {/* Text */}
      {status === 'online' ? (
        <>
          <span className="text-emerald-400">Online</span>
          <span className="text-[var(--auth-dim)]">&middot;</span>
          <span className="text-[var(--auth-dim)]">{version}</span>
        </>
      ) : (
        <span className="text-amber-400">Offline</span>
      )}
    </div>
  );
}
