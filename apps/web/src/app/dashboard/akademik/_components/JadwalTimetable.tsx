'use client';

import React, { useMemo, useState } from 'react';
import { CalendarClock, BookMarked, Users, DoorOpen, LayoutGrid, CalendarDays } from 'lucide-react';
import MonthCalendar from '@/app/dashboard/_components/MonthCalendar';
import { ymd, type KaldikEvent } from '@/lib/kiosk';
import { useBellPattern, useBellPeriod } from '@/components/providers/BellPatternProvider';
import { fmtMin, currentJp, scheduleDayOfWeek, wibNow, wibTodayISO } from '@/lib/bell-times';
import ScheduleBoard, { ScheduleReadProvider } from './ks/ScheduleBoard';
import type { ScheduleItem } from './guru-types';

const DOW = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

export default function JadwalTimetable({ schedules, academicYear = '', semester = 0, available = true }: { schedules: ScheduleItem[]; academicYear?: string; semester?: number; available?: boolean }) {
  const now = new Date();
  const todayDow = scheduleDayOfWeek();
  const period = useBellPeriod(academicYear, semester);
  const inPeriod = (date: string) => !!period.period && date >= period.period.startDate.slice(0,10) && date <= period.period.endDate.slice(0,10);
  const days = [1,2,3,4,5,6,...(schedules.some(s => s.dayOfWeek === 7) || period.slotsForDay(7).length ? [7] : [])];
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selDate, setSelDate] = useState<string>(wibTodayISO());
  const [selDay, setSelDay] = useState<number>(todayDow);

  const teachDays = useMemo(() => new Set(schedules.map((s) => s.dayOfWeek)), [schedules]);

  // Tandai tanggal yang ada jadwal mengajar di bulan tampil.
  const events: KaldikEvent[] = useMemo(() => {
    const days = new Date(ym.y, ym.m + 1, 0).getDate();
    const out: KaldikEvent[] = [];
    for (let d = 1; d <= days; d++) {
      const dt = new Date(ym.y, ym.m, d);
      const wd = dt.getDay(); // 0=Minggu
      if (teachDays.has(wd || 7) && period.period && ymd(dt) >= period.period.startDate.slice(0,10) && ymd(dt) <= period.period.endDate.slice(0,10)) {
        const ds = ymd(dt);
        out.push({ id: `t-${ds}`, name: 'Jadwal reguler (bukan status mengajar)', date: ds, endDate: ds, type: 'event' });
      }
    }
    return out;
  }, [ym, teachDays, period]);

  const bell = useBellPattern(selDate || wibTodayISO(), selDay);
  const JP_SLOTS = selDate ? inPeriod(selDate) ? bell.slots : [] : period.slotsForDay(selDay);
  const nowJp = inPeriod(wibTodayISO()) ? currentJp(wibNow().minutes, bell.slotsForDay(todayDow)) : -1;
  const viewingToday = selDay === todayDow && selDate === wibTodayISO();

  const onDay = (ds: string) => {
    setSelDate(ds);
    const wd = new Date(`${ds}T00:00:00`).getDay();
    setSelDay(wd || 7);
  };

  const daySchedules = schedules
    .filter((s) => s.dayOfWeek === selDay)
    .sort((a, b) => a.jpStart - b.jpStart);
  const slotsFor = (jp: number) => daySchedules.filter((s) => jp >= s.jpStart && jp <= s.jpEnd);

  // KPI metrics from all schedules
  const totalJP = new Set(
    schedules.flatMap((s) =>
      Array.from(
        { length: s.jpEnd - s.jpStart + 1 },
        (_, offset) => `${s.dayOfWeek}|${s.jpStart + offset}`,
      ),
    ),
  ).size;
  const uniqueMapel = new Set(schedules.map((s) => s.teachingAssignment?.subject).filter(Boolean))
    .size;
  const uniqueRombel = new Set(schedules.map(s => s.classId).filter(Boolean)).size;
  const uniqueRuang = new Set(schedules.map((s) => s.room).filter(Boolean)).size;

  // Jadwal Lengkap: all schedule blocks grouped by day
  const fullSched = days.flatMap((d) =>
    schedules
      .filter((s) => s.dayOfWeek === d)
      .sort((a, b) => a.jpStart - b.jpStart)
      .map((s) => ({ s, day: DOW[d] ?? '' })),
  );
  const jamLabel = (jpStart: number, jpEnd: number, day: number) => {
    const slots = period.slotsForDay(day);
    if (slots.some(slot => slot.jp >= jpStart && slot.jp <= jpEnd && slot.timingVaries)) return 'Waktu sesuai tanggal layanan';
    const start = slots.find((s) => s.jp === jpStart);
    const end = slots.find((s) => s.jp === jpEnd);
    return start && end ? `${fmtMin(start.startMin)}–${fmtMin(end.endMin)}` : 'Belum dikonfigurasi';
  };

  if (!available) return <p role='status' className='rounded-xl bg-amber-50 p-4 text-sm'>Jadwal belum dapat dimuat. Tidak dapat menyimpulkan hari libur atau jumlah JP.</p>;
  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <JadwalKpi icon={CalendarClock} label="JP jadwal per minggu" value={period.available ? `${totalJP}` : 'Belum tersedia'} />
        <JadwalKpi icon={BookMarked} label="Mapel" value={`${uniqueMapel}`} />
        <JadwalKpi icon={Users} label="Rombel" value={`${uniqueRombel}`} />
        <JadwalKpi icon={DoorOpen} label="Ruang" value={`${uniqueRuang}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-2xl border border-[#e6efea] bg-white p-4 shadow-sm">
          <MonthCalendar
            year={ym.y}
            month0={ym.m}
            onNav={(d) =>
              setYm((p) => {
                const nd = new Date(p.y, p.m + d, 1);
                return { y: nd.getFullYear(), m: nd.getMonth() };
              })
            }
            onJump={(y, m) => setYm({ y, m })}
            events={events}
            todayStr={wibTodayISO()}
            selectedDates={selDate ? [selDate] : []}
            onDayClick={onDay}
            accent="#059669"
          />
          <div className="mt-3 flex gap-4 text-[11px] font-semibold text-[#6b8079]">
            <span className="inline-flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-full" style={{ background: '#059669' }} />
              Hari ini
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              Ada jadwal reguler
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-[#e6efea] bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-[15px] font-bold text-[#0f2e25]">
            Jadwal Mengajar —{' '}
            {viewingToday
                ? `Hari ini · ${DOW[selDay] ?? ''}`
                : (DOW[selDay] ?? '')}
          </h3>

          <div className="mb-3 flex gap-1.5">
            {days.map((d) => {
              const cnt = new Set(
                schedules
                  .filter((s) => s.dayOfWeek === d)
                  .flatMap((s) =>
                    Array.from(
                      { length: s.jpEnd - s.jpStart + 1 },
                      (_, index) => s.jpStart + index,
                    ),
                  ),
              ).size;
              const on = d === selDay;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setSelDay(d);
                    setSelDate('');
                  }}
                  className={`flex-1 rounded-lg px-1 py-2 text-center text-[12px] font-extrabold ${on ? 'bg-emerald-700 text-white shadow-[0_8px_18px_-8px_rgba(5,150,105,.5)]' : 'bg-[#f4f7f5] text-[#6b8079]'}`}
                >
                  {(DOW[d] ?? '').slice(0, 3)}
                  <span
                    className={`block text-[9.5px] font-bold ${on ? 'text-emerald-100' : 'text-[#526b62]'}`}
                  >
                    {cnt} JP
                  </span>
                </button>
              );
            })}
          </div>

          {selDate && !inPeriod(selDate) ? (
            <div className="grid h-24 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] text-[#526b62]">
              Tanggal pilihan berada di luar periode jadwal.
            </div>
          ) : (
            <div className="space-y-2">
              {JP_SLOTS.map((slot) => {
                const cells = slotsFor(slot.jp);
                const isNow = viewingToday && nowJp === slot.jp;
                return (
                  <div
                    key={slot.jp}
                    className={`grid grid-cols-[76px_1fr] gap-3 rounded-xl border px-3 py-2.5 ${isNow ? 'border-emerald-500 bg-emerald-50/60 shadow-[0_2px_6px_rgba(16,40,33,.06)]' : cells.length ? 'border-[#e6efea] bg-white' : 'border-dashed border-[#e6efea] bg-[#f4f7f5]'}`}
                  >
                    <div className="text-[11px] font-extrabold text-emerald-700">
                      JP {slot.jp}
                      <span className="block font-semibold text-[#526b62]">
                        {'timingVaries' in slot && slot.timingVaries ? 'Waktu sesuai tanggal' : `${fmtMin(slot.startMin)}–${fmtMin(slot.endMin)}`}
                      </span>
                    </div>
                    {cells.length ? (
                      <div className="min-w-0 self-center space-y-2">
                        {cells.map((cell) => (
                          <div key={cell.id}>
                            <b className="text-[13px] text-[#0f2e25]">
                              {cell.teachingAssignment?.subject ?? '—'}
                            </b>
                            <div className="text-[12px] text-[#6b8079]">
                              {cell.class?.name ?? '—'} · {cell.room ?? 'Ruang —'}
                              {isNow ? ' · sesuai jam sekarang' : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="self-center text-[12px] text-[#526b62]">Belum ada jadwal</div>
                    )}
                  </div>
                );
              })}
              {!JP_SLOTS.length && (
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                  JP untuk hari ini belum dikonfigurasi. Hubungi pengelola jadwal.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Matriks Mingguan */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
          <LayoutGrid className="h-[18px] w-[18px] text-emerald-600" />
          Matriks Mingguan
        </h3>
        <ScheduleReadProvider value={{academicYear,semester,teacherId:'',subject:'',available,subjects:[]}}>
          <ScheduleBoard schedules={schedules} classes={[]} weekly />
        </ScheduleReadProvider>
      </div>

      {/* Jadwal Lengkap */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
          <CalendarDays className="h-[18px] w-[18px] text-emerald-600" />
          Jadwal Lengkap
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-[#e6efea] bg-[#f9fbfa] text-left text-[11px] uppercase tracking-wide text-[#6b8079]">
                <th className="px-3 py-2">Hari</th>
                <th className="px-3 py-2">JP</th>
                <th className="px-3 py-2">Jam</th>
                <th className="px-3 py-2">Mapel</th>
                <th className="px-3 py-2">Kelas</th>
                <th className="px-3 py-2">Ruang</th>
              </tr>
            </thead>
            <tbody>
              {fullSched.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-[12.5px] text-[#526b62]">
                    Belum ada jadwal
                  </td>
                </tr>
              ) : (
                fullSched.map(({ s, day }, i) => (
                  <tr key={i} className="border-b border-[#f0f4f2]">
                    <td className="px-3 py-2.5 font-bold text-[#0f2e25]">{day}</td>
                    <td className="px-3 py-2.5 text-[#355a4e]">
                      {s.jpStart === s.jpEnd ? `JP ${s.jpStart}` : `JP ${s.jpStart}–${s.jpEnd}`}
                    </td>
                    <td className="px-3 py-2.5 text-[#355a4e]">
                      {jamLabel(s.jpStart, s.jpEnd, s.dayOfWeek)}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-[#0f2e25]">
                      {s.teachingAssignment?.subject ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-[#355a4e]">{s.class?.name ?? '—'}</td>
                    <td className="px-3 py-2.5 text-[#355a4e]">{s.room ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function JadwalKpi({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarClock;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[#e6efea] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#6b8079]">
        <Icon className="h-3.5 w-3.5 text-emerald-600" />
        {label}
      </div>
      <div className="mt-1.5 text-[24px] font-extrabold tracking-tight text-[#0f2e25]">{value}</div>
    </div>
  );
}
