'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { LearnerScheduleState } from '@/lib/learner-schedule';

/** A local schedule failure must not hide the rest of the academic dashboard. */
export default function LearnerScheduleNotice({ state }: { state: LearnerScheduleState }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (state === 'ready') return null;
  const message = state === 'denied'
    ? 'Anda belum memiliki izin melihat jadwal ini. Hubungi admin sekolah.'
    : state === 'unassigned'
      ? 'Kelas anak belum ditetapkan. Hubungi admin sekolah untuk melengkapi penempatan kelas.'
      : 'Jadwal belum dapat dimuat. Coba lagi; kondisi ini bukan berarti libur.';
  return (
    <div role={state === 'error' ? 'alert' : 'status'} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--text)]">
      <p>{message}</p>
      {state === 'error' && (
        <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())}
          className="mt-2 min-h-11 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold hover:bg-[var(--bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60">
          {pending ? 'Memuat jadwal…' : 'Muat ulang jadwal'}
        </button>
      )}
    </div>
  );
}
