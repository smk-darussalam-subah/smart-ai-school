// =============================================================================
// AttendanceHeatmap — Grid kehadiran Kelas × Hari, 10 hari terakhir
// (referensi KamilEdu Modul 1). 4 level warna: <75 / <80 / <90 / <95 / ≥95.
// Server component: data sudah di-fetch oleh page.
// =============================================================================
import { Card } from '@/components/ui/card';

export interface HeatmapCell {
  date: string;
  total: number;
  hadir: number;
  pct: number | null;
}

export interface HeatmapRow {
  classId: string;
  className: string;
  grade: number;
  cells: HeatmapCell[];
}

export interface HeatmapData {
  from: string;
  to: string;
  dates: string[];
  classes: HeatmapRow[];
  overall: {
    today: { pct: number | null; total: number; hadir: number };
    yesterday: { pct: number | null } | null;
  };
}

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

export default function AttendanceHeatmap({ data }: { data: HeatmapData }) {
  if (data.classes.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="font-semibold text-gray-700 mb-2">🗓️ Heatmap Kehadiran</h2>
        <p className="text-sm text-gray-400">Belum ada kelas aktif.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6 overflow-x-auto">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-700">
          🗓️ Heatmap Kehadiran <span className="text-gray-400 font-normal">· kelas × hari, {data.dates.length} hari terakhir</span>
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
                      : `${row.className} · ${shortDate(cell.date)}: ${cell.hadir}/${cell.total} hadir (${cell.pct}%)`
                  }
                  className={`rounded text-center align-middle px-1.5 py-1 min-w-[2.5rem] ${cellColor(cell.pct)}`}
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
  );
}
