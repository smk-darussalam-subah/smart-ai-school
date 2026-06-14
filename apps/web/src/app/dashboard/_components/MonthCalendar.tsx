'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { monthGrid, MONTH_NAMES, DOW_SHORT, ymd, EVENT_META, type KaldikEvent } from '@/lib/kiosk';

interface Props {
  year: number;
  month0: number;
  onNav: (deltaMonths: number) => void;
  /** Lompat langsung ke bulan/tahun (dari picker judul). */
  onJump?: (year: number, month0: number) => void;
  events?: KaldikEvent[];
  todayStr?: string;
  accent?: string;
  /** Tanggal yang disorot. */
  selectedDates?: string[];
  /** Klik tanggal (in-month). */
  onDayClick?: (dateStr: string) => void;
  compact?: boolean;
}

function eventTypeOn(dateStr: string, events: KaldikEvent[]): KaldikEvent['type'] | null {
  const hit = events.find((e) => dateStr >= e.date && dateStr <= e.endDate);
  return hit ? hit.type : null;
}

const MON_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));

export default function MonthCalendar({
  year, month0, onNav, onJump, events = [], todayStr, accent = '#059669',
  selectedDates = [], onDayClick, compact = false,
}: Props) {
  const cells = monthGrid(year, month0);
  const [pickYear, setPickYear] = useState<number | null>(null); // null = picker tertutup
  const clickable = !!onDayClick;

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setPickYear((p) => (p === null ? year : null))}
          className={clsx('font-bold text-gray-900 rounded-lg px-1.5 -ml-1.5 hover:bg-gray-100 transition', compact ? 'text-sm' : 'text-base')}
        >
          {MONTH_NAMES[month0]} {year} <span className="text-gray-400 text-[10px]">▾</span>
        </button>
        <div className="flex gap-1">
          <button onClick={() => onNav(-1)} className="w-7 h-7 grid place-items-center rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Bulan sebelumnya"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => onNav(1)} className="w-7 h-7 grid place-items-center rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Bulan berikutnya"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Picker bulan/tahun cepat */}
      {pickYear !== null && (
        <div className="absolute z-20 left-0 right-0 top-9 rounded-xl border border-gray-200 bg-white shadow-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setPickYear(pickYear - 1)} className="w-7 h-7 grid place-items-center rounded-lg hover:bg-gray-100 text-gray-500"><ChevronLeft className="w-4 h-4" /></button>
            <span className="font-bold text-gray-900">{pickYear}</span>
            <button onClick={() => setPickYear(pickYear + 1)} className="w-7 h-7 grid place-items-center rounded-lg hover:bg-gray-100 text-gray-500"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MON_SHORT.map((m, i) => (
              <button key={m}
                onClick={() => { (onJump ?? ((y, mm) => onNav((y - year) * 12 + (mm - month0))))(pickYear, i); setPickYear(null); }}
                className={clsx('text-xs font-semibold py-1.5 rounded-lg transition', i === month0 && pickYear === year ? 'text-white' : 'text-gray-600 hover:bg-gray-100')}
                style={i === month0 && pickYear === year ? { background: accent } : undefined}>{m}</button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-7 gap-1">
        {DOW_SHORT.map((d) => <div key={d} className="text-center text-[10px] font-semibold text-gray-400 pb-0.5">{d}</div>)}
        {cells.map((c, i) => {
          const ds = ymd(c.date);
          const isToday = ds === todayStr;
          const isSel = selectedDates.includes(ds);
          const et = eventTypeOn(ds, events);
          const meta = et ? EVENT_META[et] : null;
          return (
            <button key={i} type="button" disabled={!clickable || !c.inMonth}
              onClick={() => clickable && c.inMonth && onDayClick?.(ds)}
              className={clsx('relative aspect-square rounded-lg flex items-center justify-center transition', compact ? 'text-[11px]' : 'text-[12px]',
                !c.inMonth && 'text-gray-300',
                c.inMonth && !isToday && !isSel && 'text-gray-700',
                clickable && c.inMonth && !isToday && !isSel && 'hover:bg-gray-100 cursor-pointer')}
              style={
                isToday ? { background: accent, color: '#fff', fontWeight: 700 }
                : isSel ? { background: meta?.soft ?? '#eef2f0', boxShadow: `inset 0 0 0 2px ${accent}`, fontWeight: 700 }
                : meta ? { background: meta.soft } : undefined
              }>
              {c.date.getDate()}
              {meta && !isToday && !isSel && <span className="absolute bottom-[3px] w-1 h-1 rounded-full" style={{ background: meta.dot }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
