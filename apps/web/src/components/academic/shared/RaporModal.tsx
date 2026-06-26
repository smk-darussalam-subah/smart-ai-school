'use client';

// RaporModal — pratinjau rapor semester satu siswa (W0b, dibangun saat dikonsumsi
// di Capaian & Rapor guru). Tabel per mapel: UH/Prak/UTS/UAS + NA berbobot + Predikat,
// plus ringkasan Rata²/Tuntas & catatan kenaikan. Dipakai bersama guru/siswa/ortu.
// NA & predikat dari lib/academic (W0a) — konsisten lintas dashboard.

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { CheckCircle2, AlertTriangle, Brain, Hand, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  naOf,
  predikat,
  gradeStatus,
  KKTP_DEFAULT,
  type StudentGradeComponents,
} from '@/lib/academic';
import { STATUS_TEXT_CLASS } from './grade-meta';

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
}: RaporModalProps) {
  const computed = rows.map((r) => ({ ...r, na: naOf(r.components) }));
  const nas = computed.map((r) => r.na).filter((n): n is number => n !== null);
  const avg = nas.length ? round1(nas.reduce((a, b) => a + b, 0) / nas.length) : null;
  const tuntas = computed.filter((r) => r.na !== null && r.na >= kktp).length;
  const naik = rows.length > 0 && tuntas >= rows.length - 1;

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

        {/* Bagian B-G — backend /report-cards/* sudah ada (muatan-lokal, attendance-summary,
            development-description, approval) namun wiring fetch lintas-pemanggil belum
            selesai (T2-01). Konten jujur "menyusul", BUKAN data demo palsu. Section A di
            atas sudah data nyata. */}
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-[10px] font-bold text-sky-700">
          Bagian B-G sedang disiapkan — data akan terisi otomatis saat rapor diterbitkan.
        </div>

        {/* B. Muatan Lokal */}
        <RaporSection title="B. MUATAN LOKAL">
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[11px] font-medium text-slate-400">
            Data muatan lokal akan tersedia menyusul
          </div>
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
            <AttendanceStat label="Hadir" value="—" className="text-emerald-600" />
            <AttendanceStat label="Izin" value="—" className="text-sky-600" />
            <AttendanceStat label="Sakit" value="—" className="text-amber-600" />
            <AttendanceStat label="Alpha" value="—" className="text-rose-600" />
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
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <DevCard icon={Brain} title="Pengetahuan" desc="Deskripsi akan tersedia saat rapor diterbitkan." />
            <DevCard icon={Hand} title="Keterampilan" desc="Deskripsi akan tersedia saat rapor diterbitkan." />
            <DevCard icon={Heart} title="Sikap" desc="Deskripsi akan tersedia saat rapor diterbitkan." />
          </div>
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
              <div className="mx-4 border-t border-slate-400 pt-1 text-slate-400">(..............................)</div>
            </div>
            <div>
              <div className="mb-8 font-semibold text-slate-600">Mengetahui,<br />Kepala Sekolah</div>
              <div className="mx-4 border-t border-slate-400 pt-1 text-slate-400">(..............................)</div>
            </div>
          </div>
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
