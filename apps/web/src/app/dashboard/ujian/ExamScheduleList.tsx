'use client';

import { Archive, CalendarDays, Clock3, RefreshCw, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type MouseEvent } from 'react';

export type Exam = {
  sessionId: string; room: string; opensAt: string; latestEntryAt: string; closesAt: string;
  publishedAt: string | null; cancelledAt: string | null; makeupOfSessionId: string | null; agendaId?: string | null;
  package: { title: string; version: number; subject: string };
  session: { title: string; status: string; dueAt?: string | null; completedAt?: string | null;
    durationMinutes: number; academicYear: string; semester: number; class: { name: string } | null;
    gradeTarget?: string | null; program?: { kind: { name: string }; _count: { classes: number } } | null };
  _count: { participants: number; incidents: number }; counts?: { working: number; done: number; started?: number };
};
export type ExamView = 'schedule' | 'archive';
export type ExamFilters = { day: string; through: string; className: string; subject: string; search: string; status: string; sort: string };
export type ExamPageResult = { rows: Exam[]; asOf: string; nextCursor: string | null };
export const examSurface = 'border-[var(--staff-line,var(--border,#e2e8f0))] bg-[var(--staff-panel,var(--surface,#fff))] text-[var(--staff-text,var(--text,#0f172a))]';
export const examControl = `min-h-11 rounded-lg border px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-60 ${examSurface}`;
const muted = 'text-[var(--staff-muted,var(--muted,#475569))]';
export const examTime = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
export const examDate = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
const scheduleStatuses = ['ongoing', 'attention', 'upcoming', 'draft'] as const;
const archiveStatuses = ['completed', 'cancelled'] as const;
type Phase = typeof scheduleStatuses[number] | typeof archiveStatuses[number];
const phaseStyle: Record<Phase, { label: string; style: string }> = {
  ongoing: { label: 'Berlangsung', style: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' },
  upcoming: { label: 'Terjadwal', style: 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200' },
  attention: { label: 'Perlu tindak lanjut', style: 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200' },
  draft: { label: 'Draf', style: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
  completed: { label: 'Selesai', style: 'bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-200' },
  cancelled: { label: 'Dibatalkan', style: 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200' },
};

export function getExamPhase(exam: Exam, now: number): Phase {
  if (exam.cancelledAt) return 'cancelled';
  if (exam.session.status === 'completed') return 'completed';
  if (!exam.publishedAt) return 'draft';
  if (now >= Date.parse(exam.closesAt) || (exam.session.dueAt && now >= Date.parse(exam.session.dueAt))) return 'attention';
  return now >= Date.parse(exam.opensAt) ? 'ongoing' : 'upcoming';
}

export function statusLabel(phase: Phase, exam: Exam, student: boolean) {
  if (phase !== 'attention') return phaseStyle[phase].label;
  if (exam.session.dueAt && Date.parse(exam.session.dueAt) < Date.parse(exam.closesAt)) return 'Penerimaan ditutup';
  return !student && !exam.counts?.started ? 'Jadwal terlewat' : 'Menunggu penutupan';
}

export function useExamServerClock(asOf: string | undefined) {
  const [clock, setClock] = useState<{ asOf: string; now: number }>();
  useEffect(() => {
    if (!asOf) return;
    const from = Date.parse(asOf);
    const receivedAt = performance.now();
    const timer = window.setInterval(() => setClock({ asOf, now: from + performance.now() - receivedAt }), 15_000);
    return () => window.clearInterval(timer);
  }, [asOf]);
  return clock && clock.asOf === asOf ? clock.now : Date.parse(asOf ?? '');
}

export function getDraftPublicationState(now: number, opensAt: string, latestEntryAt: string, closesAt: string, duration: number | null) {
  if (!Number.isFinite(now) || now < Date.parse(opensAt)) return 'upcoming';
  return duration && now <= Date.parse(latestEntryAt) && Date.parse(closesAt) - now >= duration * 60_000
    ? 'ready' : 'reschedule';
}

export function draftPublicationNotice(now: number, opensAt: string) {
  const untilOpening = Date.parse(opensAt) - now;
  if (untilOpening <= 0) return 'Jam buka terlewat. Jadwal masih draf.';
  if (untilOpening <= 15 * 60_000) return 'Jam buka dalam 15 menit ke depan. Terbitkan jadwal.';
  return null;
}

export function defaultExamFilters(day: string, view: ExamView): ExamFilters {
  const start = new Date(Date.parse(day + 'T00:00:00Z') - 29 * 86_400_000).toISOString().slice(0, 10);
  return { day: view === 'archive' ? start : day, through: view === 'archive' ? day : '',
    search: '', className: '', subject: '', status: '', sort: view === 'archive' ? 'newest' : 'priority' };
}

export function ExamScheduleList({ view, filters, result, loading, error, student, canPlan, onView, onFilters,
  onReload, onReset, onDetail, onMonitor, onPublish, onCancel }: {
  view: ExamView; filters: ExamFilters; result?: ExamPageResult; loading: boolean; error: string;
  student: boolean; canPlan: boolean;
  onView: (value: ExamView) => void; onFilters: (value: Partial<ExamFilters>) => void;
  onReload: (cursor?: string) => void; onReset: () => void;
  onDetail: (exam: Exam, event: MouseEvent<HTMLButtonElement>, action?: 'publish' | 'edit') => void;
  onMonitor: (exam: Exam, event: MouseEvent<HTMLButtonElement>) => void;
  onPublish: (exam: Exam) => void; onCancel: (exam: Exam) => void;
}) {
  const archive = view === 'archive';
  const watchDrafts = !archive && canPlan && result?.rows.some((exam) => !exam.publishedAt && exam.session.status === 'draft');
  const draftClock = useExamServerClock(watchDrafts ? result?.asOf : undefined);
  const filtered = Boolean(filters.search || filters.className || filters.subject || filters.status);
  const invalidDates = Boolean(filters.through && filters.through < filters.day);
  return (
    <section aria-labelledby="daftar-ujian" className={`min-w-0 overflow-hidden rounded-2xl border ${examSurface}`}>
      <div className="space-y-4 border-b border-[var(--staff-line,var(--border,#e2e8f0))] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="daftar-ujian" className="text-lg font-bold">{archive ? 'Arsip Ujian' : 'Daftar jadwal'}</h2>
          <div role="group" aria-label="Tampilan daftar ujian" className="inline-flex gap-1 rounded-xl bg-[var(--staff-inset,var(--bg2,#f1f5f9))] p-1">
            {([
              ['schedule', 'Jadwal', CalendarDays],
              ['archive', 'Arsip Ujian', Archive],
            ] as const).map(([key, label, Icon]) => (
              <button type="button" key={key} aria-pressed={view === key} onClick={() => onView(key)}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold outline-offset-2 focus-visible:outline focus-visible:outline-emerald-600 ${view === key ? `border shadow-sm ${examSurface}` : muted}`}>
                <Icon className="h-4 w-4" aria-hidden />{label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <label className="col-span-2 grid min-w-0 gap-1 text-sm font-semibold md:col-span-2">
            <span><Search className="mr-1 inline h-4 w-4" aria-hidden />Cari ujian</span>
            <input className={`w-full min-w-0 ${examControl}`} type="search" maxLength={100}
              placeholder="Judul atau ruang" value={filters.search} onChange={(e) => onFilters({ search: e.target.value })} />
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-semibold">Status
            <select className={`w-full ${examControl}`} value={filters.status} onChange={(e) => onFilters({ status: e.target.value })}>
              <option value="">Semua status</option>
              {(archive ? archiveStatuses : scheduleStatuses).filter((phase) => !student || phase !== 'draft')
                .map((phase) => <option key={phase} value={phase}>{phaseStyle[phase].label}</option>)}
            </select>
          </label>
          {!student && <label className="grid min-w-0 gap-1 text-sm font-semibold">Kelas
            <input className={`w-full ${examControl}`} placeholder="Semua kelas" maxLength={80}
              value={filters.className} onChange={(e) => onFilters({ className: e.target.value })} />
          </label>}
          <label className="grid min-w-0 gap-1 text-sm font-semibold">Mata pelajaran
            <input className={`w-full ${examControl}`} placeholder="Semua mapel" maxLength={100}
              value={filters.subject} onChange={(e) => onFilters({ subject: e.target.value })} />
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-semibold">{archive ? 'Dari tanggal' : 'Tanggal mulai'}
            <input className={`w-full min-w-0 ${examControl}`} type="date" value={filters.day}
              onChange={(e) => { if (e.target.value) onFilters({ day: e.target.value }); }} />
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-semibold">Sampai tanggal
            <input className={`w-full min-w-0 ${examControl}`} type="date" value={filters.through}
              min={filters.day} aria-invalid={invalidDates} onChange={(e) => onFilters({ through: e.target.value })} />
          </label>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <label className={`flex min-h-11 flex-wrap items-center gap-2 text-sm font-semibold ${muted}`}>Urutkan
            <select className={examControl} value={filters.sort} onChange={(e) => onFilters({ sort: e.target.value })}>
              {!archive && <option value="priority">Prioritas</option>}
              <option value="oldest">Terlama</option><option value="newest">Terbaru</option><option value="title">Judul A–Z</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={examControl} onClick={onReset}>Atur ulang</button>
            <button type="button" className={examControl} disabled={loading || invalidDates} onClick={() => onReload()}>
              <RefreshCw className="mr-1 inline h-4 w-4" aria-hidden />Muat ulang
            </button>
          </div>
        </div>
      </div>
      <div aria-busy={loading}>
        {invalidDates ? <p role="alert" className="p-5 text-sm">Tanggal akhir harus sama atau setelah tanggal mulai.</p>
          : error && <p role="alert" className="p-5 text-sm text-rose-700 dark:text-rose-200">{error}</p>}
        {loading && !result && <p role="status" className={`p-5 text-sm ${muted}`}>Memuat {archive ? 'arsip' : 'jadwal'}…</p>}
        {result?.rows.length === 0 && !loading && !error && <p className={`p-5 text-sm ${muted}`}>
          {filtered ? 'Tidak ada ujian yang cocok dengan filter.' : archive ? 'Belum ada ujian selesai atau dibatalkan pada rentang ini.' : 'Belum ada ujian dalam cakupan Anda pada tanggal ini.'}
        </p>}
        <ul className="divide-y divide-[var(--staff-line,var(--border,#e2e8f0))]">
          {result?.rows.map((exam) => {
            const phase = getExamPhase(exam, Date.parse(result.asOf));
            const classLabel = exam.session.class?.name ?? (exam.session.program ? exam.session.program._count.classes + ' rombel' : 'Kelas');
            const start = new Date(exam.opensAt), end = new Date(exam.closesAt);
            const closesSameDay = examDate.format(start) === examDate.format(end);
            const draft = canPlan && phase === 'draft' && !archive;
            const publication = draft ? getDraftPublicationState(draftClock, exam.opensAt, exam.latestEntryAt,
              exam.closesAt, exam.session.durationMinutes) : null;
            const reminder = draft ? draftPublicationNotice(draftClock, exam.opensAt) : null;
            return <li key={exam.sessionId}>
              <article className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words text-base font-bold">{exam.session.title}</h3>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${phaseStyle[phase].style}`}>{statusLabel(phase, exam, student)}</span>
                    {exam.makeupOfSessionId && <span className={`text-xs font-semibold ${muted}`}>Susulan</span>}
                  </div>
                  <p className={`break-words text-sm ${muted}`}>{classLabel} · {exam.package.subject} · {exam.room}</p>
                  <p className={`text-sm tabular-nums ${muted}`}><Clock3 className="mr-1 inline h-4 w-4" aria-hidden />
                    {examDate.format(start)}, {examTime.format(start)}–{!closesSameDay && examDate.format(end) + ', '}{examTime.format(end)} WIB
                  </p>
                  {exam.session.program && <p className={`text-sm ${muted}`}>{exam.session.program.kind.name} · {exam.session.gradeTarget
                    ? exam.session.gradeTarget.toUpperCase() + ' masuk penilaian mapel' : 'Tidak masuk rapor'}</p>}
                  {reminder && <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">{reminder}</p>}
                  {(!student || !archive) && <p className={`text-sm ${muted}`}>{student
                    ? `Batas masuk ${examTime.format(new Date(exam.latestEntryAt))} WIB`
                    : `${exam._count.participants} peserta · ${exam.counts?.working ?? 0} mengerjakan · ${exam.counts?.done ?? 0} terkirim`}</p>}
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <button type="button" className={examControl} onClick={(event) => onDetail(exam, event)}>Detail jadwal</button>
                  {student && exam.publishedAt && !exam.cancelledAt && (
                    <Link className={`inline-flex items-center ${examControl}`} href={{ pathname: '/dashboard/akademik', query: {
                      view: 'assessment', sessionId: exam.sessionId, academicYear: exam.session.academicYear, semester: exam.session.semester,
                    } }}>Lihat detail ujian</Link>
                  )}
                  {!student && !archive && <button type="button" className={examControl} onClick={(event) => onMonitor(exam, event)}>Pantau sesi</button>}
                  {publication === 'upcoming' && <button type="button" className={examControl} onClick={() => onPublish(exam)}>Terbitkan</button>}
                  {publication === 'ready' && <button type="button" className={examControl} onClick={(event) => onDetail(exam, event, 'publish')}>Terbitkan sekarang</button>}
                  {publication === 'reschedule' && <button type="button" className={examControl} onClick={(event) => onDetail(exam, event, 'edit')}>Atur jadwal baru</button>}
                  {canPlan && (phase === 'draft' || phase === 'upcoming') && !archive && (
                    <button type="button" className={examControl} onClick={() => onCancel(exam)}>Batalkan jadwal</button>
                  )}
                </div>
              </article>
            </li>;
          })}
        </ul>
        {result?.nextCursor && <div className="border-t border-[var(--staff-line,var(--border,#e2e8f0))] p-4">
          <button type="button" className={examControl} disabled={loading} onClick={() => onReload(result.nextCursor!)}>Muat sesi berikutnya</button>
        </div>}
      </div>
    </section>
  );
}
