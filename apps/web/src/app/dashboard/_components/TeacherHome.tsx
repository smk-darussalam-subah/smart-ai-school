'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FilePenLine,
  LogIn,
  Play,
  RefreshCw,
} from 'lucide-react';
import { useAttendance } from '@/components/attendance/AttendanceEngine';
import { formatAttendanceTime } from '@/lib/staff-attendance';
import {
  teacherHomeCanStart,
  teacherHomeSessionHref,
  type TeacherHomeData,
  type HomeRead,
} from '@/lib/teacher-home';
import { learningTime } from '@/lib/learning-recap';
import { startClassSession } from '../jadwal/actions';
import { wibTodayISO } from '@/lib/bell-times';
import AttendanceRecap from '../akademik/_components/AttendanceRecap';

const panel =
  'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:p-6';
const muted = 'text-sm leading-6 text-slate-600 dark:text-slate-300';
const primary =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-50';
const secondary =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800';

function Problem({ read }: { read: Exclude<HomeRead<unknown>, { state: 'ready' }> }) {
  return (
    <p className="mt-2 text-sm text-amber-800 dark:text-amber-200" role="status">
      {read.message}
    </p>
  );
}

export function MyAttendanceCard() {
  const { context, error, loading, busy, openPrompt, refresh } = useAttendance();
  const verified = !error && context;
  const receipt =
    verified && context.receipt?.date.slice(0, 10) === context.date ? context.receipt : null;
  return (
    <section className={panel} aria-labelledby="home-presensi-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="home-presensi-heading" className="flex items-center gap-2 text-lg font-bold">
            <ClipboardCheck
              className="h-5 w-5 text-emerald-700 dark:text-emerald-400"
              aria-hidden
            />
            Presensi Saya
          </h2>
          <p className={`mt-2 ${muted}`}>
            {loading
              ? 'Memuat status presensi…'
              : !verified
                ? 'Status presensi belum dapat dimuat.'
                : receipt
                  ? `Masuk ${formatAttendanceTime(receipt.checkInAt)}${receipt.checkOutAt ? ` · Pulang ${formatAttendanceTime(receipt.checkOutAt)}` : ' · Belum mencatat pulang'}`
                  : context.arrival.basis === 'EXEMPT'
                    ? 'Tidak terikat jam kedatangan. Catat kehadiran Anda saat berada di sekolah.'
                    : context.workingDay
                      ? 'Anda belum mencatat kehadiran hari ini.'
                      : 'Hari ini bukan hari kerja aktif.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!verified && !loading ? (
            <button type="button" className={secondary} onClick={() => void refresh()}>
              <RefreshCw className="h-4 w-4" />
              Coba lagi
            </button>
          ) : (
            verified &&
            context.eligible &&
            !receipt?.checkOutAt && (
              <button
                type="button"
                className={primary}
                disabled={loading || busy}
                onClick={() => void openPrompt(Boolean(receipt))}
              >
                <LogIn className="h-4 w-4" aria-hidden />
                {receipt ? 'Catat pulang' : 'Catat kehadiran'}
              </button>
            )
          )}
          <Link className={secondary} href="/dashboard/presensi-guru">
            Lihat presensi
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function TeacherHome({
  firstName,
  periodLabel,
  date,
  generatedAt,
  data,
  canOperate,
  canCheckin,
  leadership,
  canManageCalendar = false,
  attendancePeriod,
  agenda = [],
}: {
  firstName: string;
  periodLabel: string | null;
  date: string;
  generatedAt: string;
  data: TeacherHomeData;
  canOperate: boolean;
  canCheckin: boolean;
  leadership: boolean;
  canManageCalendar?: boolean;
  attendancePeriod?: { academicYear: string; semester: number };
  agenda?: {
    id: string;
    name: string;
    date: string;
    time: string | null;
    location: string | null;
  }[];
}) {
  const router = useRouter();
  useEffect(() => {
    const rollover = () => {
      if (wibTodayISO() !== date) router.refresh();
    };
    const timer = window.setTimeout(
      rollover,
      Math.max(1000, Date.parse(`${date}T00:00:00+07:00`) + 86400000 - Date.now() + 250),
    );
    window.addEventListener('focus', rollover);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', rollover);
    };
  }, [date, router]);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const [clock, setClock] = useState(Date.parse(generatedAt));
  useEffect(() => {
    setClock(Date.parse(generatedAt));
  }, [generatedAt]);
  useEffect(() => {
    if (data.sessions.state !== 'ready') return;
    const next = data.sessions.data
      .flatMap((s) => [Date.parse(s.scheduledStartAt) - 600_000, Date.parse(s.scheduledEndAt)])
      .filter((time) => time > clock)
      .sort((a, b) => a - b)[0];
    if (!next) return;
    const timer = window.setTimeout(
      () => setClock(Date.now()),
      Math.max(1, next - Date.now() + 100),
    );
    return () => window.clearTimeout(timer);
  }, [clock, data.sessions]);
  const rows =
    data.sessions.state === 'ready'
      ? [...data.sessions.data].sort((a, b) => a.scheduledStartAt.localeCompare(b.scheduledStartAt))
      : [];
  const current =
    rows.find((s) => s.status === 'STARTED') ??
    rows.find(
      (s) => ['SCHEDULED', 'REASSIGNED'].includes(s.status) && Date.parse(s.scheduledEndAt) > clock,
    );
  const counts = {
    completed: rows.filter((s) => s.status === 'COMPLETED').length,
    active: rows.filter((s) => s.status === 'STARTED').length,
    upcoming: rows.filter((s) => ['SCHEDULED', 'REASSIGNED'].includes(s.status)).length,
  };
  const openSession = async () => {
    if (!current || inFlight.current) return;
    if (!teacherHomeCanStart(current, Date.now()) || !canOperate) {
      router.push(teacherHomeSessionHref(current));
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setNotice('');
    try {
      const result = await startClassSession(current.id, crypto.randomUUID());
      if (!result.success) {
        setNotice(result.error);
        router.refresh();
        return;
      }
      router.push(teacherHomeSessionHref(current));
      router.refresh();
    } catch {
      setNotice('Sesi belum dapat dimulai. Periksa koneksi lalu coba lagi.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const recapHref = '/dashboard/akademik?view=learning-recap&workspace=teaching';
  const fullDate = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00+07:00`));
  return (
    <div
      className="mx-auto max-w-6xl space-y-5 rounded-2xl bg-slate-50 p-4 pb-8 text-slate-950 dark:bg-slate-950 dark:text-slate-100 sm:p-6"
      data-help-anchor="beranda-guru"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            Ruang kerja Guru
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Selamat datang, {firstName}</h1>
          <p className={`mt-2 ${muted}`}>
            {fullDate} · {periodLabel ?? 'Periode aktif belum tersedia'}
          </p>
        </div>
        <button type="button" className={secondary} onClick={() => router.refresh()}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          Muat ulang
        </button>
      </header>

      <section
        className={`${panel} border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30`}
        aria-labelledby="home-session-heading"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              {current?.status === 'STARTED' ? 'Sedang berlangsung' : 'Sesi berikutnya'}
            </p>
            <h2 id="home-session-heading" className="mt-2 text-xl font-bold">
              {current
                ? current.subjectSnapshot
                : data.sessions.state !== 'ready'
                  ? 'Sesi belum dapat dimuat'
                  : 'Tidak ada sesi berikutnya hari ini'}
            </h2>
            {current ? (
              <p className={`mt-2 ${muted}`}>
                {current.classNameSnapshot} · JP {current.schedule.jpStart}–{current.schedule.jpEnd}{' '}
                · {learningTime(current.scheduledStartAt)}–{learningTime(current.scheduledEndAt)}{' '}
                WIB
              </p>
            ) : data.sessions.state !== 'ready' ? (
              <Problem read={data.sessions} />
            ) : (
              <p className={`mt-2 ${muted}`}>Jadwal dan pembelajaran Anda tetap dapat dibuka.</p>
            )}
          </div>
          {current ? (
            <button
              type="button"
              className={primary}
              disabled={busy}
              onClick={() => void openSession()}
            >
              <Play className="h-4 w-4" aria-hidden />
              {busy
                ? 'Memulai…'
                : current.status === 'STARTED'
                  ? 'Masuk sesi'
                  : teacherHomeCanStart(current, clock) && canOperate
                    ? 'Mulai sesi'
                    : 'Lihat sesi'}
            </button>
          ) : (
            <Link className={secondary} href="/dashboard/jadwal">
              Buka jadwal
            </Link>
          )}
        </div>
        {current?.operationBlockedReason && current.status !== 'STARTED' && (
          <p className={`mt-3 ${muted}`}>{current.operationBlockedReason}</p>
        )}
        {notice && (
          <p className="mt-3 text-sm text-rose-800 dark:text-rose-200" role="alert">
            {notice}
          </p>
        )}
        <Link
          href={recapHref}
          className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300"
        >
          Pembelajaran Saya <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>

      {canCheckin && <MyAttendanceCard />}

      <section aria-labelledby="home-followup-heading">
        <h2 id="home-followup-heading" className="mb-3 text-lg font-bold">
          Perlu ditindaklanjuti
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <article className={panel}>
            <ClipboardCheck
              className="mb-3 h-5 w-5 text-amber-700 dark:text-amber-300"
              aria-hidden
            />
            <h3 className="font-bold">Absensi siswa</h3>
            {data.attendance.state !== 'ready' ? (
              <Problem read={data.attendance} />
            ) : (
              <p className={`mt-2 ${muted}`}>
                {data.attendance.data.pending
                  ? `${data.attendance.data.pending} sesi belum lengkap.`
                  : data.attendance.data.unverified
                    ? 'Status absensi perlu diperiksa.'
                    : rows.some((s) => ['STARTED', 'COMPLETED'].includes(s.status))
                      ? 'Absensi sesi sudah lengkap.'
                      : 'Belum ada sesi berjalan yang perlu diabsen.'}
                {data.attendance.data.unverified > 0 &&
                  ` ${data.attendance.data.unverified} sesi perlu diperiksa.`}
              </p>
            )}
            <Link
              href={recapHref}
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800 dark:text-emerald-300"
            >
              Buka absensi sesi <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Link>
          </article>
          <article className={panel}>
            <FilePenLine
              className="mb-3 h-5 w-5 text-emerald-700 dark:text-emerald-300"
              aria-hidden
            />
            <h3 className="font-bold">Jurnal kelas</h3>
            {data.journal.state !== 'ready' ? (
              <Problem read={data.journal} />
            ) : (
              <p className={`mt-2 ${muted}`}>
                {data.journal.data
                  ? `${data.journal.data} kelas belum memiliki jurnal hari ini.`
                  : rows.some((s) => ['STARTED', 'COMPLETED'].includes(s.status))
                    ? 'Jurnal untuk kelas yang sudah berjalan tersedia.'
                    : 'Belum ada kelas berjalan yang memerlukan jurnal.'}
              </p>
            )}
            <Link
              href={recapHref}
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800 dark:text-emerald-300"
            >
              Tinjau jurnal <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Link>
          </article>
          <article className={panel}>
            <BookOpen className="mb-3 h-5 w-5 text-sky-700 dark:text-sky-300" aria-hidden />
            <h3 className="font-bold">Asesmen & penilaian</h3>
            {data.assessment.state !== 'ready' ? (
              <Problem read={data.assessment} />
            ) : (
              <p className={`mt-2 ${muted}`}>
                {data.assessment.data
                  ? `${data.assessment.data} asesmen draf atau aktif.`
                  : 'Tidak ada asesmen draf atau aktif pada periode ini.'}
              </p>
            )}
            <Link
              href="/dashboard/akademik?view=assessment&workspace=teaching"
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800 dark:text-emerald-300"
            >
              Buka penilaian <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Link>
          </article>
        </div>
      </section>

      <section className={panel} aria-labelledby="home-recap-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="home-recap-heading" className="text-lg font-bold">
            Rekap hari ini
          </h2>
          <Link className={secondary} href={recapHref}>
            Lihat rincian <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {data.sessions.state !== 'ready' ? (
          <Problem read={data.sessions} />
        ) : (
          <dl className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
            {[
              ['Total sesi', rows.length],
              ['Selesai', counts.completed],
              ['Berlangsung', counts.active],
              ['Terjadwal', counts.upcoming],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className={muted}>{label}</dt>
                <dd className="mt-1 text-2xl font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {attendancePeriod && data.attendance.state !== 'denied' && (
        <AttendanceRecap
          compact
          context="own"
          date={date}
          academicYear={attendancePeriod.academicYear}
          semester={attendancePeriod.semester}
        />
      )}

      <section aria-labelledby="home-shortcuts-heading">
        <h2 id="home-shortcuts-heading" className="mb-3 text-lg font-bold">
          Akses cepat
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {
              label: 'Modul & LMS',
              href: '/dashboard/akademik?view=module-authoring&workspace=teaching',
              Icon: BookOpen,
            },
            { label: 'Jadwal', href: '/dashboard/jadwal', Icon: CalendarDays },
            {
              label: 'Bank soal',
              href: '/dashboard/akademik?view=question-bank&workspace=teaching',
              Icon: FilePenLine,
            },
            { label: 'Rekap pembelajaran', href: recapHref, Icon: CheckCircle2 },
          ].map(({ label, href, Icon }) => (
            <Link
              key={label}
              href={href}
              className={`${panel} flex min-h-24 items-center gap-3 hover:border-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600`}
            >
              <Icon
                className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400"
                aria-hidden
              />
              <span className="text-sm font-semibold">{label}</span>
            </Link>
          ))}
        </div>
      </section>
      {leadership && (
        <Link href="/dashboard/akademik?workspace=operations" className={secondary}>
          Buka ruang kerja jabatan <ArrowRight className="h-4 w-4" />
        </Link>
      )}
      {canManageCalendar && (
        <Link href="/dashboard/kalender" className={secondary}>
          Kelola agenda sekolah <CalendarDays className="h-4 w-4" />
        </Link>
      )}
      {agenda.length > 0 && (
        <section className={panel} aria-labelledby="home-agenda-heading">
          <h2 id="home-agenda-heading" className="text-lg font-bold">
            Agenda terdekat
          </h2>
          <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-700">
            {agenda.slice(0, 3).map((a) => (
              <li key={a.id} className="py-3">
                <p className="font-semibold">{a.name}</p>
                <p className={muted}>
                  {a.date}
                  {a.time ? ` · ${a.time} WIB` : ''}
                  {a.location ? ` · ${a.location}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Clock3 className="h-4 w-4" aria-hidden />
        Diperbarui {learningTime(generatedAt)} WIB
      </p>
    </div>
  );
}
