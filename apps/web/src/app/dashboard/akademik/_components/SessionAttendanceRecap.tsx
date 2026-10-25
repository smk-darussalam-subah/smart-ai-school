import React from 'react';
import type { LearningContext } from '@/lib/learning-recap';
import { jpLabels, jpTime } from '@/lib/session-attendance';

type Rows = Extract<LearningContext['attendance'], { state: 'ready' }>['data'];
export function attendanceRecapSummary(rows: Rows) {
  if (!rows.length) return 'Belum ada siswa pada sesi ini';
  const count = new Set(rows.map((row) => row.student.id)).size;
  const recorded = rows.filter((row) => row.status !== null).length;
  return `${count} siswa · ${recorded === rows.length ? 'Absensi lengkap' : recorded ? 'Sebagian JP belum diisi' : 'Belum diisi'}`;
}

/** One row per student; each cell is the recorded JP of this exact session, never a daily surrogate. */
export default function SessionAttendanceRecap({ rows }: { rows: Rows }) {
  if (!rows.length) return <p>Belum ada siswa pada sesi ini.</p>;
  const students = [...new Map(rows.map((row) => [row.student.id, row.student])).values()];
  const slots = [...new Map(rows.map((row) => [row.jp, row])).values()].sort((a, b) => a.jp - b.jp);
  const cells = new Map(rows.map((row) => [`${row.student.id}:${row.jp}`, row]));
  const tones = {
    hadir: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
    izin: 'bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100',
    sakit: 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
    alpha: 'bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-100',
  };
  return (
    <div className="session-jp-recap min-w-0 space-y-4">
      <style>{`.session-jp-recap{--jp-bg:#fff;--jp-head:#f8fafc;--jp-line:#e2e8f0;--jp-ink:#0f172a;--jp-muted:#475569;color:var(--jp-ink)}
    :root[data-theme="dark"] .session-jp-recap,:root.dark .session-jp-recap{--jp-bg:#0f172a;--jp-head:#1e293b;--jp-line:#475569;--jp-ink:#f1f5f9;--jp-muted:#cbd5e1}
    @media(prefers-color-scheme:dark){:root:not([data-theme="light"]) .session-jp-recap{--jp-bg:#0f172a;--jp-head:#1e293b;--jp-line:#475569;--jp-ink:#f1f5f9;--jp-muted:#cbd5e1}}`}</style>
      <p className="text-sm font-semibold">{attendanceRecapSummary(rows)}</p>
      <div
        className="overflow-x-auto rounded-lg border border-[var(--jp-line)]"
        tabIndex={0}
        role="region"
        aria-label="Tabel absensi siswa per JP"
      >
        <table className="w-full bg-[var(--jp-bg)] text-left text-sm text-[var(--jp-ink)]">
          <caption className="sr-only">Absensi siswa per JP pada sesi yang dipilih</caption>
          <thead className="bg-[var(--jp-head)]">
            <tr>
              <th scope="col" className="sticky left-0 min-w-40 bg-[var(--jp-head)] p-3">
                Nama siswa
              </th>
              {slots.map((slot) => (
                <th key={slot.jp} scope="col" className="min-w-32 p-3">
                  JP {slot.jp}
                  <span className="mt-1 block whitespace-nowrap text-xs font-normal text-[var(--jp-muted)]">
                    {jpTime(slot.startAt)}–{jpTime(slot.endAt)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id} className="border-t border-[var(--jp-line)]">
                <th
                  scope="row"
                  className="sticky left-0 bg-[var(--jp-head)] p-3 align-top font-semibold"
                >
                  {student.user.fullName}
                </th>
                {slots.map((slot) => {
                  const row = cells.get(`${student.id}:${slot.jp}`);
                  return (
                    <td key={slot.jp} className="p-2 align-top">
                      <div
                        className={`rounded-lg p-2 text-sm ${row?.status ? tones[row.status] : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}
                      >
                        <span className="font-semibold">
                          {row?.status ? jpLabels[row.status] : 'Belum diisi'}
                        </span>
                        {row?.notes && (
                          <p className="mt-1 max-w-60 whitespace-pre-wrap break-words text-xs leading-relaxed">
                            {row.notes}
                          </p>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
