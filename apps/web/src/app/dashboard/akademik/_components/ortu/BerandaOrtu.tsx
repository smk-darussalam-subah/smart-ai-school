'use client';
import { useBellPattern } from '@/components/providers/BellPatternProvider';

import React, { useEffect, useState } from 'react';
import LearnerScheduleNotice from '../LearnerScheduleNotice';
import type { LearnerScheduleState } from '@/lib/learner-schedule';
import {
  CalendarClock,
  Wallet,
  TrendingUp,
  Megaphone,
  MessageCircle,
  ChevronRight,
  UserCircle,
  Phone,
  Mail,
} from 'lucide-react';
import { fmtRupiahExact, daysUntil, fmtDateShort } from '@/lib/academic';
import { learnerGradeStatus, type LearnerGradeState } from '@/lib/learner-grades';
import { LearnerGradeNotice } from '../LearnerGradeView';
import { scheduleDayOfWeek, wibNow } from '@/lib/bell-times';
import type { AttendanceItem } from '@/lib/api';
import type { OrtuScreen, ModalState } from './OrtuWorkspace';
import type { OrtuChild, OrtuNilai } from './ortu-types';
import type { ScheduleItem } from '../guru-types';
import { mpColor, gradeCls, avgNa, initials } from './ortu-data';
import {
  mapSppToPembayaran,
  mapWaLog,
  mapTodaySchedule,
  type SppApiItem,
  type WaLogApiItem,
} from './ortu-mappers';
import { fetchTeachers } from '../../actions';
import RemedialOrtu from './RemedialOrtu';
import type { LearnerAttendanceState } from '@/lib/learner-attendance';
import LearnerSessionAttendance from '../LearnerSessionAttendance';

interface BerandaOrtuProps {
  attendancePeriod?: import('@/lib/learner-attendance').AttendancePeriod;
  showToast: (msg: string) => void;
  go: (screen: OrtuScreen) => void;
  setModal: (modal: ModalState) => void;
  grades?: OrtuNilai[];
  gradeState?: LearnerGradeState;
  announcements?: { id: string; title: string; createdAt: string }[];
  // T1-02 (audit v2): data real menggantikan SIM_*
  children: OrtuChild[];
  activeChildIndex: number;
  schedule: ScheduleItem[];
  scheduleState?: LearnerScheduleState;
  spp: SppApiItem[];
  waLog: WaLogApiItem[];
  attendance: AttendanceItem[];
  attendanceState?: LearnerAttendanceState;
  rank?: number | null;
  activeStudentId?: string;
}

/** WIB-based greeting prefix. */
function greetPrefix(): string {
  const { minutes } = wibNow();
  const h = Math.floor(minutes / 60);
  if (h >= 5 && h < 11) return 'Selamat pagi';
  if (h >= 11 && h < 15) return 'Selamat siang';
  if (h >= 15 && h < 18) return 'Selamat sore';
  return 'Selamat malam';
}

const EMPTY_CHILD: OrtuChild = {
  id: 0,
  name: 'Anak',
  kelas: '—',
  active: false,
  avg: 0,
  att: 0,
  wali: '—',
};

export default function BerandaOrtu({
  showToast: _showToast,
  go,
  setModal,
  grades,
  gradeState = 'ready',
  announcements,
  children,
  activeChildIndex,
  schedule,
  scheduleState = 'ready',
  spp,
  waLog,
  rank,
  activeStudentId,
  attendancePeriod,
}: BerandaOrtuProps) {
  // U4: Fetch wali kelas / teachers for contact info
  const [teachers, setTeachers] = useState<
    Array<{ name: string; subject: string; phone: string | null; email: string | null }>
  >([]);
  const [teachersState, setTeachersState] = useState('loading');
  useEffect(() => {
    let active = true;
    setTeachers([]);
    setTeachersState('loading');
    if (!activeStudentId) {
      setTeachersState('unavailable');
      return;
    }
    fetchTeachers(activeStudentId)
      .then((res) => {
        if (!active) return;
        setTeachers(
          res.success
            ? (res.data ?? []).map((t) => ({
                name: t.teacherName,
                subject: t.subject,
                phone: t.phone,
                email: t.email,
              }))
            : [],
        );
        setTeachersState(res.success ? 'ready' : 'unavailable');
      })
      .catch(() => {
        if (active) setTeachersState('unavailable');
      });
    return () => {
      active = false;
    };
  }, [activeStudentId]);

  // T1-02: sumber data 100% real. Tidak ada lagi fallback ke SIM_*.
  const child = children[activeChildIndex] ?? EMPTY_CHILD;
  const nilai = gradeState === 'ready' ? (grades ?? []) : [];
  const avg = avgNa(nilai);
  const bell = useBellPattern();
  const dow = scheduleDayOfWeek();
  const todaySched = mapTodaySchedule(schedule, dow, bell.slots); // ganti SIM_SCHEDULE
  const hasTodaySchedule = dow !== 0 && todaySched.length > 0;

  // Pembayaran real
  const pembayaran = mapSppToPembayaran(spp);
  const unpaidItems = pembayaran.filter((p) => p.status === 'unpaid');
  const totalUnpaid = unpaidItems.reduce((s, p) => s + p.amount, 0);
  const nextDue =
    unpaidItems.length > 0
      ? [...unpaidItems].sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())[0]
      : null;
  const dd = nextDue ? daysUntil(nextDue.due) : 0;

  // WA notifikasi real
  const recentWa = mapWaLog(waLog)[0] ?? null;

  // Pengumuman real (API {id,title,createdAt} → display {id,title,tag,date})
  const pengumuman = (announcements ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    tag: 'Info',
    date: a.createdAt ? fmtDateShort(a.createdAt) : '—',
  }));

  // R-21: Ranking dari leaderboard (dipass dari page.tsx via OrtuWorkspace)
  const rankDisplay: number | null = rank ?? null;

  return (
    <div className="px-4 pb-4">
      {/* 1. Greeting */}
      <div className="mb-3.5">
        <h1 className="text-xl font-extrabold">{greetPrefix()}, Ayah!</h1>
        <p className="mt-0.5 text-[12px] font-medium text-[var(--muted)]">
          Pantau perkembangan putra Anda
        </p>
      </div>

      {/* 2. Student card */}
      <div
        className="relative mb-3.5 overflow-hidden rounded-[var(--r-lg)] p-4.5 text-white"
        style={{ background: 'var(--grad)', padding: '18px' }}
      >
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-white/30 bg-white/20 text-[18px] font-extrabold">
            {initials(child.name)}
          </div>
          <div>
            <b className="block text-[17px]">{child.name}</b>
            <small className="text-[12px] font-medium opacity-85">
              {child.kelas} · SMK Darussalam Subah
            </small>
          </div>
        </div>
        <div className="relative z-10 mt-3.5 flex gap-3">
          <div className="flex-1 text-center">
            <div className="text-[18px] font-extrabold">{avg ?? '—'}</div>
            <div className="text-[9px] font-semibold uppercase tracking-wide opacity-75">Rata²</div>
          </div>
          <div className="flex-1 text-center">
            <div className="text-[18px] font-extrabold">
              {rankDisplay != null ? `#${rankDisplay}` : '—'}
            </div>
            <div className="text-[9px] font-semibold uppercase tracking-wide opacity-75">
              Peringkat XP
            </div>
          </div>
        </div>
      </div>

      {/* 3. Monthly attendance availability is independent of schedule fetch/empty state. */}
      <div className="mb-4">
        <LearnerSessionAttendance
          key={activeStudentId}
          studentId={activeStudentId}
          period={attendancePeriod}
          shell="ortu"
          compact
        />
      </div>
      {/* 4. WA notification (latest absence) */}
      {recentWa && (
        <div
          className="mb-3.5 rounded-[var(--r)] border p-3.5"
          style={{ borderColor: 'rgba(245,158,11,.2)', background: 'rgba(245,158,11,.04)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
              style={{ background: 'rgba(245,158,11,.15)' }}
            >
              <MessageCircle className="h-[18px] w-[18px] text-[var(--amber)]" />
            </div>
            <div className="min-w-0 flex-1">
              <b className="text-[12px]">Notifikasi WA Terakhir</b>
              <small className="block text-[10px] text-[var(--muted)]">
                {recentWa.date} · {recentWa.session} — {recentWa.status.toUpperCase()}
              </small>
            </div>
            <span className="rounded-md bg-[rgba(245,158,11,.15)] px-2 py-1 text-[9px] font-extrabold text-[var(--amber)]">
              {recentWa.status}
            </span>
          </div>
        </div>
      )}

      {/* 5. Today's schedule */}
      <div className="mb-3.5 rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
            <CalendarClock className="h-[15px] w-[15px] text-[var(--pri)]" />
            Jadwal Hari Ini
          </div>
          <span className="text-[10px] font-semibold text-[var(--muted)]">
            {['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][dow]}
          </span>
        </div>
        {scheduleState !== 'ready' ? (
          <LearnerScheduleNotice state={scheduleState} />
        ) : !hasTodaySchedule ? (
          <div className="py-6 text-center text-[12px] font-semibold text-[var(--dim)]">
            Belum ada jadwal untuk hari ini
          </div>
        ) : (
          todaySched.map((slot, i) => {
            const c = mpColor(slot.mapel);
            return (
              <div
                key={i}
                className="flex gap-2.5 border-b border-[var(--border)] py-2 last:border-0"
              >
                <div className="w-24 shrink-0 pt-0.5 text-right text-xs font-bold tabular-nums text-[var(--muted)]">
                  {slot.timeRange || 'Waktu JP belum tersedia'}
                </div>
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: c }} />
                <div className="min-w-0 flex-1">
                  <div className="break-words text-[13px] font-bold">{slot.mapel}</div>
                  <div className="break-words text-xs font-medium text-[var(--muted)]">
                    {slot.guru.split(',')[0]} · {slot.room}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 6. Payment summary */}
      {unpaidItems.length > 0 && nextDue && (
        <div
          className="mb-3.5 rounded-[var(--r)] border p-3.5"
          style={{ borderColor: 'rgba(245,158,11,.2)' }}
        >
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
              <Wallet className="h-[15px] w-[15px] text-[var(--pri)]" />
              Ringkasan Pembayaran
            </div>
            <button
              onClick={() => go('pembayaran')}
              className="flex cursor-pointer items-center gap-0.5 text-[11px] font-bold text-[var(--pril)]"
            >
              Detail <ChevronRight className="h-[13px] w-[13px]" />
            </button>
          </div>
          <div className="flex items-center gap-3.5">
            <div className="flex-1">
              <div className="text-[22px] font-extrabold text-[var(--amber)]">
                {fmtRupiahExact(totalUnpaid)}
              </div>
              <small className="text-[11px] font-semibold text-[var(--muted)]">
                {unpaidItems.length} item belum dibayar
              </small>
            </div>
            <div className="text-right">
              <div className="text-[12px] font-bold text-[var(--text)]">{nextDue.jenis}</div>
              <small
                className="text-[10px] font-bold"
                style={{ color: dd < 0 ? 'var(--rose)' : 'var(--amber)' }}
              >
                {dd < 0 ? `Terlewat ${Math.abs(dd)} hari` : `Jatuh tempo ${dd} hari`}
              </small>
            </div>
          </div>
        </div>
      )}

      {/* 7. Recent grades */}
      <div className="mb-3.5 rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
            <TrendingUp className="h-[15px] w-[15px] text-[var(--pri)]" />
            Nilai Terbaru
            {nilai.length === 0 && gradeState === 'ready' && (
              <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[9px] text-sky-500">
                Belum ada data
              </span>
            )}
          </div>
          <button
            onClick={() => go('nilai')}
            className="flex cursor-pointer items-center gap-0.5 text-[11px] font-bold text-[var(--pril)]"
          >
            Detail <ChevronRight className="h-[13px] w-[13px]" />
          </button>
        </div>
        {nilai.length === 0 ? (
          <LearnerGradeNotice state={gradeState} empty />
        ) : (
          nilai.slice(0, 3).map((n) => {
            const c = mpColor(n.mp);
            const cls = gradeCls(n.na, n.kktp);
            return (
              <div
                key={n.mp}
                onClick={() => setModal({ type: 'grade', data: { nilai: n } })}
                className="mb-2 flex cursor-pointer items-center gap-2.5 rounded-[var(--r-sm)] border border-[var(--border)] p-2.5 transition-colors hover:border-[var(--border2)] hover:bg-[var(--surface2)] last:mb-0"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setModal({ type: 'grade', data: { nilai: n } });
                  }
                }}
              >
                <div className="h-10 w-1 shrink-0 rounded" style={{ background: c }} />
                <div className="min-w-0 flex-1">
                  <b className="block text-[13px]">{n.mp}</b>
                  <small className="text-[10px] font-semibold text-[var(--muted)]">
                    {learnerGradeStatus(n)} · KKTP {n.kktp ?? '—'}
                  </small>
                </div>
                <div
                  className="shrink-0 text-[18px] font-extrabold"
                  style={{
                    color:
                      cls === 'unknown'
                        ? 'var(--muted)'
                        : cls === 'ok'
                          ? 'var(--em)'
                          : cls === 'warn'
                            ? 'var(--amber)'
                            : 'var(--rose)',
                  }}
                >
                  {n.na ?? '—'}
                </div>
              </div>
            );
          })
        )}
      </div>

      <section id="ortu-remedial" className="scroll-mt-24" aria-label="Status remedial anak">
        <RemedialOrtu studentId={activeStudentId} />
      </section>

      {/* 8. Announcements */}
      <div className="mb-3.5 rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
            <Megaphone className="h-[15px] w-[15px] text-[var(--pri)]" />
            Pengumuman
          </div>
          <button
            onClick={() => setModal({ type: 'pengumuman' })}
            className="cursor-pointer text-[11px] font-bold text-[var(--pril)]"
          >
            Semua
          </button>
        </div>
        {pengumuman.slice(0, 2).map((p) => (
          <div
            key={p.id}
            onClick={() => setModal({ type: 'pengumuman' })}
            className="cursor-pointer border-b border-[var(--border)] py-2 last:border-0"
          >
            <b className="text-[12px]">{p.title}</b>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="rounded-md bg-[var(--surface2)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--pri)]">
                {p.tag}
              </span>
              <small className="text-[9.5px] text-[var(--muted)]">{p.date}</small>
            </div>
          </div>
        ))}
      </div>

      {/* 9. Wali Kelas Contact (U4) */}
      <div className="mb-3.5 rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <div className="mb-2.5 flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
          <UserCircle className="h-[15px] w-[15px] text-[var(--pri)]" />
          Guru mapel kelas anak
        </div>
        {teachers.length ? (
          teachers.map((teacher, index) => (
            <div
              key={`${teacher.name}-${teacher.subject}-${index}`}
              className="flex items-center gap-3 py-2"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--pri)] text-[14px] font-extrabold text-white">
                {teacher.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <b className="block break-words text-[13px]">{teacher.name}</b>
                <small className="text-[10px] font-semibold text-[var(--muted)]">
                  {teacher.subject}
                </small>
                {teacher.phone && (
                  <a
                    href={`tel:${teacher.phone}`}
                    className="mt-1 flex min-h-11 items-center gap-1 text-xs font-bold text-[var(--pril)]"
                  >
                    <Phone className="h-[14px] w-[14px]" /> {teacher.phone}
                  </a>
                )}
                {teacher.email && (
                  <a
                    href={`mailto:${teacher.email}`}
                    className="flex min-h-11 items-center gap-1 break-all text-xs font-bold text-[var(--pril)]"
                  >
                    <Mail className="h-[14px] w-[14px] shrink-0" /> {teacher.email}
                  </a>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="py-3 text-center text-[11px] font-semibold text-[var(--dim)]">
            {teachersState === 'loading'
              ? 'Memuat kontak guru...'
              : teachersState === 'unavailable'
                ? 'Kontak guru belum dapat dimuat. Coba muat ulang halaman.'
                : 'Belum ada kontak guru mapel untuk kelas anak.'}
          </div>
        )}
      </div>
    </div>
  );
}
