'use client';

import { useEffect, useRef } from 'react';
import { heartbeatAction } from '@/app/dashboard/actions';

/**
 * HeartbeatProvider — sends heartbeat every 60s to update lastSeenAt.
 * Placed in dashboard layout so it runs for all authenticated users.
 * Uses server action (no API URL or token exposed in browser).
 */
export function HeartbeatProvider({ children }: { children: React.ReactNode }) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Immediate first beat
    heartbeatAction();

    // Then every 60 seconds
    intervalRef.current = setInterval(() => {
      heartbeatAction();
    }, 60_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return <>{children}</>;
}
