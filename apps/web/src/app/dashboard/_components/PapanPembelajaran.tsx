'use client';

// =============================================================================
// PapanPembelajaran (2L-B2, Fase 1) — matriks rombel × JP (1–8) untuk hari ini.
// Sumber data NYATA: GET /schedules?dayOfWeek=<hari ini> (jadwal terencana).
//
// Fase 1 menampilkan: ada jadwal (emerald) vs tidak ada jadwal (abu) + detail
// guru/mapel/ruang saat hover. Status EKSEKUSI (terisi/tugas/kosong = hijau/
// kuning/merah) dan absensi per-JP adalah Fase 2 (butuh modul KBM) — TIDAK
// ditampilkan di sini agar tak ada warna/angka palsu.
// =============================================================================

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Card } from '@/components/ui/card';
import { LayoutGrid } from 'lucide-react';
import { JP_SLOTS, JP_COUNT, jpStartLabel, wibNow, currentJp } from '@/lib/bell-times';

export interface PapanCell {
  subject: string;
  teacher: string;
  room: string | null;
}
export interface PapanRow {
  classId: string;
  className: string;
  cells: (PapanCell | null)[]; // panjang = JP_COUNT, index 0 = JP1
}

export default function PapanPembelajaran({ rows, dayLabel }: { rows: PapanRow[]; dayLabel: string }) {
  // JP berjalan dihitung di klien (WIB) agar konsisten & tak memicu mismatch SSR.
  const [nowJp, setNowJp] = useState(0);
  useEffect(() => {
    const tick = () => setNowJp(currentJp(wibNow().minutes));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="font-semibold text-gray-800 flex items-center gap-2 text-sm">
            <LayoutGrid className="w-[18px] h-[18px] text-smk-emerald" /> Papan Pembelajaran — {dayLabel}
          </h2>
          <p className="text-xs text-gray-400">Jadwal terencana hari ini. Arahkan kursor ke sel untuk guru, mapel, dan ruang.</p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" /> Ada jadwal</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-gray-200 inline-block" /> Tidak ada jadwal</span>
          <span className="text-[9px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Status eksekusi: Fase 2</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400">
          Tidak ada jadwal pelajaran untuk hari ini.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            {/* Header JP */}
            <div className="flex items-center gap-1 mb-1.5">
              <div className="w-20 shrink-0" />
              {JP_SLOTS.map((s) => (
                <div
                  key={s.jp}
                  className={clsx(
                    'flex-1 text-center',
                    s.jp === nowJp ? 'text-emerald-700' : 'text-gray-400',
                  )}
                >
                  <div className="text-[10px] font-semibold leading-none">JP{s.jp}</div>
                  <div className="text-[9px] leading-none mt-0.5">{jpStartLabel(s.jp)}</div>
                </div>
              ))}
            </div>

            {/* Baris rombel */}
            <div className="space-y-1.5">
              {rows.map((row) => (
                <div key={row.classId} className="flex items-center gap-1">
                  <div className="w-20 shrink-0 text-xs font-medium text-gray-600 truncate" title={row.className}>
                    {row.className}
                  </div>
                  {Array.from({ length: JP_COUNT }, (_, i) => {
                    const cell = row.cells[i] ?? null;
                    const jp = i + 1;
                    const title = cell
                      ? `JP${jp} (${jpStartLabel(jp)}) · ${cell.subject} · ${cell.teacher}${cell.room ? ` · ${cell.room}` : ''}`
                      : `JP${jp} · Tidak ada jadwal`;
                    return (
                      <div
                        key={jp}
                        title={title}
                        className={clsx(
                          'flex-1 h-8 rounded-md flex items-center justify-center px-1 overflow-hidden',
                          cell ? 'bg-emerald-500/90 text-white' : 'bg-gray-100',
                          jp === nowJp && 'ring-2 ring-emerald-700 ring-offset-1',
                        )}
                      >
                        {cell && (
                          <span className="text-[9px] font-medium leading-none truncate">{cell.subject}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
