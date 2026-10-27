'use client';

import React from 'react';
import { AlertCircle, LockKeyhole, RefreshCw } from 'lucide-react';
import type { DashboardReadState } from '@/lib/learner-dashboard-read';

export default function DashboardReadNotice({
  state,
  domain,
  onRetry,
}: {
  state: DashboardReadState;
  domain: 'Tugas' | 'Pembayaran';
  onRetry?: () => void;
}) {
  if (state === 'ready') return null;
  const loading = state === 'loading';
  const denied = state === 'denied';
  const Icon = denied ? LockKeyhole : loading ? RefreshCw : AlertCircle;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div
        role={loading ? 'status' : 'alert'}
        aria-live={loading ? 'polite' : 'assertive'}
        className="flex items-start gap-3"
      >
        <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--muted)]" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--text)]">
            {loading
              ? `Memuat ${domain.toLowerCase()}…`
              : denied
                ? `${domain} tidak dapat diakses`
                : `${domain} belum dapat dimuat`}
          </p>
          {!loading && (
            <p className="mt-1 text-sm text-[var(--muted)]">
              {denied
                ? 'Akses akun mungkin berubah. Hubungi sekolah jika masih terjadi.'
                : 'Coba lagi untuk melihat data terbaru.'}
            </p>
          )}
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={loading}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-sm font-bold text-[var(--text)] hover:bg-[var(--surface2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          {loading ? 'Memuat…' : 'Coba lagi'}
        </button>
      )}
    </div>
  );
}
