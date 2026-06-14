'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import type { HeatmapData, HeatmapCell, HeatmapRow } from './AttendanceHeatmap';
import { fetchAttendanceDetailAction, type AttendanceDetail } from '../actions';

// ── Shared color / format helpers (mirrored from AttendanceHeatmap) ─────────

function cellColor(pct: number | null): string {
  if (pct === null) return 'bg-gray-100 text-gray-300';
  if (pct < 75) return 'bg-red-200 text-red-900';
  if (pct < 80) return 'bg-orange-200 text-orange-900';
  if (pct < 90) return 'bg-yellow-200 text-yellow-900';
  if (pct < 95) return 'bg-lime-200 text-lime-900';
  return 'bg-green-300 text-green-900';
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const STATUS_LABELS: Record<string, string> = {
  hadir: 'Hadir', izin: 'Izin', sakit: 'Sakit', alpha: 'Alpha',
};

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({
  classId, date, className, onClose,
}: {
  classId: string; date: string; className: string; onClose: () => void;
}) {
  const [detail, setDetail] = useState<AttendanceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    fetchAttendanceDetailAction(classId, date).then((d) => {
      setDetail(d);
      setLoading(false);
    });
  }, [classId, date]);

  // Focus trap — simple: focus panel on mount, close on Escape
  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      {/* Overlay backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Detail kehadiran ${className} ${shortDate(date)}`}
        className="fixed right-0 top-0 z-50 h-full w-full max-w-sm bg-white shadow-xl outline-none flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="font-semibold text-gray-900">{className}</p>
            <p className="text-sm text-gray-500">{shortDate(date)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none p-1"
            aria-label="Tutup panel"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <p className="text-sm text-gray-400">Memuat data...</p>
          ) : !detail || detail.total === 0 ? (
            <p className="text-sm text-gray-400">Tidak ada data kehadiran untuk hari ini.</p>
          ) : (
            <>
              {/* Summary */}
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: 'Hadir', count: detail.hadir, color: 'text-green-700 bg-green-50' },
                  { label: 'Izin', count: detail.izin, color: 'text-blue-700 bg-blue-50' },
                  { label: 'Sakit', count: detail.sakit, color: 'text-yellow-700 bg-yellow-50' },
                  { label: 'Alpha', count: detail.alpha, color: 'text-red-700 bg-red-50' },
                ].map(({ label, count, color }) => (
                  <div key={label} className={`rounded-lg p-2 ${color}`}>
                    <p className="text-lg font-bold">{count}</p>
                    <p className="text-xs">{label}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 text-right">Total tercatat: {detail.total} siswa</p>

              {/* Absen list */}
              {detail.absen.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Tidak hadir ({detail.absen.length}):</p>
                  <ul className="space-y-1">
                    {detail.absen.map((a, i) => (
                      <li key={i} className="flex items-center justify-between text-sm">
                        <span className="text-gray-800">{a.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          a.status === 'izin' ? 'bg-blue-100 text-blue-700' :
                          a.status === 'sakit' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {STATUS_LABELS[a.status] ?? a.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detail.absen.length === 0 && (
                <p className="text-sm text-green-600">Semua siswa hadir pada hari ini.</p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main interactive heatmap ──────────────────────────────────────────────────

interface SelectedCell {
  classId: string;
  className: string;
  date: string;
}

export default function HeatmapInteractive({ data }: { data: HeatmapData }) {
  const [selected, setSelected] = useState<SelectedCell | null>(null);

  const handleCellClick = useCallback((row: HeatmapRow, cell: HeatmapCell) => {
    if (cell.pct === null) return; // no data — nothing to show
    setSelected({ classId: row.classId, className: row.className, date: cell.date });
  }, []);

  if (data.classes.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="font-semibold text-gray-700 mb-2">🗓️ Heatmap Kehadiran</h2>
        <p className="text-sm text-gray-400">Belum ada kelas aktif.</p>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-6 overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-700">
            🗓️ Heatmap Kehadiran{' '}
            <span className="text-gray-400 font-normal">
              · kelas × hari, {data.dates.length} hari terakhir · klik sel untuk detail
            </span>
          </h2>
        </div>
        <table className="text-xs border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th className="text-left pr-2 font-medium text-gray-500">Kelas</th>
              {data.dates.map((d) => (
                <th key={d} className="font-medium text-gray-400 px-1 whitespace-nowrap">
                  {shortDate(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.classes.map((row) => (
              <tr key={row.classId}>
                <td className="pr-2 font-medium text-gray-600 whitespace-nowrap">{row.className}</td>
                {row.cells.map((cell) => (
                  <td
                    key={cell.date}
                    title={
                      cell.pct === null
                        ? `${row.className} · ${shortDate(cell.date)}: tidak ada data`
                        : `${row.className} · ${shortDate(cell.date)}: ${cell.hadir}/${cell.total} hadir (${cell.pct}%) — klik untuk detail`
                    }
                    onClick={() => handleCellClick(row, cell)}
                    className={`rounded text-center align-middle px-1.5 py-1 min-w-[2.5rem] ${cellColor(cell.pct)} ${cell.pct !== null ? 'cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-smk-blue transition-all' : 'cursor-default'}`}
                  >
                    {cell.pct === null ? '·' : `${Math.round(cell.pct)}%`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-3 mt-3 text-[11px] text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 inline-block" /> &lt;75%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-200 inline-block" /> 75–79%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-200 inline-block" /> 80–89%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-lime-200 inline-block" /> 90–94%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-300 inline-block" /> ≥95%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-100 inline-block" /> tanpa data</span>
        </div>
      </Card>

      {selected && (
        <DetailPanel
          classId={selected.classId}
          date={selected.date}
          className={selected.className}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
