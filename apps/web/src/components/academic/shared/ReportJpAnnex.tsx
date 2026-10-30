'use client';

import { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import {
  readReportJpAnnex,
  reportJpCsv,
  reportJpHtml,
  type ReportJpIdentity,
} from '@/lib/report-jp-annex';
import { groupAttendanceSlots } from '@/lib/session-attendance';
import { attendanceRangeLabel, attendanceNumber } from '@/lib/attendance-presentation';

const statusLabel = { hadir: 'Hadir', izin: 'Izin', sakit: 'Sakit', alpha: 'Alpha' };
const dayLabel = (date: string) => attendanceRangeLabel(date, date);

/** Same saved annex for wali/KS and distributed learner reports; no live attendance fetch. */
export default function ReportJpAnnex({
  value,
  identity,
  studentName,
}: {
  value: unknown;
  identity: ReportJpIdentity;
  studentName: string;
}) {
  const [error, setError] = useState('');
  const read = readReportJpAnnex(value, identity);
  if (read.state !== 'ready')
    return (
      <section
        className="border-t border-[var(--border,#cbd5e1)] pt-4 text-sm text-inherit opacity-80"
        aria-label="Lampiran kehadiran JP"
      >
        <h3 className="font-semibold text-inherit">Lampiran kehadiran per JP</h3>
        <p className="mt-2" role={read.state === 'invalid' ? 'status' : undefined}>
          {read.state === 'missing'
            ? 'Lampiran JP belum tersedia pada rapor ini.'
            : 'Lampiran kehadiran belum dapat ditampilkan. Hubungi wali kelas.'}
        </p>
      </section>
    );
  const { data } = read;
  const exportCsv = () => {
    setError('');
    try {
      const url = URL.createObjectURL(
        new Blob([reportJpCsv(data, studentName)], { type: 'text/csv;charset=utf-8' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `rapor-jp-${data.studentId}-${data.semester}.csv`;
      anchor.hidden = true;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('Lampiran belum dapat diunduh. Coba lagi.');
    }
  };
  const print = () => {
    setError('');
    let popup: Window | null = null;
    try {
      popup = window.open('', '_blank');
      if (!popup) {
        setError('Izinkan pop-up untuk membuka lampiran cetak.');
        return;
      }
      popup.opener = null;
      popup.document.open();
      popup.document.write(reportJpHtml(data, studentName));
      popup.document.close();
      const button = popup.document.createElement('button');
      button.type = 'button';
      button.textContent = 'Cetak / Simpan PDF';
      button.style.cssText = 'min-height:44px;padding:10px 16px';
      button.addEventListener('click', () => popup?.print());
      popup.document.querySelector('.toolbar')?.append(button);
      popup.focus();
    } catch {
      popup?.close();
      setError('Lampiran cetak belum dapat dibuka. Coba lagi.');
    }
  };
  return (
    <section
      className="min-w-0 space-y-4 border-t border-[var(--border,#cbd5e1)] pt-4 text-inherit"
      aria-label="Lampiran kehadiran JP"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Lampiran kehadiran per JP</h3>
          <p className="mt-1 text-sm text-inherit opacity-80">
            {data.observedThrough
              ? `Dicatat sampai ${dayLabel(data.observedThrough)}`
              : 'Periode belum dimulai'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border,#94a3b8)] px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            Unduh CSV
          </button>
          <button
            type="button"
            onClick={print}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border,#94a3b8)] px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700"
          >
            <Printer aria-hidden="true" className="h-4 w-4" />
            Cetak lampiran
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold text-inherit">
          {error}
        </p>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        {(
          [...Object.entries(statusLabel), ['unknown', 'Belum dicatat / perlu diperiksa']] as [
            keyof typeof data.totals,
            string,
          ][]
        ).map(([key, label]) => (
          <div key={key}>
            <dt className="text-inherit opacity-80">{label}</dt>
            <dd className="mt-1 font-semibold tabular-nums">
              {attendanceNumber(data.totals[key] as number)} JP
            </dd>
          </div>
        ))}
        <div>
          <dt className="text-inherit opacity-80">Kehadiran</dt>
          <dd className="mt-1 font-semibold tabular-nums">
            {data.totals.pct === null ? 'Belum lengkap' : `${attendanceNumber(data.totals.pct)}%`}
          </dd>
        </div>
      </dl>
      {!data.days.length ? (
        <p className="text-sm text-inherit opacity-80">Belum ada sesi dalam cakupan lampiran.</p>
      ) : (
        <div className="divide-y divide-[var(--border,#cbd5e1)] border-y border-[var(--border,#cbd5e1)]">
          {data.days.map((day) => (
            <details key={day.date} className="py-1">
              <summary className="min-h-11 cursor-pointer py-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
                <span className="font-semibold">{dayLabel(day.date)}</span>
                <span className="ml-2 text-inherit opacity-80">
                  {day.expected} JP ·{' '}
                  {day.pct === null ? 'Belum lengkap' : `${attendanceNumber(day.pct)}% hadir`}
                </span>
              </summary>
              <p className="pb-3 text-sm text-inherit opacity-80">
                Hadir {day.hadir} · Izin {day.izin} · Sakit {day.sakit} · Alpha {day.alpha} · Belum
                dicatat / perlu diperiksa {day.unknown} JP
              </p>
              {data.sessions
                .filter((s) => s.date === day.date)
                .map((session) => (
                  <div key={session.id} className="mb-4 min-w-0 space-y-2 pl-3">
                    <h4 className="break-words text-sm font-semibold">{session.subject}</h4>
                    <p className="break-words text-sm text-inherit opacity-80">
                      {session.teacher} · {session.className}
                    </p>
                    <ul className="space-y-2 text-sm">
                      {groupAttendanceSlots(session.slots).map((slot) => (
                        <li key={slot.fromJp} className="break-words">
                          <span className="font-medium">
                            JP {slot.fromJp}
                            {slot.toJp !== slot.fromJp ? `–${slot.toJp}` : ''} ·{' '}
                            {slot.status ? statusLabel[slot.status] : 'Belum dicatat'}
                          </span>
                          {slot.notes && (
                            <p className="mt-1 whitespace-pre-wrap text-inherit opacity-80">
                              {slot.notes}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </details>
          ))}
        </div>
      )}
      <details className="text-sm text-inherit opacity-80">
        <summary className="min-h-11 cursor-pointer py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
          Tentang cakupan
        </summary>
        <p className="pb-2">
          Hitungan JP terpisah dari catatan hari. JP beririsan dihitung sekali; perbedaan status
          tetap perlu diperiksa. Keanggotaan kelas lama yang belum tersimpan tidak direka. Lampiran
          mengikuti data saat draft rapor disiapkan.
        </p>
      </details>
    </section>
  );
}
