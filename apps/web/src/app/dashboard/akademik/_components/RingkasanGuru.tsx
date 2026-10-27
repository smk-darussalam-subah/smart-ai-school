'use client';
import React, { useState } from 'react';

import { Target, GraduationCap, CalendarCheck, BookOpenCheck, Clock, PenLine, Info, Code, ListChecks, Users, FileText, ClipboardList, ChevronRight, UserCheck, CalendarClock, ClipboardPenLine, ClipboardCheck, GitBranch, HelpCircle, PlayCircle } from 'lucide-react';
import type { GradeItem, AttendanceItem } from '@/lib/api';
import type { ActivityItem, RppItem, TodayClass } from './guru-types';
import { teacherGradeRecords, summaryReadMessage, type TeacherSummaryAvailability, type TeacherThreshold } from '@/lib/teacher-summary';
import { wibDateLabel, wibTodayISO } from '@/lib/bell-times';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

interface Props {
  grades: GradeItem[];
  attendances: AttendanceItem[];
  activities: ActivityItem[];
  rpp: RppItem[];
  todayClasses: TodayClass[];
  availability?: TeacherSummaryAvailability;
  thresholds?: TeacherThreshold[];
  todayDate?: string;
  onAbsen: (c: TodayClass) => void;
  onJurnal: (c: { classId: string; className: string; subject: string; startLabel: string; jpStart: number }) => void;
  onNavigate?: (screen: string) => void;
  onStartSession?: (c: TodayClass) => void;
  canReadClassSessions?: boolean;
  onPenilaian?: (c: TodayClass) => void;
}

export default function RingkasanGuru({ grades, attendances, activities, rpp, todayClasses: suppliedTodayClasses, availability, thresholds = [], todayDate, onAbsen, onJurnal, onNavigate, onStartSession, onPenilaian, canReadClassSessions = false }: Props) {
  // Missing read metadata must not certify a successful empty dataset.
  const reads = availability ?? { grades: 'unavailable', attendance: 'unavailable', journal: 'unavailable', rpp: 'unavailable', assessments: 'unavailable', kktp: 'unavailable', today: 'unavailable' };
  const todayState = reads.today === 'ready' && todayDate !== wibTodayISO() ? 'unavailable' : reads.today;
  const todayClasses = todayState === 'ready' ? suppliedTodayClasses : [];
  const canActToday = () => todayState === 'ready' && todayDate === wibTodayISO();
  const gradeSummary = teacherGradeRecords(reads.grades === 'ready' ? grades : [], reads.kktp === 'ready' ? thresholds : []);
  const tuntas = gradeSummary.percentage;
  const rata = gradeSummary.average;
  const hadirPct = reads.attendance === 'ready' && attendances.length ? Math.round((attendances.filter((a) => a.status === 'hadir').length / attendances.length) * 100) : null;
  const hadirCount = attendances.filter((a) => a.status === 'hadir').length;
  const izinCount = attendances.filter((a) => a.status === 'izin').length;
  const sakitCount = attendances.filter((a) => a.status === 'sakit').length;
  const alphaCount = attendances.filter((a) => a.status === 'alpha').length;

  const rppPending = reads.rpp === 'ready' ? rpp.filter((r) => r.status === 'draft' || r.status === 'revision').length : 0;
  const today = wibTodayISO();
  const absentToday = new Set(attendances.filter((a) => a.date?.slice(0, 10) === today).map((a) => a.classId));
  const kelasBelumAbsen = reads.attendance === 'ready' ? [...new Set(todayClasses.map(c => c.classId))].filter(id => !absentToday.has(id)).length : 0;
  // P6: tugasBelumDinilai removed — honest empty until /submissions/* ready
  // R-13: Assessment sessions linked to today's classes via assessmentSessionId
  const kelasBelumDinilai = reads.assessments === 'ready' ? todayClasses.filter((c) => !c.assessmentSessionId).length : 0;
  const actionsIncomplete = ['grades', 'attendance', 'rpp', 'assessments', 'kktp'].some(key => reads[key as keyof TeacherSummaryAvailability] !== 'ready') || (todayState !== 'ready' && todayState !== 'outside-period') || gradeSummary.unknown > 0;
  const todayMessage = todayState === 'outside-period' ? 'Periode yang dipilih bukan periode kegiatan hari ini. Jadwalnya tetap dapat dilihat.' : summaryReadMessage(todayState === 'denied' ? 'denied' : 'unavailable', 'Jadwal hari ini');
  const tindakan = [
    gradeSummary.below > 0 && { icon: Users, color: 'bg-rose-50 text-rose-600', title: `${gradeSummary.below} record nilai di bawah KKTP`, sub: 'Tinjau nilai; bukan keputusan remedial per siswa', action: 'penilaian' },
    kelasBelumAbsen > 0 && { icon: ClipboardList, color: 'bg-amber-50 text-amber-600', title: `${kelasBelumAbsen} kelas hari ini belum diabsen`, sub: 'Catat kehadiran dari kartu kelas', action: 'ringkasan' },
    rppPending > 0 && { icon: FileText, color: 'bg-violet-50 text-violet-600', title: `${rppPending} Modul Ajar belum disetujui`, sub: 'Draft/revisi — ajukan ke Wakakur', action: 'pembelajaran' },
    // R-13: Show action when classes today don't have assessment sessions linked yet
    kelasBelumDinilai > 0 && { icon: ClipboardPenLine, color: 'bg-sky-50 text-sky-600', title: `${kelasBelumDinilai} kelas belum punya sesi penilaian`, sub: 'Buat sesi asesmen dari Modul Ajar', action: 'pembelajaran' },
  ].filter(Boolean) as { icon: typeof Users; color: string; title: string; sub: string; action: string }[];

  return (
    <div className="space-y-4">
      {canReadClassSessions && <a href="/dashboard/jadwal#today-class-sessions" className="inline-flex min-h-11 items-center gap-2 font-bold text-emerald-800 underline"><PlayCircle className="h-4 w-4" aria-hidden="true" />Sesi pembelajaran</a>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Target} label="Nilai mencapai KKTP" value={tuntas !== null ? `${tuntas}%` : '—'} sub={reads.grades !== 'ready' ? summaryReadMessage(reads.grades, 'Nilai') : reads.kktp !== 'ready' ? summaryReadMessage(reads.kktp, 'KKTP resmi') : gradeSummary.unknown ? `KKTP untuk ${gradeSummary.unknown} record belum tersedia.` : tuntas !== null ? `${gradeSummary.passed} dari ${gradeSummary.records} record nilai` : 'Belum ada record nilai.'} tooltip="Persentase record nilai yang mencapai KKTP resmi mapelnya. Satu siswa dapat memiliki beberapa record; ini bukan jumlah siswa atau nilai akhir rapor." />
        <Kpi icon={GraduationCap} label="Rata-rata record nilai" value={rata !== null ? `${rata}` : '—'} sub={reads.grades !== 'ready' ? summaryReadMessage(reads.grades, 'Nilai') : gradeSummary.records ? `dari ${gradeSummary.records} record nilai` : 'Belum ada record nilai.'} tooltip="Rata-rata nilai yang tercatat, bukan NA berbobot per siswa dan mapel." />
        <Kpi icon={CalendarCheck} label="Kehadiran harian" value={hadirPct !== null ? `${hadirPct}%` : '—'} sub={reads.attendance !== 'ready' ? summaryReadMessage(reads.attendance, 'Kehadiran') : attendances.length ? `${hadirCount} hadir · ${izinCount} izin · ${sakitCount} sakit · ${alphaCount} alpha` : 'Belum ada catatan kehadiran.'} />
        <Kpi icon={BookOpenCheck} label="Catatan jurnal" value={reads.journal === 'ready' ? `${activities.length}` : '—'} sub={reads.journal === 'ready' ? 'record jurnal guru–kelas, bukan jumlah pertemuan' : summaryReadMessage(reads.journal, 'Jurnal')} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* Kelas Hari Ini */}
        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><Clock className="h-[18px] w-[18px] text-emerald-600" />Kelas Hari Ini</h3>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">{wibDateLabel()}</span>
              {onNavigate && <button type="button" onClick={() => onNavigate('jadwal')} className="min-h-11 rounded-lg px-2 text-[11.5px] font-bold text-emerald-700 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">Lihat jadwal →</button>}
            </div>
          </div>
          {todayState !== 'ready' ? <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-[12.5px] text-amber-900">{todayMessage}</p> : todayClasses.length === 0 ? (
            <div className="mt-3 grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#526b62]">Tidak ada jadwal mengajar hari ini.</div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {todayClasses.map((c, i) => (
                <div key={c.scheduleId ?? `${c.classId}-${c.jpStart}-${i}`}
                  className="group rounded-xl border border-[#e6efea] bg-white p-3.5 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_2px_6px_rgba(16,40,33,.06),0_22px_40px_-20px_rgba(16,40,33,.28)]">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Code className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <b className="text-[13.5px] text-[#0f2e25]">{c.subject} · {c.className}</b>
                      <div className="text-[12px] text-[#526b62]">JP {c.jpStart}{c.jpEnd !== c.jpStart ? `–${c.jpEnd}` : ''} · {c.startLabel} · {c.room ?? 'Ruang —'}{c.isNow ? ' · dalam rentang jadwal' : ''}</div>
                    </div>
                    {c.isNow && <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-extrabold text-emerald-700">Rentang jadwal</span>}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {onStartSession && <button type="button" onClick={() => canActToday() && onStartSession(c)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-[12.5px] font-bold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"><PlayCircle className="h-4 w-4" />Panduan mengajar</button>}
                    <button type="button" onClick={() => canActToday() && onAbsen(c)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[#d5e2dc] bg-white px-3 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><CalendarCheck className="h-4 w-4 text-emerald-700" />Absen sesi</button>
                    <button type="button" onClick={() => canActToday() && onJurnal({ classId: c.classId, className: c.className, subject: c.subject, startLabel: c.startLabel, jpStart: c.jpStart })} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[#d5e2dc] bg-white px-3 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><PenLine className="h-4 w-4 text-emerald-700" />Jurnal</button>
                    {onPenilaian && <button type="button" onClick={() => canActToday() && onPenilaian(c)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[#d5e2dc] bg-white px-3 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><ClipboardPenLine className="h-4 w-4 text-emerald-700" />Nilai</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {todayState === 'ready' && todayClasses.length > 0 && <p className="mt-3 text-[11.5px] leading-relaxed text-[#526b62]"><Info className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Klik <b>Absen</b> untuk mencatat kehadiran atau <b>Jurnal</b> untuk menulis catatan kelas. Periksa isian sebelum menyimpan.</p>}
        </div>

        {/* Perlu Tindakan */}
        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><ListChecks className="h-[18px] w-[18px] text-emerald-600" />Perlu Tindakan</h3>
          {actionsIncomplete && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-[12.5px] text-amber-900">Sebagian data tindak lanjut belum tersedia. Daftar ini belum lengkap; coba muat ulang halaman.</p>}
          {tindakan.length === 0 && !actionsIncomplete ? (
            <div className="mt-3 grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#526b62]">Tidak ada tindakan tertunda.</div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {tindakan.map((t, i) => {
                const Icon = t.icon;
                return (
                  <button key={i} type="button" onClick={() => onNavigate?.(t.action)} className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-[#e6efea] bg-white p-3 text-left transition hover:border-emerald-200 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
                    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${t.color}`}><Icon className="h-[18px] w-[18px]" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <b className="text-[12.5px] text-[#0f2e25]">{t.title}</b>
                      </div>
                      <div className="text-[11.5px] text-[#526b62]">{t.sub}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[#526b62]" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Status Hari Ini */}
      <StatusHariIni todayClasses={todayClasses} attendances={attendances} activities={activities} reads={reads} todayMessage={todayState === 'ready' ? null : todayMessage} />

      {/* Alur Kerja Guru */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><GitBranch className="h-[18px] w-[18px] text-emerald-600" />Alur Kerja Guru</h3>
        <p className="mt-1 text-[12.5px] text-[#526b62]">Dari awal tahun hingga rekap audit — semua terhubung dalam satu sistem.</p>
        <div className="mt-3 space-y-2">
          <FlowStep step="1" icon={UserCheck} color="bg-sky-50 text-sky-600" title="Awal Tahun — Pembagian Tugas oleh KS" desc="KS menugaskan guru ke kelas & mapel → otomatis muncul di filter & jadwal" done onClick={() => onNavigate?.('jadwal')} />
          <FlowStep step="2" icon={FileText} color="bg-emerald-50 text-emerald-700" title="Buat & Ajukan Modul Ajar" desc="RPP wizard 11-langkah → ajukan ke Wakakur → aktifkan di LMS" onClick={() => onNavigate?.('pembelajaran')} />
          <FlowStep step="3" icon={CalendarClock} color="bg-violet-50 text-violet-600" title="Mengajar Sesuai Jadwal" desc='Klik "Mulai Sesi" pada kelas hari ini → panduan in-class procedure' onClick={() => onNavigate?.('jadwal')} />
          <FlowStep step="4" icon={ClipboardPenLine} color="bg-amber-50 text-amber-600" title="Penilaian & Remedial" desc="Gradebook terisi otomatis (formatif) + manual (praktik/sikap) → remedial untuk belum tuntas" onClick={() => onNavigate?.('penilaian')} />
          <FlowStep step="5" icon={ClipboardCheck} color="bg-rose-50 text-rose-600" title="Rekap Audit & Rapor" desc="Semua data agregasi → KS/Wakakur audit → terbit ke Rapor orang tua" onClick={() => onNavigate?.('rekap')} />
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, tooltip }: { icon: typeof Target; label: string; value: string; sub?: string; tooltip?: string }) {
  return (
    <div className="rounded-2xl border border-[#e6efea] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#526b62]">
        <Icon className="h-3.5 w-3.5 text-emerald-600" />{label}
        {tooltip && (
          <span className="group relative inline-flex">
            <button
              type="button"
              aria-label={tooltip}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[#526b62] hover:bg-[#f4f7f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
            </button>
            <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden w-52 -translate-x-1/2 whitespace-pre-wrap rounded-lg bg-[#0f2e25] px-3 py-2 text-[11px] font-medium leading-relaxed text-white shadow-lg group-hover:block group-focus-within:block">{tooltip}</span>
          </span>
        )}
      </div>
      <div className="mt-1.5 text-[26px] font-extrabold tracking-tight text-[#0f2e25]">{value}</div>
      {sub && <div className="mt-0.5 text-[10.5px] font-medium text-[#526b62]">{sub}</div>}
    </div>
  );
}

function FlowStep({ step, icon: Icon, color, title, desc, done, onClick }: { step: string; icon: typeof Target; color: string; title: string; desc: string; done?: boolean; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-[#e6efea] bg-white p-3 text-left transition hover:border-emerald-200 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${color}`}><Icon className="h-[18px] w-[18px]" /></div>
      <div className="min-w-0 flex-1">
        <b className="text-[12.5px] text-[#0f2e25]">{step}. {title}</b>
        <div className="text-[11.5px] text-[#526b62]">{desc}</div>
      </div>
      {done ? <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">✓</span> : <ChevronRight className="h-4 w-4 shrink-0 text-[#526b62]" />}
    </button>
  );
}

function StatusHariIni({ todayClasses, attendances, activities, reads, todayMessage }: { todayClasses: TodayClass[]; attendances: AttendanceItem[]; activities: ActivityItem[]; reads: TeacherSummaryAvailability; todayMessage: string | null }) {
  const [selected, setSelected] = useState<TodayClass | null>(null);
  const today = wibTodayISO();

  const sessions = todayClasses.map((tc) => {
    const classAtt = attendances.filter((a) => a.date?.slice(0, 10) === today && a.classId === tc.classId);
    const hasAbsen = classAtt.length > 0;
    const hasJurnal = activities.some((a) => a.date?.slice(0, 10) === today && a.classId === tc.classId);
    // R-13: Wire to real assessment session data — no longer hardcoded false.
    // hasPenilaian = true jika ada assessment session linked untuk kelas ini.
    // hasFeedback = true jika session sudah completed (hasil sudah ada).
    const hasPenilaian = !!tc.assessmentSessionId;
    const hasFeedback = tc.hasFeedback === true;
    return { ...tc, hasAbsen, hasJurnal, hasPenilaian, hasFeedback, classAtt };
  });

  return (
    <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><ClipboardList className="h-[18px] w-[18px] text-emerald-600" />Status Hari Ini</h3>
        <span className="rounded-md bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">{wibDateLabel()}</span>
      </div>
      <p className="mt-1 text-[12.5px] text-[#526b62]">Presensi adalah catatan harian kelas. Jurnal terkait guru dan kelas; hasil asesmen hanya ditampilkan bila sesuai kelas dan mapel ini.</p>
      <div className="mt-3 space-y-2">
        {todayMessage ? <p role="status" className="rounded-xl bg-amber-50 p-3 text-[12.5px] text-amber-900">{todayMessage}</p> : sessions.length === 0 ? (
          <div className="grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#526b62]">Tidak ada sesi mengajar hari ini.</div>
        ) : (
          sessions.map((s, i) => (
            <button key={s.scheduleId ?? `${s.classId}-${s.jpStart}-${i}`} type="button" onClick={() => setSelected(s)} className="flex min-h-11 w-full flex-wrap items-center gap-2 rounded-xl border border-[#e6efea] bg-white p-3 text-left transition hover:border-emerald-200 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
              <div className="min-w-0 flex-1">
                <b className="text-[12.5px] text-[#0f2e25]">{s.subject} · {s.className}</b>
                <div className="text-[11.5px] text-[#526b62]">JP {s.jpStart}{s.jpEnd !== s.jpStart ? `–${s.jpEnd}` : ''} · {s.startLabel} · klik untuk rincian</div>
              </div>
              <StatusChip status={reads.attendance !== 'ready' ? 'warn' : s.hasAbsen ? 'ok' : 'no'} label={reads.attendance !== 'ready' ? 'Absen belum tersedia' : 'Absen harian'} />
              <StatusChip status={reads.journal !== 'ready' ? 'warn' : s.hasJurnal ? 'ok' : 'no'} label={reads.journal !== 'ready' ? 'Jurnal belum tersedia' : 'Jurnal kelas'} />
              <StatusChip status={reads.assessments !== 'ready' ? 'warn' : s.hasPenilaian ? 'ok' : 'no'} label={reads.assessments !== 'ready' ? 'Penilaian belum tersedia' : 'Penilaian'} />
              <StatusChip status={reads.assessments !== 'ready' ? 'warn' : s.hasFeedback ? 'ok' : 'no'} label={reads.assessments !== 'ready' ? 'Hasil belum tersedia' : 'Hasil asesmen'} />
            </button>
          ))
        )}
      </div>
      {selected && !todayMessage && <SessionDetailModal session={selected} attendances={attendances} activities={activities} reads={reads} onClose={() => setSelected(null)} />}
    </div>
  );
}

function StatusChip({ status, label }: { status: 'ok' | 'warn' | 'no' | 'miss'; label: string }) {
  const styles: Record<string, string> = {
    ok: 'bg-emerald-50 text-emerald-700',
    warn: 'bg-amber-50 text-amber-600',
    no: 'bg-slate-100 text-slate-400',
    miss: 'bg-rose-50 text-rose-600',
  };
  const icons: Record<string, string> = { ok: '✓', warn: '!', no: '—', miss: '✗' };
  return (
    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${styles[status]}`}>
      {label} {icons[status]}
    </span>
  );
}

function SessionDetailModal({ session, attendances, activities, reads, onClose }: {
  session: TodayClass;
  attendances: AttendanceItem[];
  activities: ActivityItem[];
  reads: TeacherSummaryAvailability;
  onClose: () => void;
}) {
  const today = wibTodayISO();
  const classAtt = attendances.filter((a) => a.date?.slice(0, 10) === today && a.classId === session.classId);
  const hadir = classAtt.filter((a) => a.status === 'hadir').length;
  const izin = classAtt.filter((a) => a.status === 'izin').length;
  const sakit = classAtt.filter((a) => a.status === 'sakit').length;
  const alpha = classAtt.filter((a) => a.status === 'alpha').length;
  const absent = classAtt.filter((a) => a.status !== 'hadir');
  const hasJurnal = activities.some((a) => a.date?.slice(0, 10) === today && a.classId === session.classId);

  return (
    <Dialog open onOpenChange={(open: boolean) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto p-5" onOpenAutoFocus={(event: Event) => {
        event.preventDefault();
        document.getElementById('session-detail-title')?.focus();
      }}>
        <div className="pr-10">
          <DialogTitle id="session-detail-title" tabIndex={-1} className="text-[15px] font-bold text-[#0f2e25] outline-none">Detail Sesi — {session.subject} · {session.className}</DialogTitle>
          <DialogDescription className="mt-1 text-[11.5px] text-[#526b62]">Kehadiran harian kelas dan jurnal guru–kelas, bukan bukti per-JP. Data asesmen hanya terkait kandidat tunggal pada periode ini.</DialogDescription>
        </div>
        {reads.attendance !== 'ready' && <p role="status" className="mt-3 text-xs text-amber-800">{summaryReadMessage(reads.attendance, 'Kehadiran')}</p>}
        {reads.attendance === 'ready' && !classAtt.length && <p role="status" className="mt-3 text-xs text-amber-800">Belum ada catatan kehadiran hari ini. Angka di bawah bukan jumlah seluruh siswa di kelas.</p>}
        {reads.attendance === 'ready' && <div className="mt-3 grid grid-cols-4 gap-2">
          <div className="rounded-xl bg-emerald-50 p-2 text-center"><div className="text-[18px] font-extrabold text-emerald-700">{hadir}</div><div className="text-[10px] font-semibold text-[#526b62]">Hadir</div></div>
          <div className="rounded-xl bg-sky-50 p-2 text-center"><div className="text-[18px] font-extrabold text-sky-700">{izin}</div><div className="text-[10px] font-semibold text-[#526b62]">Izin</div></div>
          <div className="rounded-xl bg-amber-50 p-2 text-center"><div className="text-[18px] font-extrabold text-amber-600">{sakit}</div><div className="text-[10px] font-semibold text-[#526b62]">Sakit</div></div>
          <div className="rounded-xl bg-rose-50 p-2 text-center"><div className="text-[18px] font-extrabold text-rose-600">{alpha}</div><div className="text-[10px] font-semibold text-[#526b62]">Alpha</div></div>
        </div>
        }
        {reads.attendance === 'ready' && absent.length > 0 && (
          <div className="mt-3 rounded-lg bg-[#f4f7f5] p-3 text-[11.5px] text-[#355a4e]">
            <b>Absen:</b> {absent.map((a) => `${a.student.user.fullName} (${a.status})`).join(' · ')}
          </div>
        )}
        {reads.assessments !== 'ready' ? <p role="status" className="mt-3 text-xs text-amber-800">{summaryReadMessage(reads.assessments, 'Asesmen')}</p> : <div className="mt-3 space-y-2">
          <div>
            <b className="text-[12px] text-[#0f2e25]">Asesmen terkait</b>
            <div className="mt-1 text-[10.5px] text-[#526b62]">{session.assessmentSessionId ? 'Satu kandidat asesmen tersedia — lihat jenis dan hasilnya di tab Penilaian.' : 'Tidak ada kandidat tunggal. Pilih modul/asesmen melalui tab Pembelajaran atau Penilaian.'}</div>
          </div>
          <div>
            <b className="text-[12px] text-[#0f2e25]">Feedback</b>
            <div className="mt-1 text-[10.5px] text-[#526b62]">{session.hasFeedback ? 'Asesmen selesai; hasil siswa dapat dibuka.' : 'Belum ada hasil asesmen yang sesuai jadwal ini. Pilih asesmen melalui Penilaian.'}</div>
          </div>
        </div>
        }
        <div className="mt-3 flex items-center justify-between">
          {reads.journal !== 'ready' ? <p role="status" className="text-xs text-amber-800">{summaryReadMessage(reads.journal, 'Jurnal')}</p> : hasJurnal && <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Jurnal ✓</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
