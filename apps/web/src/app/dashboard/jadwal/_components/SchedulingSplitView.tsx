'use client';

import React, { useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';

export const DEFAULT_LIST_WIDTH = 59;
export const MIN_LIST_WIDTH = 28;
export const MAX_LIST_WIDTH = 72;
export function boundedPanelWidth(value: number) {
  return Number.isFinite(value) ? Math.min(MAX_LIST_WIDTH, Math.max(MIN_LIST_WIDTH, value)) : DEFAULT_LIST_WIDTH;
}
export function resizedPanelWidth(initial: number, deltaX: number, availableWidth: number) {
  return availableWidth > 0 ? boundedPanelWidth(initial + deltaX / availableWidth * 100) : boundedPanelWidth(initial);
}

/** Native pointer capture, keyboard sizing, and click alternatives; no resizing dependency. */
export default function SchedulingSplitView({ id, labelledBy, busy, children }: {
  id: string; labelledBy: string; busy: boolean; children: [React.ReactNode, React.ReactNode];
}) {
  const [width, setWidth] = useState(DEFAULT_LIST_WIDTH);
  const [dragging, setDragging] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; startX: number; initial: number; available: number } | null>(null);
  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null; setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  const style = { '--schedule-list': `${width}fr`, '--schedule-preview': `${100 - width}fr` } as React.CSSProperties;
  return <div id={id} role="tabpanel" aria-labelledby={labelledBy} aria-busy={busy}
    ref={container} style={style}
    className={`grid min-w-0 items-start gap-0 xl:grid-cols-[minmax(0,var(--schedule-list))_12px_minmax(0,var(--schedule-preview))] ${dragging ? 'select-none' : ''}`}>
    <div id={`${id}-list`} className="min-w-0">{children[0]}</div>
    <div role="separator" tabIndex={0} aria-label="Atur lebar daftar dan pratinjau jadwal"
      aria-orientation="vertical" aria-controls={`${id}-list ${id}-preview`} aria-valuemin={MIN_LIST_WIDTH}
      aria-valuemax={MAX_LIST_WIDTH} aria-valuenow={Math.round(width)} aria-valuetext={`Daftar ${Math.round(width)} persen`}
      aria-describedby={`${id}-resize-help`}
      title="Seret ke kiri/kanan. Klik dua kali untuk memulihkan lebar."
      className="group relative hidden h-full min-h-44 touch-none cursor-col-resize items-center justify-center self-stretch bg-slate-100 outline-none hover:bg-blue-100 focus-visible:bg-blue-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 xl:flex dark:bg-slate-800 dark:hover:bg-blue-950 dark:focus-visible:bg-blue-950"
      onPointerDown={(event) => {
        if (event.button !== 0 || !container.current) return;
        event.preventDefault(); event.currentTarget.focus();
        drag.current = { pointerId: event.pointerId, startX: event.clientX, initial: width, available: container.current.getBoundingClientRect().width - 12 };
        event.currentTarget.setPointerCapture(event.pointerId); setDragging(true);
      }}
      onPointerMove={(event) => { const active = drag.current; if (active?.pointerId === event.pointerId) setWidth(resizedPanelWidth(active.initial, event.clientX - active.startX, active.available)); }}
      onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={() => { drag.current = null; setDragging(false); }}
      onDoubleClick={() => setWidth(DEFAULT_LIST_WIDTH)}
      onKeyDown={(event) => {
        const next = event.key === 'ArrowLeft' ? width - 2 : event.key === 'ArrowRight' ? width + 2
          : event.key === 'Home' ? MIN_LIST_WIDTH : event.key === 'End' ? MAX_LIST_WIDTH
            : event.key === 'Enter' ? DEFAULT_LIST_WIDTH : undefined;
        if (next !== undefined) { event.preventDefault(); setWidth(boundedPanelWidth(next)); }
      }}>
      <span className="absolute inset-y-0 left-1/2 w-px bg-slate-300 group-hover:bg-blue-500 dark:bg-slate-600" aria-hidden="true" />
      <GripVertical className="relative h-5 w-3 bg-slate-100 text-slate-600 group-hover:bg-blue-100 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-blue-950" aria-hidden="true" />
    </div>
    <div id={`${id}-preview`} className="min-w-0">{children[1]}</div>
    <div className="col-span-full hidden items-center justify-end gap-2 border-t border-slate-200 px-3 py-1 text-xs xl:flex dark:border-slate-700">
      <p id={`${id}-resize-help`} className="mr-auto text-slate-600 dark:text-slate-300">Seret pembatas atau gunakan tombol. Keyboard: ← →, Home/End; Enter untuk reset.</p>
      {([{ label: 'Daftar +', title: 'Perluas daftar', next: width + 5 }, { label: 'Jadwal +', title: 'Perluas jadwal', next: width - 5 }, { label: 'Reset', title: 'Pulihkan lebar panel', next: DEFAULT_LIST_WIDTH }]).map(({ label, title, next }) => <button
        key={title} type="button" aria-label={title} title={title} disabled={boundedPanelWidth(next) === width}
        className="min-h-11 min-w-11 shrink-0 rounded-lg px-3 font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:text-slate-500 dark:text-blue-300 dark:hover:bg-slate-800 dark:disabled:text-slate-400"
        onClick={() => setWidth(boundedPanelWidth(next))}>{label}</button>)}
    </div>
  </div>;
}
