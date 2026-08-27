'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Eye } from 'lucide-react';

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
      <span className="flex items-center gap-2">
        <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Mode tinjau: Anda melihat dashboard sebagai{' '}
        <strong>{ROLE_LABELS[viewAs] ?? viewAs}</strong>. RBAC API tetap memakai peran asli.
        </span>
      </span>
      <button
        className="min-h-11 shrink-0 rounded-lg border border-amber-400 px-3 text-xs font-semibold hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-800 focus-visible:ring-offset-2 disabled:opacity-50"
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
