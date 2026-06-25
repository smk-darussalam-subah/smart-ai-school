'use client';

// LmsPreviewScreen — standalone full-screen LMS preview (P22 — P8-2).
// Left: phone-frame student view simulation.
// Right: student progress matrix (per-student completion %, badge status).
// Mockup ref: akademik-guru-utuh.html lines 836-844, 1932-1935.
// Student progress data: SIMULASI (class-wide progress endpoint not yet available).

import { ArrowLeft, BookOpen, Smartphone, Users, AlertTriangle, Award } from 'lucide-react';
import clsx from 'clsx';
import type { LmsModuleItem } from './guru-types';

interface Props {
  module: LmsModuleItem;
  onClose: () => void;
}

// SIMULASI student progress data (class-wide endpoint not yet available)
const SIM_STUDENTS = [
  { name: 'Rizky Pratama', progress: 100, badge: true, lastAccess: '2 jam lalu' },
  { name: 'Siti Nurhaliza', progress: 80, badge: false, lastAccess: '5 jam lalu' },
  { name: 'Ahmad Fauzi', progress: 40, badge: false, lastAccess: '1 hari lalu' },
  { name: 'Dewi Lestari', progress: 100, badge: true, lastAccess: '30 menit lalu' },
  { name: 'Budi Santoso', progress: 60, badge: false, lastAccess: '3 jam lalu' },
  { name: 'Nur Aini', progress: 20, badge: false, lastAccess: '2 hari lalu' },
];

function progressColor(pct: number): string {
  if (pct >= 100) return 'from-emerald-400 to-emerald-600';
  if (pct >= 50) return 'from-amber-400 to-amber-500';
  return 'from-slate-300 to-slate-400';
}

function progressLabel(pct: number): string {
  if (pct >= 100) return 'Selesai';
  if (pct > 0) return `${pct}% selesai`;
  return 'Belum mulai';
}

export default function LmsPreviewScreen({ module, onClose }: Props) {
  const meta = [
    module.tp,
    module.jpAllocation ? `${module.jpAllocation} JP` : null,
    `KKTP ${module.kktp}`,
    module.class?.name ?? 'Umum',
  ].filter(Boolean).join(' · ');

  const statusLabel = module.status === 'published' ? 'Terbit' : module.status === 'archived' ? 'Arsip' : 'Draft';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-[#e6efea] bg-white px-5 py-3 shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"
            >
              <ArrowLeft className="h-4 w-4" /> Kembali
            </button>
            <div>
              <h2 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
                <BookOpen className="h-5 w-5 text-emerald-600" />
                {module.title}
                <span className={clsx('rounded-md px-2 py-0.5 text-[11px] font-bold',
                  module.status === 'published' ? 'bg-emerald-50 text-emerald-700'
                    : module.status === 'archived' ? 'bg-zinc-100 text-zinc-500'
                    : 'bg-slate-100 text-slate-600'
                )}>
                  {statusLabel}
                </span>
              </h2>
              <p className="text-[11px] text-[#6b8079]">{module.subject} · {meta}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content: two-column layout */}
      <div className="mx-auto grid max-w-6xl gap-4 p-5 lg:grid-cols-2">
        {/* Left: Phone-frame student view simulation */}
        <div>
          <h3 className="mb-3 flex items-center gap-1.5 text-[13px] font-bold text-[#0f2e25]">
            <Smartphone className="h-4 w-4 text-emerald-600" /> Tampilan Siswa
          </h3>
          {/* Phone frame */}
          <div className="mx-auto max-w-[360px] rounded-[2rem] border-8 border-gray-800 bg-white shadow-xl">
            <div className="rounded-[1.5rem] overflow-hidden">
              {/* Status bar */}
              <div className="flex items-center justify-between bg-gray-800 px-4 py-1 text-[10px] text-white">
                <span>9:41</span>
                <span>DIIS</span>
                <span>100%</span>
              </div>
              {/* App header */}
              <div className="border-b border-gray-100 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 text-[12px] font-extrabold text-white">D</div>
                  <div>
                    <div className="text-[11px] font-bold text-gray-800">DIIS</div>
                    <div className="text-[8px] text-gray-400">Smart AI School</div>
                  </div>
                </div>
              </div>
              {/* Module content */}
              <div className="max-h-[400px] overflow-y-auto px-4 py-3">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-emerald-600">{module.subject}</div>
                <h4 className="mb-2 text-[14px] font-bold text-gray-800">{module.title}</h4>
                {module.tp && <p className="mb-2 text-[10px] text-gray-500">{module.tp}</p>}
                <div className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-gray-700">
                  {module.content?.trim() || 'Modul ini belum memiliki konten materi.'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Student progress matrix */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-[13px] font-bold text-[#0f2e25]">
              <Users className="h-4 w-4 text-emerald-600" /> Progres Siswa
            </h3>
            <div className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">
              <AlertTriangle className="h-3 w-3" /> SIMULASI
            </div>
          </div>

          {/* Summary stats */}
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-[#e6efea] bg-white p-2.5 text-center">
              <div className="text-lg font-extrabold text-emerald-600">{SIM_STUDENTS.filter((s) => s.progress >= 100).length}</div>
              <div className="text-[9px] font-bold uppercase text-[#9bb0a8]">Selesai</div>
            </div>
            <div className="rounded-xl border border-[#e6efea] bg-white p-2.5 text-center">
              <div className="text-lg font-extrabold text-amber-500">{SIM_STUDENTS.filter((s) => s.progress > 0 && s.progress < 100).length}</div>
              <div className="text-[9px] font-bold uppercase text-[#9bb0a8]">Progres</div>
            </div>
            <div className="rounded-xl border border-[#e6efea] bg-white p-2.5 text-center">
              <div className="text-lg font-extrabold text-slate-400">{SIM_STUDENTS.filter((s) => s.progress === 0).length}</div>
              <div className="text-[9px] font-bold uppercase text-[#9bb0a8]">Belum Mulai</div>
            </div>
          </div>

          {/* Student progress table */}
          <div className="overflow-hidden rounded-xl border border-[#e6efea] bg-white">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[#e6efea] bg-[#f4f7f5] text-left text-[10px] font-bold uppercase tracking-wide text-[#6b8079]">
                  <th className="py-2 pl-3 pr-2">Siswa</th>
                  <th className="px-2 py-2">Progres</th>
                  <th className="px-2 py-2 text-center">Badge</th>
                  <th className="px-2 py-2 text-right pr-3">Akses</th>
                </tr>
              </thead>
              <tbody>
                {SIM_STUDENTS.map((student) => (
                  <tr key={student.name} className="border-b border-[#f0f4f2] last:border-0 hover:bg-[#f9fbfa]">
                    <td className="py-2.5 pl-3 pr-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-[10px] font-bold text-emerald-700">
                          {student.name.split(' ').map((w) => w.charAt(0)).slice(0, 2).join('')}
                        </div>
                        <span className="font-semibold text-[#0f2e25]">{student.name}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={clsx('h-full rounded-full bg-gradient-to-r', progressColor(student.progress))}
                            style={{ width: `${student.progress}%` }}
                          />
                        </div>
                        <span className={clsx(
                          'text-[10px] font-bold',
                          student.progress >= 100 ? 'text-emerald-600' : student.progress >= 50 ? 'text-amber-600' : 'text-slate-400'
                        )}>
                          {progressLabel(student.progress)}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      {student.badge ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                          <Award className="h-3 w-3" /> ✓
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 pr-3 text-right text-[10px] text-[#9bb0a8]">{student.lastAccess}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-[10px] text-[#9bb0a8]">
            Data progres siswa adalah SIMULASI. Endpoint progres kelas ({`/lms/modules/:id/progress`}) belum tersedia.
          </p>
        </div>
      </div>
    </div>
  );
}
