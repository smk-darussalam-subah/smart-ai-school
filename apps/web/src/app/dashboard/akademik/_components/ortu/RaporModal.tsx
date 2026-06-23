'use client';

import { X, Download, Info } from 'lucide-react';
import { KKTP_DEFAULT, predikat, gradeStatus, NA_WEIGHTS } from '@/lib/academic';
import type { OrtuNilai } from './ortu-types';
import { gradeCls, avgNa } from './ortu-data';

interface RaporModalProps {
  nilai: OrtuNilai[];
  onClose: () => void;
  showToast: (msg: string) => void;
}

export default function RaporModal({ nilai, onClose, showToast }: RaporModalProps) {
  const avg = avgNa(nilai);

  return (
    <div
      className="ortu-app fixed inset-0 z-50 flex items-end justify-center bg-[var(--ovl-bg)] backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Rapor semester"
    >
      <div className="max-h-[85vh] w-full max-w-[560px] overflow-auto rounded-t-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg2)] p-4 pb-8 animate-[slideUp_0.3s_cubic-bezier(0.22,0.61,0.36,1)]">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <b className="text-[15px] font-extrabold">Rapor Semester Genap 2025/2026</b>
          <button
            onClick={onClose}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Rapor table */}
        <div className="overflow-hidden rounded-[var(--r)] border border-[var(--border)]">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-[var(--surface2)]">
                <th className="p-2.5 text-left text-[10px] font-bold uppercase text-[var(--muted)]">Mapel</th>
                <th className="p-2.5 text-center text-[10px] font-bold uppercase text-[var(--muted)]">NA</th>
                <th className="p-2.5 text-center text-[10px] font-bold uppercase text-[var(--muted)]">Predikat</th>
                <th className="p-2.5 text-center text-[10px] font-bold uppercase text-[var(--muted)]">Status</th>
              </tr>
            </thead>
            <tbody>
              {nilai.map((n) => {
                const pred = predikat(n.na, KKTP_DEFAULT);
                const status = gradeStatus(n.na, KKTP_DEFAULT);
                const cls = gradeCls(n.na);
                return (
                  <tr key={n.mp} className="border-b border-[var(--border)] last:border-0">
                    <td className="p-2.5 font-semibold">{n.mp}</td>
                    <td className="p-2.5 text-center text-[14px] font-extrabold" style={{ color: cls === 'ok' ? 'var(--em)' : 'var(--rose)' }}>
                      {n.na}
                    </td>
                    <td className="p-2.5 text-center">{pred}</td>
                    <td className="p-2.5 text-center">
                      <span
                        className="rounded-md px-2 py-0.5 text-[9px] font-extrabold"
                        style={{
                          background: status === 'tuntas' ? 'rgba(16,185,129,.15)' : 'rgba(239,68,68,.15)',
                          color: status === 'tuntas' ? 'var(--em)' : 'var(--rose)',
                        }}
                      >
                        {status === 'tuntas' ? 'Tuntas' : 'Remedial'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {/* Average row */}
              <tr className="bg-[var(--surface2)] font-extrabold">
                <td className="p-2.5">Rata-rata</td>
                <td className="p-2.5 text-center text-[15px] text-[var(--pri)]">{avg}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>

        {/* Wali kelas note */}
        <div className="mt-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3 text-[11px] leading-relaxed text-[var(--muted)]">
          <b className="text-[var(--text)]">Catatan Wali Kelas:</b>
          <br />
          Ananda Rizky menunjukkan progres yang baik. Perlu meningkatkan kedisiplinan dalam pengumpulan tugas tepat waktu. Pertahankan prestasi di Pemrograman Web dan B.Inggris.
        </div>

        {/* Weight info */}
        <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-2.5 text-[11.5px] font-semibold">
          <Info className="h-4 w-4 shrink-0 text-[var(--pri)]" />
          <span>
            KKTP: <b>{KKTP_DEFAULT}</b> · Bobot: UH {Math.round(NA_WEIGHTS.uh * 100)}% · Praktik {Math.round(NA_WEIGHTS.praktik * 100)}% · Sikap {Math.round(NA_WEIGHTS.sikap * 100)}% · UTS {Math.round(NA_WEIGHTS.uts * 100)}% · UAS {Math.round(NA_WEIGHTS.uas * 100)}%
          </span>
        </div>

        {/* Download button */}
        <button
          onClick={() => showToast('Rapor diunduh (simulasi)')}
          className="mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[12px] bg-[var(--grad)] py-3 text-[13px] font-bold text-white"
        >
          <Download className="h-4 w-4" />
          Unduh Rapor PDF
        </button>
      </div>
    </div>
  );
}
