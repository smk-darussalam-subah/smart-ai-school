'use client';

// RaporModal — pratinjau rapor semester satu siswa (W0b, dibangun saat dikonsumsi
// di Capaian & Rapor guru). Tabel per mapel: UH/Prak/UTS/UAS + NA berbobot + Predikat,
// plus ringkasan Rata²/Tuntas & catatan kenaikan. Dipakai bersama guru/siswa/ortu.
// NA & predikat dari lib/academic (W0a) — konsisten lintas dashboard.

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { CheckCircle2, AlertTriangle, Brain, Hand, Heart, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  naOf,
  predikat,
  gradeStatus,
  KKTP_DEFAULT,
  type StudentGradeComponents,
} from '@/lib/academic';
import { STATUS_TEXT_CLASS } from './grade-meta';
import {
  fetchMuatanLokal,
  fetchAttendanceSummary,
  fetchDevelopmentDescription,
  fetchApprovalInfo,
} from '@/app/dashboard/akademik/actions';

export interface RaporRow {
  subject: string;
  components: StudentGradeComponents;
}

interface RaporModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
  /** Mis. "XI TJKT 1 · Semester 2 · 2025/2026". */
  subtitle?: string;
  rows: RaporRow[];
  kktp?: number;
  catatan?: string | null;
  contentClassName?: string;
  /** T2-01: For fetching sections B-G from backend */
  studentId?: string;
  academicYear?: string;
  semester?: number;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function RaporModal({
  open,
  onOpenChange,
  studentName,
  subtitle,
  rows,
  kktp = KKTP_DEFAULT,
  catatan,
  contentClassName,
  studentId,
  academicYear,
  semester,
}: RaporModalProps) {
  const computed = rows.map((r) => ({ ...r, na: naOf(r.components) }));
  const nas = computed.map((r) => r.na).filter((n): n is number => n !== null);
  const avg = nas.length ? round1(nas.reduce((a, b) => a + b, 0) / nas.length) : null;
  const tuntas = computed.filter((r) => r.na !== null && r.na >= kktp).length;
  const naik = rows.length > 0 && tuntas >= rows.length - 1;

  // T2-01: Fetch sections B-G data
  const [sectionB, setSectionB] = useState<{ subjects: { name: string; na: number; kktp: number; predikat: string }[] } | null>(null);
  const [sectionD, setSectionD] = useState<{ hadir: number; izin: number; sakit: number; alpha: number; total: number } | null>(null);
  const [sectionF, setSectionF] = useState<{ description: string; spiritual: string; social: string; academic: string } | null>(null);
  const [sectionG, setSectionG] = useState<{ homeroomTeacher: string; principal: string; approvedAt: string | null; schoolYear: string; semester: number; className: string } | null>(null);
  const [sectionsLoading, setSectionsLoading] = useState(false);

  useEffect(() => {
    if (!open || !studentId || !academicYear || !semester) return;
    setSectionsLoading(true);
    Promise.all([
      fetchMuatanLokal(studentId, academicYear, semester),
      fetchAttendanceSummary(studentId, academicYear, semester),
      fetchDevelopmentDescription(studentId, academicYear, semester),
      fetchApprovalInfo(studentId, academicYear, semester),
    ]).then(([b, d, f, g]) => {
      if (b.success) setSectionB(b.data ?? null);
      if (d.success) setSectionD(d.data ?? null);
      if (f.success) setSectionF(f.data ?? null);
      if (g.success) setSectionG(g.data ?? null);
    }).finally(() => setSectionsLoading(false));
  }, [open, studentId, academicYear, semester]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-w-2xl', contentClassName)}>
        <DialogHeader>
          <DialogTitle>Rapor Semester — {studentName}</DialogTitle>
          {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Stat label="Rata² NA" value={avg ?? '—'} tone="text-emerald-600" />
          <Stat label="Tuntas" value={`${tuntas}/${rows.length}`} tone="text-emerald-600" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3">Mapel</th>
                <th className="py-2 px-2 text-center">UH</th>
                <th className="py-2 px-2 text-center">Prak</th>
                <th className="py-2 px-2 text-center">UTS</th>
                <th className="py-2 px-2 text-center">UAS</th>
                <th className="py-2 px-2 text-right">NA</th>
                <th className="py-2 pl-2 text-right">Pred</th>
              </tr>
            </thead>
            <tbody>
              {computed.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[12px] font-medium text-slate-400">
                    Belum ada nilai
                  </td>
                </tr>
              ) : (
                computed.map((r) => {
                  const tone = r.na != null ? STATUS_TEXT_CLASS[gradeStatus(r.na, kktp)] : 'text-slate-400';
                  return (
                    <tr key={r.subject} className="border-b border-slate-100">
                      <td className="py-2.5 pr-3 font-semibold text-slate-700">{r.subject}</td>
                      <td className="px-2 text-center text-slate-600">{r.components.uh ?? '—'}</td>
                      <td className="px-2 text-center text-slate-600">{r.components.praktik ?? '—'}</td>
                      <td className="px-2 text-center text-slate-600">{r.components.uts ?? '—'}</td>
                      <td className="px-2 text-center text-slate-600">{r.components.uas ?? '—'}</td>
                      <td className={cn('px-2 text-right font-extrabold tabular-nums', tone)}>{r.na ?? '—'}</td>
                      <td className={cn('pl-2 text-right font-extrabold', tone)}>
                        {r.na != null ? predikat(r.na, kktp) : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-500">
          NA = Nilai Akhir berbobot: UH 20% · Praktik 25% · Sikap 15% · UTS 20% · UAS 20%.
        </p>

        {rows.length > 0 && (
          <div
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold',
              naik ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
            )}
          >
            {naik ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {naik ? 'Semua mapel tuntas — memenuhi syarat kenaikan.' : 'Ada mapel yang perlu remedial.'}
          </div>
        )}

        {/* Bagian B-G — T2-01: Wired ke /report-cards/* endpoints */}
        {sectionsLoading && (
          <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-semibold text-sky-700">
            <Loader2 className="h-3 w-3 animate-spin" /> Memuat data rapor...
          </div>
        )}
        {!sectionsLoading && (!studentId || !academicYear || !semester) && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-bold text-amber-700">
            SIMULASI — Bagian B-G belum terhubung ke backend. Data akan tersedia saat rapor diterbitkan.
          </div>
        )}

        {/* B. Muatan Lokal */}
        <RaporSection title="B. MUATAN LOKAL">
          {sectionB && sectionB.subjects.length > 0 ? (
            <div className="space-y-1.5">
              {sectionB.subjects.map((s) => (
                <div key={s.name} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-[11px]">
                  <span className="font-semibold text-slate-700">{s.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-extrabold text-slate-900">NA {s.na}</span>
                    <span className={cn('rounded px-2 py-0.5 text-[9px] font-bold', s.predikat === 'Tuntas' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>{s.predikat}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : sectionB ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[11px] font-medium text-slate-400">
              Tidak ada muatan lokal untuk periode ini
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[11px] font-medium text-slate-400">
              Data muatan lokal akan tersedia menyusul
            </div>
          )}
        </RaporSection>

        {/* C. Ekstrakurikuler */}
        <RaporSection title="C. EKSTRAKURIKULER">
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[11px] font-medium text-slate-400">
            Data ekstrakurikuler akan tersedia menyusul
          </div>
        </RaporSection>

        {/* D. Ketidakhadiran */}
        <RaporSection title="D. KETIDAKHADIRAN">
          <div className="grid grid-cols-4 gap-2">
            <AttendanceStat label="Hadir" value={sectionD ? String(sectionD.hadir) : '—'} className="text-emerald-600" />
            <AttendanceStat label="Izin" value={sectionD ? String(sectionD.izin) : '—'} className="text-sky-600" />
            <AttendanceStat label="Sakit" value={sectionD ? String(sectionD.sakit) : '—'} className="text-amber-600" />
            <AttendanceStat label="Alpha" value={sectionD ? String(sectionD.alpha) : '—'} className="text-rose-600" />
          </div>
        </RaporSection>

        {/* E. Catatan Guru Mapel */}
        <RaporSection title="E. CATATAN GURU MAPEL">
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[11px] font-medium text-slate-400">
            Catatan guru mapel akan diisi saat penerbitan rapor
          </div>
        </RaporSection>

        {/* F. Deskripsi Perkembangan Kompetensi */}
        <RaporSection title="F. DESKRIPSI PERKEMBANGAN KOMPETENSI">
          {sectionF ? (
            <div className="space-y-2">
              <div className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
                {sectionF.description}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <DevCard icon={Brain} title="Pengetahuan" desc={sectionF.academic} />
                <DevCard icon={Hand} title="Keterampilan" desc={sectionF.social} />
                <DevCard icon={Heart} title="Sikap" desc={sectionF.spiritual} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <DevCard icon={Brain} title="Pengetahuan" desc="Deskripsi akan tersedia saat rapor diterbitkan." />
              <DevCard icon={Hand} title="Keterampilan" desc="Deskripsi akan tersedia saat rapor diterbitkan." />
              <DevCard icon={Heart} title="Sikap" desc="Deskripsi akan tersedia saat rapor diterbitkan." />
            </div>
          )}
        </RaporSection>

        {/* G. Pengesahan */}
        <RaporSection title="G. PENGESAHAN">
          <div className="grid grid-cols-3 gap-4 text-center text-[10px]">
            <div>
              <div className="mb-8 font-semibold text-slate-600">Mengetahui,<br />Orang Tua/Wali</div>
              <div className="mx-4 border-t border-slate-400 pt-1 text-slate-400">(..............................)</div>
            </div>
            <div>
              <div className="mb-8 font-semibold text-slate-600">Wali Kelas<br />&nbsp;</div>
              <div className="mx-4 border-t border-slate-400 pt-1 text-slate-400">
                {sectionG?.homeroomTeacher ? `(${sectionG.homeroomTeacher})` : '(..............................)'}
              </div>
            </div>
            <div>
              <div className="mb-8 font-semibold text-slate-600">Mengetahui,<br />Kepala Sekolah</div>
              <div className="mx-4 border-t border-slate-400 pt-1 text-slate-400">
                {sectionG?.principal ? `(${sectionG.principal})` : '(..............................)'}
              </div>
            </div>
          </div>
          {sectionG && (
            <div className="mt-2 text-center text-[9px] text-slate-500">
              {sectionG.className} · Tahun Ajaran {sectionG.schoolYear} · Semester {sectionG.semester}
            </div>
          )}
        </RaporSection>

        {catatan && (
          <div className="rounded-lg border border-slate-200 px-3 py-2 text-[12px] text-slate-600">
            <span className="font-semibold text-slate-700">Catatan wali kelas: </span>
            {catatan}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={cn('text-2xl font-extrabold tabular-nums', tone)}>{value}</div>
    </div>
  );
}

function RaporSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[12px] font-bold text-emerald-700">{title}</div>
      {children}
    </div>
  );
}

function AttendanceStat({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2 text-center">
      <div className="text-[9px] font-semibold uppercase text-slate-400">{label}</div>
      <div className={cn('text-lg font-extrabold', className)}>{value}</div>
    </div>
  );
}

function DevCard({ icon: Icon, title, desc }: { icon: typeof Brain; title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-2.5">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
        <Icon className="h-3 w-3" />{title}
      </div>
      <div className="text-[10px] leading-relaxed text-slate-500">{desc}</div>
    </div>
  );
}
