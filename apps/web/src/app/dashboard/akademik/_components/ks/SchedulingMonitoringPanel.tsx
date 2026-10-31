'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, RefreshCw, Download, Printer, Search, Info } from 'lucide-react';
import { fetchMonitoringKbm } from '../../actions';
import AttendanceJpSummary from '../AttendanceJpSummary';
import {
  MonitoringSchema,
  monitoringSummary,
  monitoringTeachers,
  type MonitoringRow,
  type SchedulingMonitoring,
} from '@/lib/scheduling-monitoring';
import { downloadMonitoring, printMonitoring } from '@/lib/monitoring-document';
import { officialSubjectLabel } from '@/lib/academic-scheduling';
import {
  monitoringCount as count,
  monitoringRatio as ratio,
  monitoringDate,
  monitoringSemester,
  thresholdSource,
  monitoringReadMessage,
} from '@/lib/monitoring-presentation';
const actionClass =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50';
export default function SchedulingMonitoringPanel({
  academicYear,
  semester,
  teacherId,
  subject,
  subjects = [],
  audit = false,
  readResult,
}: {
  academicYear: string;
  semester: number;
  teacherId?: string;
  subject?: string;
  subjects?: { name: string; code: string }[];
  audit?: boolean;
  readResult?: {
    data: SchedulingMonitoring | null;
    error: string | null;
    loading: boolean;
    retry: () => void;
  };
}) {
  const [loaded, setSnapshot] = useState<SchedulingMonitoring | null>(null);
  const [localError, setError] = useState<string | null>(null),
    [localBusy, setBusy] = useState(false);
  const error = localError || readResult?.error,
    busy = readResult?.loading ?? localBusy;
  const candidate = readResult ? readResult.data : loaded;
  const snapshot =
    !busy &&
    !error &&
    candidate?.state === 'ready' &&
    candidate.academicYear === academicYear &&
    candidate.semester === semester &&
    candidate.filters.teacherId === (teacherId ?? null) &&
    candidate.filters.subject === (subject ?? null)
      ? candidate
      : null;
  const [revision, setRevision] = useState(0),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1);
  const [mono, setMono] = useState(false),
    [exporting, setExporting] = useState(false),
    [exportError, setExportError] = useState<string | null>(null);
  useEffect(() => {
    if (readResult) return;
    let active = true;
    setBusy(true);
    setSnapshot(null);
    setError(null);
    fetchMonitoringKbm(academicYear, semester, { teacherId, subject })
      .then((result) => {
        if (!active) return;
        const parsed = result.success ? MonitoringSchema.safeParse(result.data) : null;
        if (
          !parsed?.success ||
          parsed.data.academicYear !== academicYear ||
          parsed.data.semester !== semester
        )
          setError(monitoringReadMessage(result.error));
        else if (parsed.data.state !== 'ready')
          setError(monitoringReadMessage(parsed.data.reason, parsed.data.state === 'denied'));
        else setSnapshot(parsed.data);
      })
      .catch(() => {
        if (active) setError(monitoringReadMessage(null));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [academicYear, semester, teacherId, subject, revision, readResult]);
  useEffect(() => {
    setExportError(null);
    setPage(1);
  }, [academicYear, semester, teacherId, subject]);
  const teachers = useMemo(
    () =>
      monitoringTeachers(snapshot?.data ?? []).filter((teacher) =>
        [teacher.name, ...teacher.rows.flatMap((row) => [row.kelas, row.mapel])]
          .join(' ')
          .toLocaleLowerCase('id-ID')
          .includes(search.toLocaleLowerCase('id-ID')),
      ),
    [snapshot, search],
  );
  const allRows = teachers.flatMap((teacher) => teacher.rows),
    summary = monitoringSummary(allRows);
  const pages = Math.max(1, Math.ceil(teachers.length / 10)),
    currentPage = Math.min(page, pages);
  const exportDocument = async (rows: MonitoringRow[], excel: boolean) => {
    if (!snapshot || !rows.length || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      if (excel) await downloadMonitoring(snapshot, rows);
      else printMonitoring(snapshot, rows, mono);
    } catch (reason) {
      setExportError(
        reason instanceof Error && /pop-up/i.test(reason.message)
          ? 'Dokumen cetak belum terbuka. Izinkan pop-up untuk situs ini, lalu pilih Cetak/PDF lagi.'
          : 'Dokumen belum berhasil dibuat. Coba lagi; data pembelajaran tetap tersedia.',
      );
    } finally {
      setExporting(false);
    }
  };
  const exports = (rows: MonitoringRow[]) => (
    <span className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={!rows.length || exporting || busy}
        onClick={() => void exportDocument(rows, false)}
        className={actionClass}
      >
        <Printer aria-hidden="true" className="h-4 w-4" />
        Cetak/PDF
      </button>
      <button
        type="button"
        disabled={!rows.length || exporting || busy}
        onClick={() => void exportDocument(rows, true)}
        className={actionClass}
      >
        <Download aria-hidden="true" className="h-4 w-4" />
        Excel
      </button>
    </span>
  );
  return (
    <section className="space-y-4" aria-busy={busy}>
      <AttendanceJpSummary
        query={{ academicYear, semester, teacherId, subject }}
        refreshToken={revision}
      />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-emerald-950">
            {audit ? 'Rekap Pembelajaran per Guru' : 'Ringkasan Pembelajaran'}
          </h3>
          <p className="mt-1 text-xs text-slate-600">
            Tahun ajaran {academicYear || 'belum tersedia'} · {monitoringSemester(semester)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {exports(allRows)}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError(null);
              if (readResult) readResult.retry();
              else setRevision((value) => value + 1);
            }}
            className={actionClass}
          >
            <RefreshCw
              aria-hidden="true"
              className={'h-4 w-4 ' + (busy ? 'motion-safe:animate-spin' : '')}
            />
            Muat ulang
          </button>
        </div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-600">
        <p>
          {snapshot
            ? 'Diperbarui ' +
              new Date(snapshot.generatedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) +
              ' WIB'
            : 'Data mengikuti periode dan pilihan guru/mapel.'}
        </p>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={mono}
            onChange={(event) => setMono(event.target.checked)}
            className="accent-emerald-700"
          />
          Cetak hitam-putih
        </label>
      </div>
      {exportError && (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          {exportError}
        </p>
      )}
      {busy && (
        <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm">
          Memuat ringkasan pembelajaran…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          {monitoringReadMessage(error, candidate?.state === 'denied')}
        </p>
      )}
      {!snapshot && !busy && !error && (
        <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm">
          {candidate?.state === 'denied'
            ? monitoringReadMessage(null, true)
            : 'Data untuk pilihan ini belum tersedia. Pilih Muat ulang.'}
        </p>
      )}
      {snapshot && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              {
                label: 'Guru dalam pilihan',
                value: String(teachers.length),
                note: summary.assignments + ' penugasan mengajar',
              },
              {
                label: 'Pertemuan selesai',
                value: ratio(summary.completed, summary.due),
                note: 'Dari pertemuan yang sudah waktunya',
              },
              {
                label: 'Nilai mencapai KKTP',
                value: ratio(summary.passed, summary.gradeCount),
                note: 'Dari nilai yang sudah dicatat',
              },
              {
                label: 'Jurnal mengajar',
                value: count(summary.journal),
                note: 'Satu hitungan per guru dan kelas',
              },
            ].map((metric) => (
              <div key={metric.label} className="rounded-xl border border-emerald-100 bg-white p-4">
                <p className="text-xs font-medium text-slate-600">{metric.label}</p>
                <p className="mt-2 break-words text-xl font-bold tabular-nums text-emerald-950">
                  {metric.value}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">{metric.note}</p>
              </div>
            ))}
          </div>
          <details className="rounded-xl border border-slate-200 bg-white px-4">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">
              <Info aria-hidden="true" className="h-4 w-4" />
              Cara membaca ringkasan
            </summary>
            <div className="max-w-prose space-y-2 pb-4 text-xs leading-relaxed text-slate-600">
              <p>
                Periode rekap: {monitoringDate(snapshot.window?.from)} –{' '}
                {monitoringDate(snapshot.window?.to)}.
              </p>
              <p>
                Pertemuan dihitung dari sesi mengajar yang tercatat dan sudah waktunya. Pertemuan
                mendatang dan yang dibatalkan tidak masuk pembanding.
              </p>
              <p>
                Nilai mencapai KKTP berarti nilai memenuhi batas mapelnya, bukan seluruh capaian
                pembelajaran sudah selesai.
              </p>
              <p>
                Jurnal dihitung per guru dan kelas. Jika satu guru mengajar beberapa mapel di kelas
                yang sama, jurnal kelas tidak dihitung berulang.
              </p>
              <p>
                Belum ada catatan tidak berarti gagal. Data yang belum dapat dimuat ditampilkan
                sebagai belum tersedia.
              </p>
            </div>
          </details>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
              <div>
                <h4 className="font-bold text-emerald-950">Rincian Progres per Guru</h4>
                <p className="mt-1 text-xs text-slate-600">
                  Pilih nama guru untuk membuka penugasannya.
                </p>
              </div>
              <label className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 focus-within:ring-2 focus-within:ring-emerald-600 sm:w-64">
                <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
                <span className="sr-only">Cari guru, kelas atau mapel</span>
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Cari guru, kelas, mapel…"
                  className="min-w-0 w-full bg-transparent text-xs text-slate-800 placeholder:text-slate-500 outline-none"
                />
              </label>
            </div>
            {!teachers.length && (
              <div className="space-y-3 p-6 text-sm text-slate-600">
                <p>
                  {search
                    ? 'Tidak ada guru yang cocok dengan pencarian.'
                    : 'Belum ada penugasan untuk periode dan pilihan ini.'}
                </p>
                {search && (
                  <button
                    type="button"
                    className={actionClass}
                    onClick={() => {
                      setSearch('');
                      setPage(1);
                    }}
                  >
                    Hapus pencarian
                  </button>
                )}
              </div>
            )}
            {teachers.slice((currentPage - 1) * 10, currentPage * 10).map((teacher) => {
              const totals = monitoringSummary(teacher.rows);
              return (
                <details
                  key={teacher.id}
                  data-teacher-id={teacher.id}
                  className="group border-b last:border-0"
                >
                  <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 p-4 transition-colors hover:bg-emerald-50/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">
                    <span
                      aria-hidden="true"
                      className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-800 sm:flex"
                    >
                      {teacher.name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((name) => name[0])
                        .join('')}
                    </span>
                    <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div className="min-w-0">
                        <p className="break-words font-semibold text-emerald-950">{teacher.name}</p>
                        <p className="mt-1 text-xs text-slate-600">
                          {totals.classes} kelas · {teacher.rows.length} penugasan
                        </p>
                      </div>
                      <div className="text-xs leading-relaxed text-slate-600">
                        <p>
                          Pertemuan selesai:{' '}
                          <b className="font-semibold text-slate-800">
                            {ratio(totals.completed, totals.due)}
                          </b>
                        </p>
                        <p>Nilai mencapai KKTP: {ratio(totals.passed, totals.gradeCount)}</p>
                      </div>
                    </div>
                    <ChevronDown
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 text-emerald-700 motion-safe:transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <div className="space-y-3 border-t bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-700">
                        Penugasan {teacher.name}
                      </p>
                      {exports(teacher.rows)}
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                      <table className="w-full min-w-[690px] text-xs">
                        <caption className="sr-only">Penugasan {teacher.name}</caption>
                        <thead className="bg-slate-50 text-left text-slate-600">
                          <tr>
                            {[
                              'Kelas dan mapel',
                              'JP per minggu',
                              'Nilai mencapai KKTP',
                              'Pertemuan selesai',
                              'Jurnal kelas',
                              'Modul belajar',
                            ].map((label) => (
                              <th key={label} scope="col" className="p-3 font-semibold">
                                {label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {teacher.rows.map((row) => (
                            <tr key={row.assignmentId} className="border-t align-top">
                              <th scope="row" className="p-3 text-left font-normal">
                                <b>{row.kelas}</b>
                                <p className="mt-1 break-words">{row.mapel}</p>
                                {officialSubjectLabel(row.mapel, subjects) !== row.mapel && (
                                  <p className="mt-1 text-slate-600">
                                    Kode {officialSubjectLabel(row.mapel, subjects)}
                                  </p>
                                )}
                              </th>
                              <td className="p-3">
                                <b>
                                  {row.scheduledJp === null
                                    ? 'Belum tersedia'
                                    : row.scheduledJp + ' JP terjadwal'}
                                </b>
                                <p className="mt-1 text-slate-600">Target {row.jp} JP</p>
                              </td>
                              <td className="p-3">
                                {ratio(row.passedGradeCount, row.gradeCount)}
                                <p className="mt-1 text-slate-600">
                                  KKTP {row.kktp ?? 'belum tersedia'}
                                </p>
                                <p className="text-slate-600">
                                  {thresholdSource(row.kktpProvenance)}
                                </p>
                              </td>
                              <td className="p-3">
                                {ratio(row.sessions.completed, row.sessions.due)}
                                <p className="mt-1 text-slate-600">
                                  {row.sessions.active === null
                                    ? 'Status sedang mengajar belum tersedia'
                                    : row.sessions.active + ' sedang mengajar'}
                                </p>
                              </td>
                              <td className="p-3">
                                {count(row.jurnalCount)}
                                <p className="mt-1 text-slate-600">Guru dan kelas ini</p>
                              </td>
                              <td className="p-3">
                                {ratio(row.lms.completed, row.lms.recorded)}
                                <p className="mt-1 text-slate-600">Catatan belajar selesai</p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <details className="text-xs text-slate-600">
                      <summary className="flex min-h-11 cursor-pointer items-center font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">
                        Catatan perubahan pertemuan
                      </summary>
                      <ul className="space-y-2 pb-2">
                        {teacher.rows.map((row) => (
                          <li key={row.assignmentId}>
                            <b>
                              {row.kelas} · {row.mapel}
                            </b>
                            : {count(row.sessions.missed)} terlewat, {count(row.sessions.cancelled)}{' '}
                            dibatalkan, {count(row.sessions.superseded)} diganti.
                          </li>
                        ))}
                      </ul>
                      <p>
                        Jurnal kelas yang sama bisa muncul pada beberapa mapel; jumlah total tetap
                        dihitung sekali.
                      </p>
                    </details>
                  </div>
                </details>
              );
            })}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-xs text-slate-600">
              <span>
                {teachers.length} guru · Halaman {currentPage} dari {pages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                  className={actionClass}
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  disabled={currentPage >= pages}
                  onClick={() => setPage(currentPage + 1)}
                  className={actionClass}
                >
                  Berikutnya
                </button>
              </div>
            </div>
            <p className="border-t px-4 py-3 text-xs text-slate-600">
              Ekspor mencakup seluruh hasil pencarian dan pilihan guru/mapel.
            </p>
          </div>
          <DailyAttendance
            key={academicYear + '|' + semester + '|' + teacherId + '|' + subject}
            rows={allRows}
            state={snapshot.domains.attendance}
          />
        </>
      )}
    </section>
  );
}
function DailyAttendance({ rows, state }: { rows: MonitoringRow[]; state?: string }) {
  const [expanded, setExpanded] = useState(false);
  const classes = [...new Map(rows.map((row) => [row.classId, row])).values()];
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold text-emerald-950">Kehadiran Harian Siswa</h4>
        <span className="text-xs text-slate-600">{monitoringDate(rows[0]?.attendance.date)}</span>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        Berdasarkan catatan harian yang sudah masuk, bukan presensi setiap JP.
      </p>
      {state !== 'ready' ? (
        <p className="mt-3 text-sm text-amber-800">
          {state === 'denied'
            ? 'Anda belum memiliki izin melihat kehadiran siswa.'
            : 'Data kehadiran belum dapat dimuat. Coba Muat ulang.'}
        </p>
      ) : !classes.length ? (
        <p className="mt-3 text-sm text-slate-600">Belum ada kelas dalam pilihan ini.</p>
      ) : (
        <>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(expanded ? classes : classes.slice(0, 6)).map((row) => (
              <li key={row.classId} className="rounded-lg bg-slate-50 p-3 text-xs">
                <b className="text-slate-800">{row.kelas}</b>
                <p className="mt-1 text-slate-600">
                  {row.attendance.recorded === null || row.attendance.present === null
                    ? 'Belum tersedia'
                    : row.attendance.recorded
                      ? row.attendance.present +
                        ' hadir dari ' +
                        row.attendance.recorded +
                        ' catatan'
                      : 'Belum ada catatan kehadiran'}
                </p>
              </li>
            ))}
          </ul>
          {classes.length > 6 && (
            <button
              type="button"
              className={actionClass + ' mt-3'}
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? 'Ringkas daftar kelas' : 'Lihat semua ' + classes.length + ' kelas'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
