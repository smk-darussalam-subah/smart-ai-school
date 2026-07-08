'use client';

// SiswaRefreshWrapper — Client component wrapper that provides polling-based
// data refresh for the Siswa dashboard (30s interval).
//
// Wraps SiswaWorkspace and injects DataRefreshIndicator above the workspace.
// When the poll fires, router.refresh() triggers the server component to
// re-fetch all data without a full page reload.

import { type ReactNode } from 'react';
import { useDataRefresh } from '@/hooks/use-data-refresh';
import { DataRefreshIndicator } from '@/components/ui/data-refresh-indicator';

interface SiswaRefreshWrapperProps {
  children: ReactNode;
}

export default function SiswaRefreshWrapper({ children }: SiswaRefreshWrapperProps) {
  const { lastRefreshed, isRefreshing, refresh, countdown } = useDataRefresh({
    intervalMs: 30_000, // 30 detik — Siswa needs near-realtime
  });

  return (
    <>
      <DataRefreshIndicator
        lastRefreshed={lastRefreshed}
        isRefreshing={isRefreshing}
        onRefresh={refresh}
        countdown={countdown}
      />
      {children}
    </>
  );
}
