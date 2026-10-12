'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ParentChildrenState } from '@/lib/parent-children';

/** Explain identity access independently of schedule or class placement. */
export default function ParentChildrenNotice({ state }: { state: ParentChildrenState }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (state === 'ready') return null;
  const message = state === 'denied'
    ? 'Akses data anak tidak diizinkan. Hubungi admin sekolah untuk memeriksa izin akun Anda.'
    : state === 'empty'
      ? 'Belum ada anak yang terhubung ke akun Anda. Hubungi admin sekolah untuk memeriksa hubungan akun.'
      : 'Data anak belum dapat dimuat. Coba muat ulang; data kelas belum dapat dipastikan.';
  return (
    <div role={state === 'error' ? 'alert' : 'status'} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--text)]">
      <p>{message}</p>
      {state === 'error' && (
        <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())}
          className="mt-2 min-h-11 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-[var(--bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60">
          {pending ? 'Memuat data anak…' : 'Muat ulang data anak'}
        </button>
      )}
    </div>
  );
}
