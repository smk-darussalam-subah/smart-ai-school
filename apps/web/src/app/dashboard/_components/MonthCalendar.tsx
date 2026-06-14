'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { monthGrid, MONTH_NAMES, DOW_SHORT, ymd, EVENT_META, type KaldikEvent } from '@/lib/kiosk';

interface Props {
  year: number;
  month0: number;
  onNav: (deltaMonths: number) => void;
  events?: KaldikEvent[];
  todayStr?: string;
  accent?: string;
  /** Mode pilih tanggal (date-picker). */
  selectable?: boolean;
  selected?: string[];
  onToggle?: (dateStr: string) => void;
  compact?: boolean;
}

function eventTypeOn(dateStr: string, events: KaldikEvent[]): KaldikEvent['type'] | null {
  const hit = events.find((e) => dateStr >= e.date && dateStr <= e.endDate);
  return hit ? hit.type : null;
}

export default function MonthCalendar({
  year, month0, onNav, events = [], todayStr, accent = '#059669',
  selectable = false, selected = [], onToggle, compact = false,
}: Props) {
  const cells = monthGrid(year, month0);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className={clsx('font-bold text-gray-900', compact ? 'text-sm' : 'text-base')}>
          {MONTH_NAMES[month0]} {year}
        </h3>
        <div className="flex gap-1">
          <button onClick={() => onNav(-1)} className="w-7 h-7 grid place-items-center rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Bulan sebelumnya"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => onNav(1)} className="w-7 h-7 grid place-items-center rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Bulan berikutnya"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {DOW_SHORT.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-gray-400 pb-1">{d}</div>
        ))}
        {cells.map((c, i) => {
          const ds = ymd(c.date);
          const isToday = ds === todayStr;
          const isSel = selected.includes(ds);
          const et = eventTypeOn(ds, events);
          const meta = et ? EVENT_META[et] : null;
          return (
            <button
              key={i}
              type="button"
              disabled={!selectable}
              onClick={() => selectable && onToggle?.(ds)}
              className={clsx(
                'relative aspect-square rounded-lg text-[12px] flex items-center justify-center transition',
                !c.inMonth && 'text-gray-300',
                c.inMonth && !isToday && !isSel && 'text-gray-700',
                selectable && c.inMonth && !isToday && !isSel && 'hover:bg-gray-100 cursor-pointer',
              )}
              style={
                isToday ? { background: accent, color: '#fff', fontWeight: 700 }
                : isSel ? { background: meta?.soft ?? '#e2e8f0', boxShadow: `inset 0 0 0 2px ${accent}` }
                : meta && !selectable ? { background: meta.soft } : undefined
              }
            >
              {c.date.getDate()}
              {meta && !isToday && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full" style={{ background: meta.dot }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
