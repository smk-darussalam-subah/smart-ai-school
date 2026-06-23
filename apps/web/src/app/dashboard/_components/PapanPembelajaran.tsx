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

// ── Mapel abbreviation (compact cell labels) ──────────────────────────────────
const MAPEL_ABBREV: Record<string, string> = {
  'Matematika': 'Mtk', 'B.Indonesia': 'BInd', 'Bahasa Indonesia': 'BInd',
  'B.Inggris': 'BIng', 'Bahasa Inggris': 'BIng', 'Pendidikan Agama': 'PAg',
  'PKN': 'PKn', 'PKn': 'PKn', 'Penjaskes': 'Penj', 'PJOK': 'Penj',
  'Pemrograman Web': 'PemWeb', 'Pemrograman Dasar': 'PemDas', 'Pemrograman': 'Pem',
  'Basis Data': 'BasDat', 'Jaringan Komputer': 'JarKom', 'Jaringan': 'Jar',
  'Sistem Operasi': 'SysOp', 'Desain Grafis': 'DesGra',
  'Akuntansi Dasar': 'AkdDas', 'Akuntansi': 'Akd', 'Akun': 'Akd',
  'Perpajakan': 'Pjk', 'Perbankan': 'Pbk', 'Motor Bensin': 'MotBen',
  'Kelistrikan Otomotif': 'KelOto', 'Chasis & Pemindah Daya': 'ChaPem',
  'Teknik Sepeda Motor': 'TekSep', 'Seni': 'Seni', 'IPA': 'IPA',
};
function mpAbbrev(mp: string): string {
  return MAPEL_ABBREV[mp] ?? (mp.length <= 6 ? mp : mp.slice(0, 6));
}

export default function PapanPembelajaran({ rows, dayLabel, onCellClick, absenPerJp, onAbsenClick }: { rows: PapanRow[]; dayLabel: string; onCellClick?: (row: PapanRow, jp: number, cell: PapanCell) => void; absenPerJp?: (number | null)[]; onAbsenClick?: (jp: number) => void }) {
  // JP berjalan dihitung di klien (WIB) agar konsisten & tak memicu mismatch SSR.
  const [nowJp, setNowJp] = useState(0);
  useEffect(() => {
    const tick = () => setNowJp(currentJp(wibNow().minutes));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Card className="p-4 h-full flex flex-col">
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
        <div className="overflow-x-auto flex-1 min-h-0">
          <div className="min-w-[520px] h-full flex flex-col">
            {/* Header JP */}
            <div className="flex items-center gap-1 mb-1.5">
              <div className="w-16 shrink-0" />
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
            <div className="flex-1 min-h-0 flex flex-col gap-1">
              {rows.map((row) => (
                <div key={row.classId} className="flex-1 min-h-0 flex items-center gap-1">
                  <div className="w-16 shrink-0 text-[11px] font-medium text-gray-600 truncate" title={row.className}>
                    {row.className}
                  </div>
                  {Array.from({ length: JP_COUNT }, (_, i) => {
                    const cell = row.cells[i] ?? null;
                    const jp = i + 1;
                    const tipText = cell
                      ? `JP${jp} (${jpStartLabel(jp)}) · ${cell.subject} · ${cell.teacher}${cell.room ? ` · ${cell.room}` : ''}`
                      : `JP${jp} · Tidak ada jadwal`;
                    const clickable = cell && onCellClick;
                    return (
                      <div key={jp} className="group relative flex-1 h-full">
                        <div
                          onClick={clickable ? () => onCellClick!(row, jp, cell!) : undefined}
                          role={clickable ? 'button' : undefined}
                          tabIndex={clickable ? 0 : undefined}
                          aria-label={tipText}
                          onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCellClick!(row, jp, cell!); } } : undefined}
                          className={clsx(
                            'h-full min-h-[24px] rounded-md flex items-center justify-center px-1 overflow-hidden transition-colors',
                            cell ? (clickable ? 'bg-emerald-500/90 text-white cursor-pointer hover:bg-emerald-600' : 'bg-emerald-500/90 text-white') : 'bg-gray-100',
                            jp === nowJp && 'ring-2 ring-emerald-700 ring-offset-1',
                          )}
                        >
                          {cell && (
                            <span className="text-[9px] font-medium leading-none truncate">{mpAbbrev(cell.subject)}</span>
                          )}
                        </div>
                        {/* HTML Tooltip */}
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] leading-tight text-white opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100">
                          {cell ? (
                            <>
                              <div className="font-semibold">JP{jp} · {jpStartLabel(jp)}</div>
                              <div className="font-bold">{cell.subject}</div>
                              <div className="text-slate-300">{cell.teacher}{cell.room ? ` · ${cell.room}` : ''}</div>
                            </>
                          ) : (
                            <div>JP{jp} · Tidak ada jadwal</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Absen per JP strip (Fase 2 — SIMULASI) */}
      {absenPerJp && rows.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-1">
            <div className="w-16 shrink-0 text-[9px] font-semibold uppercase text-amber-700 flex items-center gap-1">
              Absen/JP
              <span className="text-[8px] font-bold uppercase bg-amber-100 text-amber-700 px-1 rounded">F2</span>
            </div>
            {absenPerJp.map((n, i) => {
              const jp = i + 1;
              const hasData = n !== null && n > 0;
              return (
                <div key={jp} className="flex-1 px-0.5">
                  <div
                    onClick={hasData && onAbsenClick ? () => onAbsenClick(jp) : undefined}
                    role={hasData && onAbsenClick ? 'button' : undefined}
                    tabIndex={hasData && onAbsenClick ? 0 : undefined}
                    className={clsx(
                      'h-5 rounded flex items-center justify-center text-[11px] font-bold transition',
                      !hasData ? 'bg-gray-50 text-gray-300' : (n! >= 4 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'),
                      hasData && onAbsenClick && 'cursor-pointer hover:brightness-95',
                    )}
                  >
                    {n ?? 0}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
