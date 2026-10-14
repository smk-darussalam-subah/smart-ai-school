'use client';

import React, { createContext, useContext } from 'react';
import { useBellPattern, useBellPeriod } from '@/components/providers/BellPatternProvider';
import { fmtMin, wibTodayISO, scheduleDayOfWeek } from '@/lib/bell-times';
import { officialSubjectLabel, scheduleCell } from '@/lib/academic-scheduling';
import type { ClassRef, ScheduleItem } from '../guru-types';
import { monitoringDate, monitoringSemester } from '@/lib/monitoring-presentation';

const Context = createContext({
  academicYear: '',
  semester: 0,
  teacherId: '',
  subject: '',
  available: false,
  subjects: [] as { name: string; code: string }[],
});
export const ScheduleReadProvider = Context.Provider;
export function useScheduleRead() {
  const input = useContext(Context);
  const period = useBellPeriod(input.academicYear, input.semester);
  const daily = useBellPattern();
  const date = wibTodayISO();
  const todayInPeriod =
    !!period.period &&
    date >= period.period.startDate.slice(0, 10) &&
    date <= period.period.endDate.slice(0, 10);
  return { ...input, period, daily, todayInPeriod };
}
function Cell({
  items,
  subjects,
}: {
  items: ScheduleItem[];
  subjects: { name: string; code: string }[];
}) {
  if (!items.length) return <span className="text-slate-400">—</span>;
  return (
    <details className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2 text-left">
      <summary className="flex min-h-11 cursor-pointer items-center break-words font-semibold text-emerald-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">
        {items.length > 1
          ? `${items.length} sesi terjadwal`
          : officialSubjectLabel(items[0]!.teachingAssignment.subject, subjects)}
      </summary>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item.id} className="border-t border-emerald-200 pt-2">
            <p className="font-semibold">{item.teachingAssignment.subject}</p>
            <p>
              {item.class.name} · JP {item.jpStart}–{item.jpEnd}
            </p>
            <p>{item.teachingAssignment.teacher?.user?.fullName ?? 'Guru belum tersedia'}</p>
            <p>Ruang: {item.room || 'Belum ditentukan'}</p>
            {item.concurrencyGroup && (
              <p>
                Kelompok resmi:{' '}
                {item.concurrencyGroup.mode === 'JOINT_CLASS'
                  ? 'Kelas gabungan'
                  : 'Pengecualian bersamaan'}{' '}
                ·{' '}
                {item.concurrencyGroup.expiresOn
                  ? `persetujuan sampai ${monitoringDate(item.concurrencyGroup.expiresOn)}`
                  : item.concurrencyGroup.mode === 'JOINT_CLASS'
                    ? 'ikuti pengaturan sekolah'
                    : 'tanggal akhir persetujuan belum tersedia; hubungi pengelola'}
                . Pelaksanaan tetap mengikuti persetujuan sekolah pada tanggal mengajar.
              </p>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
export default function ScheduleBoard({
  schedules,
  classes,
  weekly = false,
  classId,
}: {
  schedules: ScheduleItem[];
  classes: ClassRef[];
  weekly?: boolean;
  classId?: string;
}) {
  const read = useScheduleRead();
  const day = scheduleDayOfWeek();
  if (!read.available)
    return (
      <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
        Jadwal belum dapat dimuat. Muat ulang; tidak dapat menyimpulkan hari libur.
      </p>
    );
  if (!weekly && !read.todayInPeriod)
    return (
      <p className="p-3 text-sm text-slate-600">
        Tanggal hari ini berada di luar periode pilihan. Lihat matriks mingguan.
      </p>
    );
  const timingAvailable = weekly ? read.period.available : read.daily.available;
  if (!timingAvailable)
    return (
      <div className="space-y-2">
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Jam pelajaran belum dapat ditampilkan. Daftar mapel tetap tersedia; hubungi pengelola
          jadwal.
        </p>
        {schedules
          .filter((s) => (!classId || s.classId === classId) && (weekly || s.dayOfWeek === day))
          .map((s) => (
            <Cell key={s.id} items={[s]} subjects={read.subjects} />
          ))}
      </div>
    );
  const days = weekly
    ? [
        1,
        2,
        3,
        4,
        5,
        6,
        ...(schedules.some((s) => s.dayOfWeek === 7) || read.period.slotsForDay(7).length
          ? [7]
          : []),
      ]
    : [day];
  const numbers = weekly ? read.period.weeklySlots : read.daily.slots.map((slot) => slot.jp);
  const displayedClasses = [
    ...new Map([...classes, ...schedules.map((s) => s.class)].map((c) => [c.id, c])).values(),
  ];
  const rows: { id: string; label: string; jp?: number }[] = weekly
    ? numbers.map((jp) => ({ id: String(jp), label: `JP ${jp}`, jp }))
    : displayedClasses.map((c) => ({ id: c.id, label: c.name }));
  const invalid = schedules.filter(
    (s) =>
      (!classId || s.classId === classId) &&
      (weekly || s.dayOfWeek === day) &&
      Array.from({ length: s.jpEnd - s.jpStart + 1 }, (_, index) => s.jpStart + index).some(
        (jp) =>
          !(weekly ? read.period.slotsForDay(s.dayOfWeek) : read.daily.slots).some(
            (slot) => slot.jp === jp,
          ),
      ),
  );
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600">
        Tahun ajaran {read.academicYear} · {monitoringSemester(read.semester)}. Pilih sel jadwal
        untuk melihat rinciannya.
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[660px] table-fixed border-collapse text-xs">
          <caption className="sr-only">
            {weekly ? 'Matriks jadwal mingguan' : 'Jadwal per kelas hari ini'}
          </caption>
          <thead>
            <tr className="bg-slate-50">
              <th scope="col" className="w-28 p-2 text-left">
                {weekly ? 'JP' : 'Kelas'}
              </th>
              {(weekly ? days : numbers).map((value) => (
                <th scope="col" key={value} className="p-2">
                  {weekly
                    ? ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'][value]
                    : `JP ${value}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row" className="border-t p-2 text-left">
                  {row.label}
                </th>
                {(weekly ? days : numbers).map((value) => {
                  const weekday = weekly ? value : day,
                    jp = weekly ? row.jp! : value;
                  const slot = weekly
                    ? read.period.slotsForDay(weekday).find((s) => s.jp === jp)
                    : read.daily.slots.find((s) => s.jp === jp);
                  const items = scheduleCell(schedules, weekday, jp, weekly ? classId : row.id);
                  return (
                    <td key={value} className="border-l border-t p-1 align-top">
                      <p className="mb-1 text-[10px] text-slate-500">
                        {slot
                          ? 'timingVaries' in slot && slot.timingVaries
                            ? 'Waktu sesuai tanggal'
                            : `${fmtMin(slot.startMin)}–${fmtMin(slot.endMin)}`
                          : 'JP tidak tersedia'}
                      </p>
                      <Cell items={items} subjects={read.subjects} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!!invalid.length && (
        <details className="rounded-lg bg-amber-50 p-3 text-xs">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">
            {invalid.length} jadwal belum sesuai jam pelajaran—perlu diperiksa
          </summary>
          {invalid.map((s) => (
            <Cell key={s.id} items={[s]} subjects={read.subjects} />
          ))}
        </details>
      )}
      <details className="text-xs text-slate-600">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">
          Cara membaca jadwal
        </summary>
        <p className="pb-2">
          — berarti belum ada jadwal pada sel ini. Beberapa kelas di jam yang sama belum tentu
          bentrok. Jadwal menunjukkan rencana, bukan bukti sesi mengajar sudah berjalan.
        </p>
      </details>
    </div>
  );
}
