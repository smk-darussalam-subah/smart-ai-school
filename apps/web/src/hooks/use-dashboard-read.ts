'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardRead } from '@/lib/learner-dashboard-read';

/** A refresh belongs to one scope and one SSR snapshot; obsolete replies cannot replace either. */
export function useDashboardRead<T>(
  scope: string,
  initial: DashboardRead<T>,
  load: () => Promise<DashboardRead<T>>,
) {
  const [local, setLocal] = useState<{
    scope: string;
    initial: DashboardRead<T>;
    read: DashboardRead<T>;
  } | null>(null);
  const current = useRef({ scope, initial, request: 0, needsLoad: false, pending: false });
  const mounted = useRef(true);
  if (current.current.scope !== scope || current.current.initial !== initial) {
    current.current = {
      scope,
      initial,
      request: current.current.request + 1,
      needsLoad: current.current.scope !== scope,
      pending: false,
    };
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const retry = useCallback(async () => {
    const context = current.current;
    if (context.pending) return;
    context.pending = true;
    context.needsLoad = false;
    const request = ++context.request;
    setLocal({ scope, initial, read: { state: 'loading' } });
    let read: DashboardRead<T>;
    try {
      read = await load();
    } catch {
      read = { state: 'unavailable' };
    }
    if (mounted.current && current.current === context && context.request === request) {
      context.pending = false;
      setLocal({ scope, initial, read });
    }
  }, [scope, initial, load]);
  useEffect(() => {
    if (current.current.needsLoad) void retry();
  }, [retry]);
  return {
    read: current.current.needsLoad
      ? { state: 'loading' as const }
      : local?.scope === scope && local.initial === initial
        ? local.read
        : initial,
    retry,
  };
}
