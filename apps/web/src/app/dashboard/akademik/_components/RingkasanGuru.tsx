'use client';
import React, { useId, useRef, useState } from 'react';

import {
  Target,
  GraduationCap,
  CalendarCheck,
  BookOpenCheck,
  Clock,
  PenLine,
  Info,
  Code,
  ListChecks,
  Users,
  FileText,
  ClipboardList,
  ChevronRight,
  UserCheck,
  CalendarClock,
  ClipboardPenLine,
  ClipboardCheck,
  GitBranch,
  HelpCircle,
  PlayCircle,
} from 'lucide-react';
import type { GradeItem, AttendanceItem } from '@/lib/api';
import type { ActivityItem, RppItem, TodayClass } from './guru-types';
import {
  teacherGradeRecords,
  summaryReadMessage,
  type TeacherSummaryAvailability,
  type TeacherThreshold,
} from '@/lib/teacher-summary';
import { wibDateLabel, wibTodayISO } from '@/lib/bell-times';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import AttendanceJpSummary from './AttendanceJpSummary';
import type { JpOverviewQuery } from '@/lib/session-attendance';
import { useTeacherAttendanceFollowUp } from '@/lib/use-teacher-attendance-follow-up';

interface Props {
  jpQuery?: JpOverviewQuery;
  refreshToken?: number;
  grades: GradeItem[];
  attendances: AttendanceItem[];
  activities: ActivityItem[];
  rpp: RppItem[];
  todayClasses: TodayClass[];
  availability?: TeacherSummaryAvailability;
  thresholds?: TeacherThreshold[];
  todayDate?: string;
  onAbsen: (c: TodayClass) => void;
  onJurnal: (c: {
    classId: string;
    className: string;
    subject: string;
    startLabel: string;
    jpStart: number;
  }) => void;
  onNavigate?: (screen: string) => void;
  onStartSession?: (c: TodayClass) => void;
  canReadClassSessions?: boolean;
  onPenilaian?: (c: TodayClass) => void;
}

export default function RingkasanGuru({
  grades,
  attendances,
  activities,
  rpp,
  todayClasses: suppliedTodayClasses,
  availability,
  thresholds = [],
  todayDate,
  onAbsen,
  onJurnal,
  onNavigate,
  onStartSession,
  onPenilaian,
  canReadClassSessions = false,
  jpQuery,
  refreshToken,
}: Props) {
  // Missing read metadata must not certify a successful empty dataset.
  const reads = availability ?? {
    grades: 'unavailable',
    attendance: 'unavailable',
    journal: 'unavailable',
    rpp: 'unavailable',
    assessments: 'unavailable',
    kktp: 'unavailable',
    today: 'unavailable',
  };
  const todayState =
    reads.today === 'ready' && todayDate !== wibTodayISO() ? 'unavailable' : reads.today;
  const todayClasses = todayState === 'ready' ? suppliedTodayClasses : [];
  const canActToday = () => todayState === 'ready' && todayDate === wibTodayISO();
  const gradeSummary = teacherGradeRecords(
    reads.grades === 'ready' ? grades : [],
    reads.kktp === 'ready' ? thresholds : [],
  );
  const tuntas = gradeSummary.percentage;
  const rata = gradeSummary.average;
  const hadirPct =
    reads.attendance === 'ready' && attendances.length
      ? Math.round(
          (attendances.filter((a) => a.status === 'hadir').length / attendances.length) * 100,
        )
      : null;
  const hadirCount = attendances.filter((a) => a.status === 'hadir').length;
  const izinCount = attendances.filter((a) => a.status === 'izin').length;
  const sakitCount = attendances.filter((a) => a.status === 'sakit').length;
  const alphaCount = attendances.filter((a) => a.status === 'alpha').length;

  const rppPending =
    reads.rpp === 'ready'
      ? rpp.filter((r) => r.status === 'draft' || r.status === 'revision').length
      : 0;
  const today = wibTodayISO();
  const [attendanceRetry, setAttendanceRetry] = useState(0);
  const attendanceTriggers = useRef(new Map<string, HTMLButtonElement>());
  const attendanceActionsHeading = useRef<HTMLHeadingElement>(null);
  const attendanceFollowUp = useTeacherAttendanceFollowUp(
    todayClasses,
    today,
    jpQuery,
    canReadClassSessions,
    (refreshToken ?? 0) + attendanceRetry,
  );
  // P6: tugasBelumDinilai removed — honest empty until /submissions/* ready
  // R-13: Assessment sessions linked to today's classes via assessmentSessionId
  const kelasBelumDinilai =
    reads.assessments === 'ready' ? todayClasses.filter((c) => !c.assessmentSessionId).length : 0;
  const actionsIncomplete =
    ['grades', 'attendance', 'rpp', 'assessments', 'kktp'].some(
      (key) => reads[key as keyof TeacherSummaryAvailability] !== 'ready',
    ) ||
    (todayState !== 'ready' && todayState !== 'outside-period') ||
    gradeSummary.unknown > 0;
  const denied = Object.values(reads).includes('denied');
  const unavailable = Object.values(reads).includes('unavailable');
  const incompleteMessage = denied
    ? `Sebagian data tidak ditampilkan karena izin akun Anda.${unavailable ? ' Sumber lain juga belum dapat dimuat; coba muat ulang untuk sumber tersebut.' : ''}`
    : 'Sebagian data tindak lanjut belum tersedia. Daftar ini belum lengkap; coba muat ulang halaman.';
  const todayMessage =
    todayState === 'outside-period'
      ? 'Periode yang dipilih bukan periode kegiatan hari ini. Jadwalnya tetap dapat dilihat.'
      : summaryReadMessage(todayState === 'denied' ? 'denied' : 'unavailable', 'Jadwal hari ini');
  const tindakan = [
    gradeSummary.below > 0 && {
      icon: Users,
      color: 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300',
      title: `${gradeSummary.below} record nilai di bawah KKTP`,
      sub: 'Tinjau nilai; bukan keputusan remedial per siswa',
      action: 'penilaian',
    },
    attendanceFollowUp.pending > 0 && {
      icon: ClipboardList,
      color: 'bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200',
      title: `${attendanceFollowUp.pending} sesi belum lengkap absensinya`,
      sub: 'Catat kehadiran sesi berikutnya',
      action: 'attendance',
    },
    rppPending > 0 && {
      icon: FileText,
      color: 'bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300',
      title: `${rppPending} Modul Ajar belum disetujui`,
      sub: 'Draft/revisi — ajukan ke Wakakur',
      action: 'pembelajaran',
    },
    // R-13: Show action when classes today don't have assessment sessions linked yet
    kelasBelumDinilai > 0 && {
      icon: ClipboardPenLine,
      color: 'bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300',
      title: `${kelasBelumDinilai} kelas belum punya sesi penilaian`,
      sub: 'Buat sesi asesmen dari Modul Ajar',
      action: 'pembelajaran',
    },
  ].filter(Boolean) as {
    icon: typeof Users;
    color: string;
    title: string;
    sub: string;
    action: string;
  }[];

  return (
    <div className="space-y-4">
      {canReadClassSessions && (
        <a
          href="/dashboard/jadwal#today-class-sessions"
          className="inline-flex min-h-11 items-center gap-2 font-bold text-emerald-800 dark:text-emerald-200 underline"
        >
          <PlayCircle className="h-4 w-4" aria-hidden="true" />
          Sesi pembelajaran
        </a>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={Target}
          label="Nilai mencapai KKTP"
          value={tuntas !== null ? `${tuntas}%` : '—'}
          sub={
            reads.grades !== 'ready'
              ? summaryReadMessage(reads.grades, 'Nilai')
              : reads.kktp !== 'ready'
                ? summaryReadMessage(reads.kktp, 'KKTP resmi')
                : gradeSummary.unknown
                  ? `KKTP untuk ${gradeSummary.unknown} record belum tersedia.`
                  : tuntas !== null
                    ? `${gradeSummary.passed} dari ${gradeSummary.records} record nilai`
                    : 'Belum ada record nilai.'
          }
          tooltip="Persentase record nilai yang mencapai KKTP resmi mapelnya. Satu siswa dapat memiliki beberapa record; ini bukan jumlah siswa atau nilai akhir rapor."
        />
        <Kpi
          icon={GraduationCap}
          label="Rata-rata record nilai"
          value={rata !== null ? `${rata}` : '—'}
          sub={
            reads.grades !== 'ready'
              ? summaryReadMessage(reads.grades, 'Nilai')
              : gradeSummary.records
                ? `dari ${gradeSummary.records} record nilai`
                : 'Belum ada record nilai.'
          }
          tooltip="Rata-rata nilai yang tercatat, bukan NA berbobot per siswa dan mapel."
        />
        <Kpi
          icon={CalendarCheck}
          label="Kehadiran harian"
          value={hadirPct !== null ? `${hadirPct}%` : '—'}
          sub={
            reads.attendance !== 'ready'
              ? summaryReadMessage(reads.attendance, 'Kehadiran')
              : attendances.length
                ? `${hadirCount} hadir · ${izinCount} izin · ${sakitCount} sakit · ${alphaCount} alpha`
                : 'Belum ada catatan kehadiran.'
          }
        />
        <Kpi
          icon={BookOpenCheck}
          label="Catatan jurnal"
          value={reads.journal === 'ready' ? `${activities.length}` : '—'}
          sub={
            reads.journal === 'ready'
              ? 'record jurnal guru–kelas, bukan jumlah pertemuan'
              : summaryReadMessage(reads.journal, 'Jurnal')
          }
        />
      </div>

      {canReadClassSessions && jpQuery && (
        <AttendanceJpSummary query={jpQuery} refreshToken={(refreshToken ?? 0) + attendanceRetry} />
      )}

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* Kelas Hari Ini */}
        <div className="min-w-0 border-t border-slate-200 py-5 dark:border-slate-700">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 dark:text-slate-100">
              <Clock className="h-[18px] w-[18px] text-emerald-700 dark:text-emerald-300" />
              Kelas Hari Ini
            </h3>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-sky-50 dark:bg-sky-950 px-2.5 py-1 text-xs font-bold text-sky-700 dark:text-sky-300">
                {wibDateLabel()}
              </span>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('jadwal')}
                  className="min-h-11 rounded-lg px-2 text-sm font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                >
                  Lihat jadwal →
                </button>
              )}
            </div>
          </div>
          {todayState !== 'ready' ? (
            <p
              role="status"
              className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950 p-3 text-sm text-amber-900 dark:text-amber-100"
            >
              {todayMessage}
            </p>
          ) : todayClasses.length === 0 ? (
            <div className="mt-3 grid h-20 place-items-center rounded-lg bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-600 dark:text-slate-300">
              Tidak ada jadwal mengajar hari ini.
            </div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {todayClasses.map((c, i) => (
                <div
                  key={c.scheduleId ?? `${c.classId}-${c.jpStart}-${i}`}
                  className="group rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3.5 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_2px_6px_rgba(16,40,33,.06),0_22px_40px_-20px_rgba(16,40,33,.28)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                      <Code className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <b className="text-sm text-slate-950 dark:text-slate-100">
                        {c.subject} · {c.className}
                      </b>
                      <div className="text-[12px] text-slate-600 dark:text-slate-300">
                        JP {c.jpStart}
                        {c.jpEnd !== c.jpStart ? `–${c.jpEnd}` : ''} · {c.startLabel} ·{' '}
                        {c.room ?? 'Ruang —'}
                        {c.isNow ? ' · dalam rentang jadwal' : ''}
                      </div>
                    </div>
                    {c.isNow && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950 px-2.5 py-1 text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                        Rentang jadwal
                      </span>
                    )}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {onStartSession && (
                      <button
                        type="button"
                        onClick={() => canActToday() && onStartSession(c)}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-sm font-bold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
                      >
                        <PlayCircle className="h-4 w-4" />
                        Panduan mengajar
                      </button>
                    )}
                    <button
                      ref={(node) => {
                        const key = c.classSessionId ?? c.scheduleId;
                        if (!key) return;
                        if (node) attendanceTriggers.current.set(key, node);
                        else attendanceTriggers.current.delete(key);
                      }}
                      type="button"
                      onClick={() => canActToday() && onAbsen(c)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-[#f4f7f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                    >
                      <CalendarCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                      Absen sesi
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        canActToday() &&
                        onJurnal({
                          classId: c.classId,
                          className: c.className,
                          subject: c.subject,
                          startLabel: c.startLabel,
                          jpStart: c.jpStart,
                        })
                      }
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-[#f4f7f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                    >
                      <PenLine className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                      Jurnal
                    </button>
                    {onPenilaian && (
                      <button
                        type="button"
                        onClick={() => canActToday() && onPenilaian(c)}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-[#f4f7f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                      >
                        <ClipboardPenLine className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                        Nilai
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {todayState === 'ready' && todayClasses.length > 0 && (
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              <Info className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              Klik <b>Absen</b> untuk mencatat kehadiran atau <b>Jurnal</b> untuk menulis catatan
              kelas. Periksa isian sebelum menyimpan.
            </p>
          )}
        </div>

        {/* Perlu Tindakan */}
        <div className="min-w-0 border-t border-slate-200 py-5 dark:border-slate-700">
          <h3
            ref={attendanceActionsHeading}
            tabIndex={-1}
            className="flex items-center gap-2 text-base font-bold text-slate-950 dark:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700"
          >
            <ListChecks className="h-[18px] w-[18px] text-emerald-700 dark:text-emerald-300" />
            Perlu Tindakan
          </h3>
          {attendanceFollowUp.unverified > 0 && (
            <div className="mt-3 text-sm text-slate-600 dark:text-slate-300" role="status">
              <p>
                {attendanceFollowUp.state === 'loading'
                  ? 'Memeriksa absensi sesi…'
                  : 'Kelengkapan absensi sesi belum dapat dipastikan.'}
              </p>
              {attendanceFollowUp.state !== 'loading' && attendanceFollowUp.state !== 'denied' && (
                <button
                  type="button"
                  onClick={(event) => {
                    // This control unmounts while loading. Move only its own focus,
                    // synchronously, so a late response never steals focus elsewhere.
                    if (document.activeElement === event.currentTarget)
                      attendanceActionsHeading.current?.focus();
                    setAttendanceRetry((n) => n + 1);
                  }}
                  className="min-h-11 rounded-lg px-2 font-semibold text-emerald-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 dark:text-emerald-300"
                >
                  Muat ulang absensi sesi
                </button>
              )}
            </div>
          )}
          {actionsIncomplete && (
            <p
              role="status"
              className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950 p-3 text-sm text-amber-900 dark:text-amber-100"
            >
              {incompleteMessage}
            </p>
          )}
          {tindakan.length === 0 && !actionsIncomplete && !attendanceFollowUp.unverified ? (
            <div className="mt-3 grid h-20 place-items-center rounded-lg bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-600 dark:text-slate-300">
              Tidak ada tindakan tertunda.
            </div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {tindakan.map((t, i) => {
                const Icon = t.icon;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      if (t.action !== 'attendance') {
                        onNavigate?.(t.action);
                        return;
                      }
                      const first = attendanceFollowUp.pendingSessions[0];
                      const target =
                        first &&
                        todayClasses.find((c) =>
                          c.classSessionId
                            ? c.classSessionId === first.sessionId
                            : c.scheduleId === first.scheduleId,
                        );
                      if (first && target && canActToday()) {
                        // The reminder can disappear after save; return dialog focus
                        // to its persistent class-card control instead.
                        attendanceTriggers.current
                          .get(target.classSessionId ?? target.scheduleId ?? '')
                          ?.focus();
                        onAbsen({ ...target, classSessionId: first.sessionId });
                      }
                    }}
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-left transition hover:border-emerald-200 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                  >
                    <div
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${t.color}`}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <b className="text-sm text-slate-950 dark:text-slate-100">{t.title}</b>
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-300">{t.sub}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-300" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Status Hari Ini */}
      <StatusHariIni
        todayClasses={todayClasses}
        attendances={attendances}
        activities={activities}
        reads={reads}
        todayMessage={todayState === 'ready' ? null : todayMessage}
      />

      {/* Alur Kerja Guru */}
      <div className="min-w-0 border-t border-slate-200 py-5 dark:border-slate-700">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 dark:text-slate-100">
          <GitBranch className="h-[18px] w-[18px] text-emerald-700 dark:text-emerald-300" />
          Alur Kerja Guru
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Dari awal tahun hingga rekap audit — semua terhubung dalam satu sistem.
        </p>
        <div className="mt-3 space-y-2">
          <FlowStep
            step="1"
            icon={UserCheck}
            color="bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300"
            title="Awal Tahun — Pembagian Tugas oleh KS"
            desc="KS menugaskan guru ke kelas & mapel → otomatis muncul di filter & jadwal"
            onClick={() => onNavigate?.('jadwal')}
          />
          <FlowStep
            step="2"
            icon={FileText}
            color="bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
            title="Buat & Ajukan Modul Ajar"
            desc="RPP wizard 11-langkah → ajukan ke Wakakur → aktifkan di LMS"
            onClick={() => onNavigate?.('pembelajaran')}
          />
          <FlowStep
            step="3"
            icon={CalendarClock}
            color="bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300"
            title="Mengajar Sesuai Jadwal"
            desc='Klik "Mulai Sesi" pada kelas hari ini → panduan in-class procedure'
            onClick={() => onNavigate?.('jadwal')}
          />
          <FlowStep
            step="4"
            icon={ClipboardPenLine}
            color="bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200"
            title="Penilaian & Remedial"
            desc="Gradebook terisi otomatis (formatif) + manual (praktik/sikap) → remedial untuk belum tuntas"
            onClick={() => onNavigate?.('penilaian')}
          />
          <FlowStep
            step="5"
            icon={ClipboardCheck}
            color="bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300"
            title="Rekap Audit & Rapor"
            desc="Semua data agregasi → KS/Wakakur audit → terbit ke Rapor orang tua"
            onClick={() => onNavigate?.('rekap')}
          />
        </div>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tooltip,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  sub?: string;
  tooltip?: string;
}) {
  const helpId = useId(),
    helpButton = useRef<HTMLButtonElement>(null);
  const [showHelp, setShowHelp] = useState(false);
  return (
    <div
      className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && showHelp) {
          event.preventDefault();
          setShowHelp(false);
          helpButton.current?.focus();
        }
      }}
    >
      <div className="flex min-h-11 items-start justify-between gap-2">
        <p className="flex min-w-0 items-start gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
          <Icon
            className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300"
            aria-hidden="true"
          />
          <span>{label}</span>
        </p>
        {tooltip && (
          <button
            ref={helpButton}
            type="button"
            title={'Penjelasan ' + label}
            aria-label={'Penjelasan ' + label}
            aria-expanded={showHelp}
            aria-controls={helpId}
            onClick={() => setShowHelp((v) => !v)}
            className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:focus-visible:outline-emerald-400"
          >
            <HelpCircle className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums text-slate-950 dark:text-slate-100">
        {value}
      </p>
      {sub && (
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{sub}</p>
      )}
      {tooltip && (
        <p
          id={helpId}
          hidden={!showHelp}
          className="mt-3 border-t border-slate-200 pt-3 text-sm leading-relaxed text-slate-700 dark:border-slate-700 dark:text-slate-200"
        >
          {tooltip}
        </p>
      )}
    </div>
  );
}

function FlowStep({
  step,
  icon: Icon,
  color,
  title,
  desc,
  onClick,
}: {
  step: string;
  icon: typeof Target;
  color: string;
  title: string;
  desc: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-left transition hover:border-emerald-200 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
    >
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${color}`}>
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <b className="text-sm text-slate-950 dark:text-slate-100">
          {step}. {title}
        </b>
        <div className="text-sm text-slate-600 dark:text-slate-300">{desc}</div>
      </div>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-300"
        aria-hidden="true"
      />
    </button>
  );
}

function StatusHariIni({
  todayClasses,
  attendances,
  activities,
  reads,
  todayMessage,
}: {
  todayClasses: TodayClass[];
  attendances: AttendanceItem[];
  activities: ActivityItem[];
  reads: TeacherSummaryAvailability;
  todayMessage: string | null;
}) {
  const [selected, setSelected] = useState<TodayClass | null>(null);
  const selectedTrigger = useRef<HTMLButtonElement | null>(null);
  const today = wibTodayISO();

  const sessions = todayClasses.map((tc) => {
    const classAtt = attendances.filter(
      (a) => a.date?.slice(0, 10) === today && a.classId === tc.classId,
    );
    const hasAbsen = classAtt.length > 0;
    const hasJurnal = activities.some(
      (a) => a.date?.slice(0, 10) === today && a.classId === tc.classId,
    );
    // R-13: Wire to real assessment session data — no longer hardcoded false.
    // hasPenilaian = true jika ada assessment session linked untuk kelas ini.
    // hasFeedback = true jika session sudah completed (hasil sudah ada).
    const hasPenilaian = !!tc.assessmentSessionId;
    const hasFeedback = tc.hasFeedback === true;
    return { ...tc, hasAbsen, hasJurnal, hasPenilaian, hasFeedback, classAtt };
  });

  return (
    <div className="min-w-0 border-t border-slate-200 py-5 dark:border-slate-700">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 dark:text-slate-100">
          <ClipboardList className="h-[18px] w-[18px] text-emerald-700 dark:text-emerald-300" />
          Status Hari Ini
        </h3>
        <span className="rounded-md bg-sky-50 dark:bg-sky-950 px-2.5 py-1 text-xs font-bold text-sky-700 dark:text-sky-300">
          {wibDateLabel()}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        Presensi adalah catatan harian kelas. Jurnal terkait guru dan kelas; hasil asesmen hanya
        ditampilkan bila sesuai kelas dan mapel ini.
      </p>
      <div className="mt-3 space-y-2">
        {todayMessage ? (
          <p
            role="status"
            className="rounded-lg bg-amber-50 dark:bg-amber-950 p-3 text-sm text-amber-900 dark:text-amber-100"
          >
            {todayMessage}
          </p>
        ) : sessions.length === 0 ? (
          <div className="grid h-20 place-items-center rounded-lg bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-600 dark:text-slate-300">
            Tidak ada sesi mengajar hari ini.
          </div>
        ) : (
          sessions.map((s, i) => (
            <button
              key={s.scheduleId ?? `${s.classId}-${s.jpStart}-${i}`}
              type="button"
              onClick={(event) => {
                selectedTrigger.current = event.currentTarget;
                setSelected(s);
              }}
              className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-emerald-400 dark:focus-visible:outline-emerald-400"
            >
              <div className="min-w-0 flex-1">
                <b className="text-sm text-slate-950 dark:text-slate-100">
                  {s.subject} · {s.className}
                </b>
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  JP {s.jpStart}
                  {s.jpEnd !== s.jpStart ? `–${s.jpEnd}` : ''} · {s.startLabel}
                </div>
              </div>
              <ChevronRight
                className="mt-1 h-4 w-4 text-slate-600 dark:text-slate-300"
                aria-hidden="true"
              />
              <div className="col-span-2 flex flex-wrap gap-2">
                <StatusChip
                  status={reads.attendance !== 'ready' ? 'warn' : s.hasAbsen ? 'ok' : 'no'}
                  label={reads.attendance !== 'ready' ? 'Absen belum tersedia' : 'Absen harian'}
                />
                <StatusChip
                  status={reads.journal !== 'ready' ? 'warn' : s.hasJurnal ? 'ok' : 'no'}
                  label={reads.journal !== 'ready' ? 'Jurnal belum tersedia' : 'Jurnal kelas'}
                />
                <StatusChip
                  status={reads.assessments !== 'ready' ? 'warn' : s.hasPenilaian ? 'ok' : 'no'}
                  label={reads.assessments !== 'ready' ? 'Penilaian belum tersedia' : 'Penilaian'}
                />
                <StatusChip
                  status={reads.assessments !== 'ready' ? 'warn' : s.hasFeedback ? 'ok' : 'no'}
                  label={reads.assessments !== 'ready' ? 'Hasil belum tersedia' : 'Hasil asesmen'}
                />
              </div>
            </button>
          ))
        )}
      </div>
      {selected && !todayMessage && (
        <SessionDetailModal
          session={selected}
          attendances={attendances}
          activities={activities}
          reads={reads}
          returnFocusTo={selectedTrigger.current}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function StatusChip({ status, label }: { status: 'ok' | 'warn' | 'no' | 'miss'; label: string }) {
  const styles: Record<string, string> = {
    ok: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300',
    warn: 'bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200',
    no: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
    miss: 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300',
  };
  const icons: Record<string, string> = { ok: '✓', warn: '!', no: '—', miss: '✗' };
  return (
    <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${styles[status]}`}>
      {label} {icons[status]}
    </span>
  );
}

function SessionDetailModal({
  session,
  attendances,
  activities,
  reads,
  returnFocusTo,
  onClose,
}: {
  session: TodayClass;
  attendances: AttendanceItem[];
  activities: ActivityItem[];
  reads: TeacherSummaryAvailability;
  returnFocusTo: HTMLButtonElement | null;
  onClose: () => void;
}) {
  const title = useRef<HTMLHeadingElement | null>(null);
  const today = wibTodayISO();
  const classAtt = attendances.filter(
    (a) => a.date?.slice(0, 10) === today && a.classId === session.classId,
  );
  const hadir = classAtt.filter((a) => a.status === 'hadir').length;
  const izin = classAtt.filter((a) => a.status === 'izin').length;
  const sakit = classAtt.filter((a) => a.status === 'sakit').length;
  const alpha = classAtt.filter((a) => a.status === 'alpha').length;
  const absent = classAtt.filter((a) => a.status !== 'hadir');
  const hasJurnal = activities.some(
    (a) => a.date?.slice(0, 10) === today && a.classId === session.classId,
  );

  return (
    <Dialog
      open
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90vh] max-w-md overflow-y-auto bg-white p-5 dark:bg-slate-900 dark:text-slate-100"
        onOpenAutoFocus={(event: Event) => {
          event.preventDefault();
          title.current?.focus();
        }}
        onCloseAutoFocus={(event: Event) => {
          event.preventDefault();
          if (returnFocusTo?.isConnected) returnFocusTo.focus();
        }}
      >
        <div className="pr-10">
          <DialogTitle
            ref={title}
            tabIndex={-1}
            className="text-base font-bold text-slate-950 dark:text-slate-100 outline-none"
          >
            Detail Sesi — {session.subject} · {session.className}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Kehadiran harian kelas dan jurnal guru–kelas, bukan bukti per-JP. Data asesmen hanya
            terkait kandidat tunggal pada periode ini.
          </DialogDescription>
        </div>
        {reads.attendance !== 'ready' && (
          <p role="status" className="mt-3 text-xs text-amber-800 dark:text-amber-200">
            {summaryReadMessage(reads.attendance, 'Kehadiran')}
          </p>
        )}
        {reads.attendance === 'ready' && !classAtt.length && (
          <p role="status" className="mt-3 text-xs text-amber-800 dark:text-amber-200">
            Belum ada catatan kehadiran hari ini. Angka di bawah bukan jumlah seluruh siswa di
            kelas.
          </p>
        )}
        {reads.attendance === 'ready' && (
          <div className="mt-3 grid grid-cols-4 gap-2">
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950 p-2 text-center">
              <div className="text-[18px] font-extrabold text-emerald-700 dark:text-emerald-300">
                {hadir}
              </div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Hadir</div>
            </div>
            <div className="rounded-lg bg-sky-50 dark:bg-sky-950 p-2 text-center">
              <div className="text-[18px] font-extrabold text-sky-700 dark:text-sky-300">
                {izin}
              </div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Izin</div>
            </div>
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950 p-2 text-center">
              <div className="text-[18px] font-extrabold text-amber-800 dark:text-amber-200">
                {sakit}
              </div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Sakit</div>
            </div>
            <div className="rounded-lg bg-rose-50 dark:bg-rose-950 p-2 text-center">
              <div className="text-[18px] font-extrabold text-rose-700 dark:text-rose-300">
                {alpha}
              </div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Alpha</div>
            </div>
          </div>
        )}
        {reads.attendance === 'ready' && absent.length > 0 && (
          <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-sm text-slate-700 dark:text-slate-200">
            <b>Absen:</b>{' '}
            {absent.map((a) => `${a.student.user.fullName} (${a.status})`).join(' · ')}
          </div>
        )}
        {reads.assessments !== 'ready' ? (
          <p role="status" className="mt-3 text-xs text-amber-800 dark:text-amber-200">
            {summaryReadMessage(reads.assessments, 'Asesmen')}
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            <div>
              <b className="text-[12px] text-slate-950 dark:text-slate-100">Asesmen terkait</b>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                {session.assessmentSessionId
                  ? 'Satu kandidat asesmen tersedia — lihat jenis dan hasilnya di tab Penilaian.'
                  : 'Tidak ada kandidat tunggal. Pilih modul/asesmen melalui tab Pembelajaran atau Penilaian.'}
              </div>
            </div>
            <div>
              <b className="text-[12px] text-slate-950 dark:text-slate-100">Feedback</b>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                {session.hasFeedback
                  ? 'Asesmen selesai; hasil siswa dapat dibuka.'
                  : 'Belum ada hasil asesmen yang sesuai jadwal ini. Pilih asesmen melalui Penilaian.'}
              </div>
            </div>
          </div>
        )}
        <div className="mt-3 flex items-center justify-between">
          {reads.journal !== 'ready' ? (
            <p role="status" className="text-xs text-amber-800 dark:text-amber-200">
              {summaryReadMessage(reads.journal, 'Jurnal')}
            </p>
          ) : (
            hasJurnal && (
              <span className="rounded-md bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                Jurnal ✓
              </span>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
