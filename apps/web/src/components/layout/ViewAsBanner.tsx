'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin', KEPALA_SEKOLAH: 'Kepala Sekolah', TATA_USAHA: 'Tata Usaha',
  GURU: 'Guru', SISWA: 'Siswa', ORANG_TUA: 'Orang Tua', INDUSTRI: 'Industri',
};

export default function ViewAsBanner({ viewAs }: { viewAs: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 bg-amber-50 border-b border-amber-200 px-6 py-2 text-sm text-amber-900"
    >
      <span>
        👁 Mode tinjau: Anda melihat dashboard sebagai{' '}
        <strong>{ROLE_LABELS[viewAs] ?? viewAs}</strong>. RBAC API tetap memakai peran asli.
      </span>
      <button
        className="shrink-0 rounded border border-amber-300 px-2 py-1 text-xs font-medium hover:bg-amber-100 disabled:opacity-50"
        disabled={pending}
        onClick={() => {
          document.cookie = 'diis_view_as=; path=/; max-age=0; samesite=lax';
          startTransition(() => router.refresh());
        }}
      >
        Kembali ke peran asli
      </button>
    </div>
  );
}
