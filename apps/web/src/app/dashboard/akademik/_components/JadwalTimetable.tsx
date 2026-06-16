'use client';

import { useMemo, useState } from 'react';
import MonthCalendar from '@/app/dashboard/_components/MonthCalendar';
import { ymd, type KaldikEvent } from '@/lib/kiosk';
import { JP_SLOTS, fmtMin, currentJp, scheduleDayOfWeek, wibNow, wibTodayISO } from '@/lib/bell-times';
import type { ScheduleItem } from './guru-types';

const DOW = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export default function JadwalTimetable({ schedules }: { schedules: ScheduleItem[] }) {
  const now = new Date();
  const todayDow = scheduleDayOfWeek();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selDate, setSelDate] = useState<string>(wibTodayISO());
  const [selDay, setSelDay] = useState<number>(todayDow === 0 ? 1 : todayDow);

  const teachDays = useMemo(() => new Set(schedules.map((s) => s.dayOfWeek)), [schedules]);

  // Tandai tanggal yang ada jadwal mengajar di bulan tampil.
  const events: KaldikEvent[] = useMemo(() => {
    const days = new Date(ym.y, ym.m + 1, 0).getDate();
    const out: KaldikEvent[] = [];
    for (let d = 1; d <= days; d++) {
      const dt = new Date(ym.y, ym.m, d);
      const wd = dt.getDay(); // 0=Minggu
      if (wd >= 1 && wd <= 6 && teachDays.has(wd)) {
        const ds = ymd(dt);
        out.push({ id: `t-${ds}`, name: 'Mengajar', date: ds, endDate: ds, type: 'event' });
      }
    }
    return out;
  }, [ym, teachDays]);

  const nowJp = currentJp(wibNow().minutes);
  const viewingToday = selDay === todayDow && (selDate === wibTodayISO());

  const onDay = (ds: string) => {
    setSelDate(ds);
    const wd = new Date(`${ds}T00:00:00`).getDay();
    setSelDay(wd === 0 ? 0 : wd);
  };

  const daySchedules = schedules.filter((s) => s.dayOfWeek === selDay).sort((a, b) => a.jpStart - b.jpStart);
  const slotFor = (jp: number) => daySchedules.find((s) => jp >= s.jpStart && jp <= s.jpEnd) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[330px_1fr]">
      <div className="rounded-2xl border border-[#e6efea] bg-white p-4 shadow-sm">
        <MonthCalendar
          year={ym.y} month0={ym.m}
          onNav={(d) => setYm((p) => { const nd = new Date(p.y, p.m + d, 1); return { y: nd.getFullYear(), m: nd.getMonth() }; })}
          onJump={(y, m) => setYm({ y, m })}
          events={events} todayStr={wibTodayISO()} selectedDates={selDate ? [selDate] : []}
          onDayClick={onDay} accent="#059669"
        />
        <div className="mt-3 flex gap-4 text-[11px] font-semibold text-[#6b8079]">
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: '#059669' }} />Hari ini</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-400" />Ada jadwal mengajar</span>
        </div>
      </div>

      <div className="rounded-2xl border border-[#e6efea] bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-[15px] font-bold text-[#0f2e25]">Jadwal Mengajar — {selDay === 0 ? 'Minggu (libur)' : (viewingToday ? `Hari ini · ${DOW[selDay]}` : DOW[selDay])}</h3>

        <div className="mb-3 flex gap-1.5">
          {[1, 2, 3, 4, 5, 6].map((d) => {
            const cnt = schedules.filter((s) => s.dayOfWeek === d).length;
            const on = d === selDay;
            return (
              <button key={d} type="button" onClick={() => { setSelDay(d); setSelDate(''); }}
                className={`flex-1 rounded-lg px-1 py-2 text-center text-[12px] font-extrabold ${on ? 'bg-emerald-600 text-white shadow-[0_8px_18px_-8px_rgba(5,150,105,.5)]' : 'bg-[#f4f7f5] text-[#6b8079]'}`}>
                {(DOW[d] ?? '').slice(0, 3)}<span className={`block text-[9.5px] font-bold ${on ? 'text-emerald-100' : 'text-[#9bb0a8]'}`}>{cnt} JP</span>
              </button>
            );
          })}
        </div>

        {selDay === 0 ? (
          <div className="grid h-24 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] text-[#9bb0a8]">Minggu — tidak ada jadwal.</div>
        ) : (
          <div className="space-y-2">
            {JP_SLOTS.map((slot) => {
              const cell = slotFor(slot.jp);
              const isNow = viewingToday && nowJp === slot.jp;
              return (
                <div key={slot.jp}
                  className={`grid grid-cols-[76px_1fr] gap-3 rounded-xl border px-3 py-2.5 ${isNow ? 'border-emerald-500 bg-emerald-50/60 shadow-[0_2px_6px_rgba(16,40,33,.06)]' : cell ? 'border-[#e6efea] bg-white' : 'border-dashed border-[#e6efea] bg-[#f4f7f5]'}`}>
                  <div className="text-[11px] font-extrabold text-emerald-700">JP {slot.jp}<span className="block font-semibold text-[#9bb0a8]">{fmtMin(slot.startMin)}–{fmtMin(slot.endMin)}</span></div>
                  {cell ? (
                    <div className="self-center">
                      <b className="text-[13px] text-[#0f2e25]">{cell.teachingAssignment?.subject ?? '—'}</b>
                      <div className="text-[12px] text-[#6b8079]">{cell.class?.name ?? '—'} · {cell.room ?? 'Ruang —'}{isNow ? ' · sedang berlangsung' : ''}</div>
                    </div>
                  ) : (
                    <div className="self-center text-[12px] text-[#9bb0a8]">Tidak mengajar</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
