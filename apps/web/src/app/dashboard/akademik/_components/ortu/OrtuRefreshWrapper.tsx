'use client';

// OrtuRefreshWrapper — Client component wrapper that provides polling-based
// data refresh for the Ortu dashboard (60s interval).
//
// Wraps OrtuWorkspace and injects DataRefreshIndicator above the workspace.
// When the poll fires, router.refresh() triggers the server component to
// re-fetch all data without a full page reload.

import { type ReactNode } from 'react';
import { useDataRefresh } from '@/hooks/use-data-refresh';
import { DataRefreshIndicator } from '@/components/ui/data-refresh-indicator';

interface OrtuRefreshWrapperProps {
  children: ReactNode;
}

export default function OrtuRefreshWrapper({ children }: OrtuRefreshWrapperProps) {
  const { lastRefreshed, isRefreshing, refresh, countdown } = useDataRefresh({
    intervalMs: 60_000, // 60 detik — Ortu tidak perlu realtime seperti Siswa
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
