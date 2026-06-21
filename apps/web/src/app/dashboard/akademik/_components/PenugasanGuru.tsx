'use client';

// PenugasanGuru — layar Penugasan Dashboard Guru (W1).
// Tugas list + Pengumpulan table = SIMULASI (backend /submissions belum tersedia).
// "Tugas Baru" → toast simulasi. "Nilai Manual" & "Observasi" → simulasi.

import { useState } from 'react';
import { ClipboardList, Plus, FolderGit2, CheckCircle, Inbox, Paperclip, Eye, ClipboardPenLine, Edit3, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

interface Tugas {
  id: number;
  judul: string;
  mapel: string;
  kelas: string;
  tenggat: string;
  kumpul: number;
  dinilai: number;
  total: number;
  status: 'aktif' | 'selesai';
}

const TUGAS_DATA: Tugas[] = [
  { id: 1, judul: 'Proyek 1 — Web Profil Sekolah', mapel: 'Pemrograman Web', kelas: 'XI TJKT 1', tenggat: '24 Jun', kumpul: 18, dinilai: 6, total: 32, status: 'aktif' },
  { id: 2, judul: 'Tugas 3 — Layout Flexbox', mapel: 'Pemrograman Web', kelas: 'XI TJKT 1', tenggat: '18 Jun', kumpul: 32, dinilai: 32, total: 32, status: 'selesai' },
  { id: 3, judul: 'Tugas 2 — Relasi Tabel', mapel: 'Basis Data', kelas: 'XI TJKT 1', tenggat: '12 Jun', kumpul: 30, dinilai: 30, total: 32, status: 'selesai' },
];

const PENGUMPULAN: [string, 'Terkumpul' | 'Terlambat' | 'Belum', string, number][] = [
  ['Ahmad Fauzi', 'Terkumpul', 'profil.zip', 90],
  ['Bunga Lestari', 'Terlambat', 'web.zip', 0],
  ['Citra Dewi', 'Belum', '—', 0],
  ['Dimas Pratama', 'Terkumpul', 'tugas.zip', 95],
];

const STATUS_BADGE: Record<string, string> = {
  Terkumpul: 'bg-emerald-50 text-emerald-700',
  Terlambat: 'bg-amber-50 text-amber-700',
  Belum: 'bg-slate-100 text-slate-500',
};

function cls(v: number) {
  return v >= 75 ? 'bg-emerald-50 text-emerald-700' : v >= 60 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-600';
}

export default function PenugasanGuru() {
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-[#0f2e25] px-4 py-3 text-[12.5px] font-bold text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Tugas / Proyek */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
            <ClipboardList className="h-[18px] w-[18px] text-emerald-600" />Tugas / Proyek
          </h3>
          <button type="button" onClick={() => showToast('Fitur "Tugas Baru" — Simulasi (backend /submissions belum tersedia)')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[12.5px] font-bold text-white hover:bg-emerald-700">
            <Plus className="h-4 w-4" />Tugas Baru
          </button>
        </div>

        <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[10.5px] font-bold text-amber-700">
          <AlertTriangle className="h-3 w-3" /> SIMULASI — backend /submissions belum tersedia
        </div>

        <div className="mt-3 space-y-3">
          {TUGAS_DATA.map((t) => {
            const aktif = t.status === 'aktif';
            const pct = Math.round((t.kumpul / t.total) * 100);
            return (
              <div key={t.id} className="rounded-xl border border-[#e6efea] overflow-hidden">
                <div className="flex items-center gap-3 p-3">
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${aktif ? 'bg-emerald-50 text-emerald-700' : 'bg-[#f1f5f5] text-[#9bb0a8]'}`}>
                    {aktif ? <FolderGit2 className="h-5 w-5" /> : <CheckCircle className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <b className="text-[13px] text-[#0f2e25]">{t.judul}</b>
                    <div className="text-[11px] text-[#6b8079]">{t.mapel} · {t.kelas} · tenggat {t.tenggat} · {aktif ? 'Aktif' : 'Selesai'}</div>
                  </div>
                  <span className={clsx('rounded-md px-2 py-1 text-[10.5px] font-bold', aktif ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>
                    {t.kumpul}/{t.total} kumpul · {t.dinilai} dinilai
                  </span>
                </div>
                {aktif && (
                  <div className="border-t border-[#e6efea] p-3">
                    <div className="flex items-center gap-2 text-[11.5px] font-semibold text-[#355a4e]">
                      <Inbox className="h-3.5 w-3.5 text-emerald-600" />Pengumpulan: {t.kumpul}/{t.total}
                      <div className="ml-2 h-2 flex-1 overflow-hidden rounded-full bg-[#f0f4f2]">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => showToast('Nilai Manual — Simulasi: input nilai praktik ke Gradebook')}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700">
                        <ClipboardPenLine className="h-3.5 w-3.5" />Nilai Manual
                      </button>
                      <button type="button" onClick={() => showToast('Observasi Langsung — Simulasi: input nilai sikap ke Gradebook')}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#e6efea] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]">
                        <Eye className="h-3.5 w-3.5" />Observasi Langsung
                      </button>
                      <button type="button" onClick={() => showToast('Edit di Modul Ajar — Simulasi: membuka editor Modul Ajar')}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#e6efea] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]">
                        <Edit3 className="h-3.5 w-3.5" />Edit di Modul Ajar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Pengumpulan — Proyek 1 */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
          <Inbox className="h-[18px] w-[18px] text-emerald-600" />Pengumpulan — Proyek 1
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-[#e6efea] bg-[#f9fbfa] text-left text-[11px] uppercase tracking-wide text-[#6b8079]">
                <th className="px-3 py-2">Siswa</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Berkas</th>
                <th className="px-3 py-2">Nilai</th>
                <th className="px-3 py-2">Jenis</th>
                <th className="px-3 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {PENGUMPULAN.map((p, i) => (
                <tr key={i} className="border-b border-[#f0f4f2]">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">{p[0].charAt(0)}</div>
                      <b className="text-[#0f2e25]">{p[0]}</b>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={clsx('rounded-md px-2 py-0.5 text-[10.5px] font-bold', STATUS_BADGE[p[1]])}>{p[1]}</span>
                  </td>
                  <td className="px-3 py-2.5 text-[#355a4e]">
                    {p[2] !== '—' ? <span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3 text-[#9bb0a8]" />{p[2]}</span> : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    {p[3] ? <span className={clsx('rounded-md px-2 py-0.5 text-[11px] font-extrabold', cls(p[3]))}>{p[3]}</span> : <span className="text-[#cbd5e1]">—</span>}
                  </td>
                  <td className="px-3 py-2.5"><span className="rounded-md bg-violet-50 px-2 py-0.5 text-[10.5px] font-bold text-violet-700">Praktik</span></td>
                  <td className="px-3 py-2.5 text-right">
                    <button type="button" onClick={() => showToast(p[3] ? 'Edit nilai — Simulasi' : 'Input nilai — Simulasi')}
                      className={clsx('inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold', p[3] ? 'border border-[#e6efea] bg-white text-[#355a4e] hover:bg-[#f4f7f5]' : 'bg-emerald-600 text-white hover:bg-emerald-700')}>
                      {p[3] ? 'Edit' : 'Nilai'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-[#9bb0a8]">Nilai tugas/praktik tersinkron ke kolom <b>Praktik</b> Gradebook. Observasi → kolom <b>Sikap</b>.</p>
      </div>
    </div>
  );
}
