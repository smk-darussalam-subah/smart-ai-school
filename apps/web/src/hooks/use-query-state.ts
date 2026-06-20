'use client';

// useQueryState — URL sebagai sumber kebenaran untuk pagination/sort/filter/search.
// Server Component membaca searchParams → re-fetch; komponen klien memanggil
// setParams() untuk memperbarui URL (soft navigation, tanpa scroll). Reusable utk
// semua tabel data (Data Siswa, Pengguna, RPP, dst).

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useTransition } from 'react';

/** Nilai yang dianggap "kosong" → param dihapus dari URL agar bersih. */
const EMPTY = new Set(['', 'all', 'semua']);

export function useQueryState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const get = useCallback(
    (key: string, fallback = '') => searchParams.get(key) ?? fallback,
    [searchParams],
  );

  /**
   * Perbarui beberapa param sekaligus. Nilai null/kosong/'all' → hapus param.
   * Mengubah salah satu filter/sort/search akan mereset halaman ke 1, KECUALI
   * saat hanya mengubah 'page' itu sendiri.
   */
  const setParams = useCallback(
    (updates: Record<string, string | number | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      const onlyPage = Object.keys(updates).length === 1 && 'page' in updates;
      for (const [k, raw] of Object.entries(updates)) {
        const v = raw === null ? '' : String(raw);
        if (EMPTY.has(v)) params.delete(k);
        else params.set(k, v);
      }
      if (!onlyPage) params.delete('page'); // filter/sort/search berubah → kembali ke hal 1
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [router, pathname, searchParams],
  );

  return { get, setParams, isPending };
}
