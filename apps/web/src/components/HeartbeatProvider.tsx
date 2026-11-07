'use client';

import { useEffect, useRef } from 'react';
import { postSessionActivity } from '@/lib/session-activity-client';

/**
 * HeartbeatProvider — sends heartbeat every 60s to update lastSeenAt.
 * Placed in dashboard layout so it runs for all authenticated users.
 * Uses a same-origin JSON endpoint so bookkeeping cannot re-render a redirect.
 */
export function HeartbeatProvider({ children }: { children: React.ReactNode }) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    // Immediate first beat
    void postSessionActivity('heartbeat', controller.signal);

    // Then every 60 seconds
    intervalRef.current = setInterval(() => {
      void postSessionActivity('heartbeat', controller.signal);
    }, 60_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      controller.abort();
    };
  }, []);

  return <>{children}</>;
}
