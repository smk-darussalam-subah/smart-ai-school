'use client';

// =============================================================================
// ViewAsSwitcher — pemilih "Masuk sebagai" untuk akun multi-role.
// Set cookie diis_view_as lalu refresh router → seluruh server component
// (sidebar, dashboard, halaman) merender ulang dengan effective role.
// =============================================================================

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  KEPALA_SEKOLAH: 'Kepala Sekolah',
  TATA_USAHA: 'Tata Usaha',
  GURU: 'Guru',
  SISWA: 'Siswa',
  ORANG_TUA: 'Orang Tua',
  INDUSTRI: 'Industri',
};

const COOKIE = 'diis_view_as';
const ASLI = '__all__';

export default function ViewAsSwitcher({
  realRoles,
  viewAs,
}: {
  realRoles: string[];
  viewAs: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (realRoles.length < 2) return null;

  const apply = (value: string) => {
    if (value === ASLI) {
      document.cookie = `${COOKIE}=; path=/; max-age=0; samesite=lax`;
    } else {
      document.cookie = `${COOKIE}=${value}; path=/; max-age=86400; samesite=lax`;
    }
    startTransition(() => router.refresh());
  };

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">
        Masuk sebagai
      </p>
      <Select value={viewAs ?? ASLI} onValueChange={apply} disabled={pending}>
        <SelectTrigger className="h-8 text-xs" aria-label="Pilih peran tinjau">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ASLI}>Semua peran (asli)</SelectItem>
          {realRoles.map((r) => (
            <SelectItem key={r} value={r}>{ROLE_LABELS[r] ?? r}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
