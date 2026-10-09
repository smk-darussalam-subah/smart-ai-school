'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  FileText,
  MapPin,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAttendance, LocationBadge } from './AttendanceEngine';
import {
  ATTENDANCE_STATUS_LABEL,
  formatAttendanceDate,
  formatAttendanceTime,
  type AttendanceDetail,
  type AttendancePolicy,
  type AttendanceReport,
  type AttendanceRow,
} from '@/lib/staff-attendance';
import { fmtMin, wibTodayISO } from '@/lib/bell-times';

const inputClass =
  'h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-base sm:text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500';
function duration(row: AttendanceRow) {
  const record = row.receipt;
  if (!record?.checkOutAt) return '—';
  const minutes = Math.max(
    0,
    Math.floor(
      (new Date(record.checkOutAt).getTime() - new Date(record.checkInAt).getTime()) / 60000,
    ),
  );
  return Math.floor(minutes / 60) + 'j ' + (minutes % 60) + 'm';
}
function employeeLabel(row: AttendanceRow) {
  return row.arrival.basis === 'EXEMPT'
    ? 'Kepala Sekolah'
    : row.employee.role === 'TATA_USAHA'
      ? 'Tata Usaha'
      : row.employee.teacher
        ? 'Guru'
        : 'Tendik';
}
export default function AdminAttendanceView({ canManage = false, initialDate }: { canManage?: boolean; initialDate?: string }) {
  const { gateway, refresh } = useAttendance();
  const today = initialDate ?? wibTodayISO();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [location, setLocation] = useState('ALL');
  const [unit, setUnit] = useState('ALL');
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [detail, setDetail] = useState<AttendanceDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequest = useRef(0);
  const [tab, setTab] = useState('summary');
  const [editIn, setEditIn] = useState('');
  const [editOut, setEditOut] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policy, setPolicy] = useState<AttendancePolicy | null>(null);
  const params = useCallback(
    () =>
      new URLSearchParams({
        from,
        to,
        search,
        status,
        location,
        unit,
        page: String(page),
        limit: '20',
      }),
    [from, to, search, status, location, unit, page],
  );
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(
      () => {
        void gateway
          .report(params())
          .then((data) => {
            if (!cancelled) {
              setReport(data);
              setError('');
              setPolicy(data.policy);
            }
          })
          .catch((cause) => {
            if (!cancelled) {
              setReport(null);
              setError(cause instanceof Error ? cause.message : 'Rekap belum dapat dimuat.');
            }
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      },
      search ? 250 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [gateway, params, revision, search]);
  function update(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }
  async function showDetail(row: AttendanceRow) {
    if (!row.receipt) return;
    const request = ++detailRequest.current;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    setDetailError('');
    setTab('summary');
    setReason('');
    setNote('');
    try {
      const data = await gateway.detail(row.receipt.id);
      if (request !== detailRequest.current) return;
      setDetail(data);
      setEditIn(formatAttendanceTime(data.checkInAt).replace('.', ':'));
      setEditOut(data.checkOutAt ? formatAttendanceTime(data.checkOutAt).replace('.', ':') : '');
    } catch (cause) {
      if (request === detailRequest.current)
        setDetailError(cause instanceof Error ? cause.message : 'Detail belum tersedia.');
    } finally {
      if (request === detailRequest.current) setDetailLoading(false);
    }
  }
  async function correct() {
    if (!detail || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setDetailError('');
    try {
      if (reason.trim().length < 10 || !editIn)
        throw new Error('Isi jam masuk dan alasan minimal 10 karakter.');
      await gateway.correct(detail.id, {
        checkInAt: new Date(detail.date.slice(0, 10) + 'T' + editIn + ':00+07:00').toISOString(),
        checkOutAt: editOut
          ? new Date(detail.date.slice(0, 10) + 'T' + editOut + ':00+07:00').toISOString()
          : null,
        reason: reason.trim(),
      });
      setDetail(await gateway.detail(detail.id));
      setReason('');
      setTab('history');
      setRevision((current) => current + 1);
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : 'Koreksi belum tersimpan.');
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }
  async function addNote() {
    if (!detail || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setDetailError('');
    try {
      if (note.trim().length < 3) throw new Error('Catatan minimal 3 karakter.');
      await gateway.note(detail.id, note.trim());
      setDetail(await gateway.detail(detail.id));
      setNote('');
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : 'Catatan belum tersimpan.');
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }
  async function exportRows() {
    if (!report || loading) return;
    setSaving(true);
    setError('');
    try {
      const records: AttendanceRow[] = [];
      let current = 1;
      let total = 0;
      do {
        const query = params();
        query.set('page', String(current));
        query.set('limit', '100');
        const data = await gateway.report(query);
        if (!data.data.length && records.length < data.total)
          throw new Error('Rekap berubah selama ekspor. Muat ulang dan coba kembali.');
        total = data.total;
        records.push(...data.data);
        current++;
      } while (records.length < total && current <= 1000);
      if (records.length < total)
        throw new Error('Rekap berubah atau terlalu besar. Persempit rentang sebelum ekspor.');
      // Spreadsheet formula injection is neutralized; no coordinates or NIY in exports.
      const cell = (value: string) =>
        '"' + (/^[=+@\-\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""') + '"';
      const csv = [
        'Tanggal,Nama,Unit,Masuk,Pulang,Status,Status lokasi',
        ...records.map((row) =>
          [
            row.date,
            row.employee.fullName,
            row.employee.teacher ? 'Guru' : 'Tendik',
            formatAttendanceTime(row.receipt?.checkInAt),
            formatAttendanceTime(row.receipt?.checkOutAt),
            row.status,
            row.receipt?.locationInStatus ?? 'Belum presensi',
          ]
            .map(cell)
            .join(','),
        ),
      ].join('\r\n');
      const url = URL.createObjectURL(
        new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'rekap-presensi-' + from + '-' + to + '.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ekspor gagal.');
    } finally {
      setSaving(false);
    }
  }
  const summary = report?.summary;
  const percent = (value: number) =>
    summary?.expected ? Math.round((value / summary.expected) * 1000) / 10 + '%' : '—';
  const metrics = [
    {
      label: 'Total Pegawai',
      value: summary?.totalEmployees,
      note: 'Guru & tenaga kependidikan',
      icon: Users,
      color: 'blue',
    },
    {
      label: 'Hadir',
      value: summary?.present,
      note: summary ? percent(summary.present) + ' dari kewajiban periode' : '',
      icon: Check,
      color: 'emerald',
    },
    {
      label: 'Tepat Waktu',
      value: summary?.onTime,
      note: summary ? percent(summary.onTime) + ' dari kewajiban periode' : '',
      icon: Clock3,
      color: 'blue',
    },
    {
      label: 'Terlambat',
      value: summary?.late,
      note: 'Setelah jam masuk',
      icon: Clock3,
      color: 'amber',
    },
    {
      label: 'Belum Hadir',
      value: summary?.absent,
      note: 'Belum ada catatan masuk',
      icon: Users,
      color: 'rose',
    },
    {
      label: 'Perlu Review',
      value: summary?.review,
      note: 'Lokasi / belum pulang',
      icon: AlertTriangle,
      color: 'violet',
    },
  ] as const;
  const colors = {
    blue: 'bg-blue-50 border-blue-100 text-blue-700',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-800',
    rose: 'bg-rose-50 border-rose-100 text-rose-700',
    violet: 'bg-violet-50 border-violet-100 text-violet-700',
  };
  const maxTrend = Math.max(
    1,
    ...(report?.trend ?? []).map((point) => point.present + point.absent),
  );
  return (
    <div className="space-y-4 text-sm sm:space-y-5 [&_button]:min-h-11">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600 sm:h-12 sm:w-12">
            <CalendarDays size={25} />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
              Rekap Presensi Pegawai
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Monitoring kehadiran guru dan tenaga kependidikan
            </p>
          </div>
        </div>
        {canManage && (
          <Button variant="outline" disabled={!policy} onClick={() => setPolicyOpen(true)}>
            <Settings2 size={15} className="mr-2" />
            Kebijakan presensi
          </Button>
        )}
      </header>
      <section
        aria-label="Filter rekap"
        className="grid grid-cols-2 items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex md:flex-wrap"
      >
        <label className="grid min-w-0 gap-1.5 text-[11px] font-medium text-slate-500">
          Mulai
          <input
            type="date"
            className={inputClass}
            value={from}
            onChange={(event) => update(setFrom, event.target.value)}
          />
        </label>
        <label className="grid min-w-0 gap-1.5 text-[11px] font-medium text-slate-500">
          Sampai
          <input
            type="date"
            className={inputClass}
            value={to}
            onChange={(event) => update(setTo, event.target.value)}
          />
        </label>
        <label className="grid min-w-0 gap-1.5 text-[11px] font-medium text-slate-500">
          Unit
          <select
            className={inputClass}
            value={unit}
            onChange={(event) => update(setUnit, event.target.value)}
          >
            <option value="ALL">Semua unit</option>
            <option value="TEACHER">Guru</option>
            <option value="STAFF">Tenaga kependidikan</option>
          </select>
        </label>
        <label className="grid min-w-0 gap-1.5 text-[11px] font-medium text-slate-500">
          Status kehadiran
          <select
            className={inputClass}
            value={status}
            onChange={(event) => update(setStatus, event.target.value)}
          >
            <option value="ALL">Semua status</option>
            <option value="NOT_DUE">Belum waktunya</option>
            <option value="NOT_SCHEDULED">Tidak ada jadwal</option>
            <option value="NOT_REQUIRED">Tidak terikat jam</option>
            <option value="UNKNOWN">Jadwal perlu verifikasi</option>
            <option value="PRESENT">Hadir (tidak terlambat)</option>
            <option value="LATE">Terlambat</option>
            <option value="ABSENT">Belum hadir</option>
            <option value="NO_CHECKOUT">Belum pulang</option>
            <option value="REVIEW">Perlu review</option>
          </select>
        </label>
        <label className="grid min-w-0 gap-1.5 text-[11px] font-medium text-slate-500">
          Status lokasi
          <select
            className={inputClass}
            value={location}
            onChange={(event) => update(setLocation, event.target.value)}
          >
            <option value="ALL">Semua lokasi</option>
            <option value="INSIDE">Di area</option>
            <option value="OUTSIDE">Di luar area</option>
            <option value="UNVERIFIED">Belum terverifikasi</option>
            <option value="DISABLED">Belum diatur</option>
          </select>
        </label>
        <label className="relative col-span-2 grid min-w-0 flex-1 gap-1.5 text-[11px] font-medium text-slate-500 md:min-w-40">
          Cari pegawai
          <input
            className={inputClass + ' pl-8'}
            placeholder="Nama pegawai…"
            value={search}
            onChange={(event) => update(setSearch, event.target.value)}
          />
          <Search size={14} className="absolute bottom-3 left-2.5 text-slate-400" />
        </label>
        <Button
          variant="outline"
          aria-label="Muat ulang rekap"
          disabled={loading}
          onClick={() => setRevision((current) => current + 1)}
        >
          <RefreshCw size={16} />
        </Button>
        <Button
          className="bg-blue-600 hover:bg-blue-700"
          disabled={!report || loading || saving}
          onClick={() => void exportRows()}
        >
          <Download size={15} className="mr-2" />
          Ekspor
        </Button>
      </section>
      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </p>
      )}
      <div aria-busy={loading} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {metrics.map((metric) => (
          <section
            key={metric.label}
            className={'rounded-xl border p-3 sm:p-4 ' + colors[metric.color]}
          >
            <div className="flex items-center gap-2">
              <metric.icon size={18} />
              <h2 className="text-xs font-semibold">{metric.label}</h2>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:mt-3 sm:text-3xl">
              {loading ? '…' : (metric.value ?? '—')}
            </p>
            <p className="mt-2 min-h-8 text-[10px] leading-relaxed text-slate-500">{metric.note}</p>
          </section>
        ))}
      </div>
      <div className="grid items-stretch gap-4 sm:gap-5 lg:grid-cols-[1.15fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-bold text-slate-950">
                <AlertTriangle size={19} className="text-rose-500" />
                Perlu Perhatian
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Daftar presensi yang memerlukan tindak lanjut
              </p>
            </div>
            <button
              className="text-xs font-semibold text-blue-600"
              onClick={() => update(setStatus, 'REVIEW')}
            >
              Lihat semua
            </button>
          </div>
          {(report?.attention ?? []).map((row) => (
            <button
              key={row.employee.id + row.date}
              className="flex w-full items-center gap-3 border-t border-slate-100 py-3 text-left text-xs hover:bg-slate-50"
              onClick={() => void showDetail(row)}
            >
              <span className="rounded-lg bg-rose-50 p-2 text-rose-500">
                <MapPin size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">{row.employee.fullName}</p>
                <p className="mt-1 text-[10px] text-slate-500">
                  {row.date} · {formatAttendanceTime(row.receipt?.checkInAt)}
                </p>
              </div>
              <span className="max-w-40 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] font-medium text-amber-800">
                {row.receipt?.locationInStatus === 'OUTSIDE'
                  ? 'Di luar area'
                  : row.receipt?.locationInStatus === 'UNVERIFIED'
                    ? 'Lokasi belum terverifikasi'
                    : 'Belum presensi pulang'}
              </span>
            </button>
          ))}
          {!report?.attention.length && (
            <p className="py-10 text-center text-sm text-slate-500">
              {loading
                ? 'Memuat…'
                : report
                  ? 'Tidak ada catatan yang perlu review pada periode ini.'
                  : 'Data belum tersedia.'}
            </p>
          )}
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-950">Tren Kehadiran</h2>
            <div className="flex gap-1">
              {[7, 30].map((days) => (
                <button
                  key={days}
                  className="rounded-lg border px-2.5 py-1.5 text-xs text-blue-700 hover:bg-blue-50"
                  onClick={() => {
                    setFrom(
                      new Date(new Date(today).getTime() - (days - 1) * 86400000)
                        .toISOString()
                        .slice(0, 10),
                    );
                    setTo(today);
                    setPage(1);
                  }}
                >
                  {days} hari
                </button>
              ))}
            </div>
          </div>
          <div
            className="mt-4 flex h-36 items-end justify-around gap-1.5 border-b border-slate-200 px-1 sm:mt-5 sm:h-40"
            role="img"
            aria-label="Grafik kehadiran per hari; rincian tersedia pada tabel dan label tiap batang"
          >
            {(report?.trend ?? []).map((point) => (
              <div
                key={point.date}
                className="group relative flex h-full min-w-1 max-w-10 flex-1 flex-col justify-end"
                title={
                  point.date +
                  ': hadir ' +
                  point.present +
                  ', terlambat ' +
                  point.late +
                  ', belum hadir ' +
                  point.absent
                }
              >
                <div
                  className="rounded-t-sm bg-rose-300"
                  style={{ height: (point.absent / maxTrend) * 100 + '%' }}
                />
                <div
                  className="bg-amber-300"
                  style={{ height: (point.late / maxTrend) * 100 + '%' }}
                />
                <div
                  className="bg-emerald-400"
                  style={{ height: ((point.present - point.late) / maxTrend) * 100 + '%' }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-slate-500">
            <span>{report?.trend[0]?.date ?? '—'}</span>
            <span>{report?.trend.at(-1)?.date ?? '—'}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-slate-500">
            <span>
              <i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-400" />
              Hadir tanpa penanda terlambat
            </span>
            <span>
              <i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-amber-300" />
              Terlambat
            </span>
            <span>
              <i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-rose-300" />
              Belum hadir
            </span>
          </div>
        </section>
      </div>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 font-bold text-slate-950">
            <Users size={19} className="text-blue-600" />
            Rekap Pegawai
          </h2>
          <p className="text-xs text-slate-500">
            {report?.total ?? 0} catatan sesuai filter · statistik di atas mencakup seluruh periode
          </p>
        </div>
        <div className="divide-y border-t px-4 md:hidden">
          {report?.data.map((row) => (
            <article key={row.employee.id + row.date} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-semibold">{row.employee.fullName}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {employeeLabel(row)} · {row.date}
                  </p>
                </div>
                <span
                  className={
                    'shrink-0 rounded-lg px-2 py-1 text-xs ' +
                    (row.status === 'ABSENT'
                      ? 'bg-rose-50 text-rose-700'
                      : row.status === 'LATE'
                        ? 'bg-amber-50 text-amber-800'
                        : row.status === 'PRESENT'
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-slate-100 text-slate-700')
                  }
                >
                  {ATTENDANCE_STATUS_LABEL[row.status]}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-600">
                {row.arrival.basis === 'TEACHING'
                  ? 'Mengajar ' +
                    formatAttendanceTime(row.arrival.firstTeachingAt) +
                    ' · batas hadir ' +
                    formatAttendanceTime(row.arrival.dueAt) +
                    ' WIB'
                  : row.arrival.basis === 'WORKDAY'
                    ? 'Batas hadir ' + formatAttendanceTime(row.arrival.dueAt) + ' WIB'
                    : row.arrival.basis === 'EXEMPT'
                      ? 'Kepala sekolah · tidak terikat batas jam'
                      : row.arrival.basis === 'NONE'
                        ? 'Tidak ada jadwal mengajar'
                        : 'Jadwal belum terverifikasi'}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                <p>
                  <span className="block text-xs text-slate-500">Masuk</span>
                  {formatAttendanceTime(row.receipt?.checkInAt)}
                </p>
                <p>
                  <span className="block text-xs text-slate-500">Pulang</span>
                  {formatAttendanceTime(row.receipt?.checkOutAt)}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                {row.receipt ? (
                  <LocationBadge status={row.receipt.locationInStatus} />
                ) : (
                  <span className="text-xs text-slate-500">Belum ada catatan lokasi</span>
                )}
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={!row.receipt}
                  onClick={() => row.receipt && void showDetail(row)}
                >
                  <Eye size={16} className="mr-2" />
                  Detail
                </Button>
              </div>
            </article>
          ))}
          {!report?.data.length && (
            <p className="py-8 text-center text-sm text-slate-500">
              Tidak ada catatan sesuai filter.
            </p>
          )}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[850px] text-left text-xs">
            <thead className="border-y border-slate-100 bg-slate-50 text-slate-500">
              <tr>
                {[
                  'Nama',
                  'Unit',
                  'Tanggal',
                  'Jam kerja',
                  'Masuk',
                  'Pulang',
                  'Durasi',
                  'Kehadiran',
                  'Lokasi masuk',
                  'Aksi',
                ].map((label) => (
                  <th key={label} className="whitespace-nowrap px-4 py-3 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading &&
                report?.data.map((row) => (
                  <tr
                    key={row.employee.id + row.date}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">
                          {row.employee.fullName
                            .split(' ')
                            .slice(0, 2)
                            .map((word) => word[0])
                            .join('')}
                        </span>
                        <div>
                          <p className="whitespace-nowrap font-semibold text-slate-900">
                            {row.employee.fullName}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {row.employee.staff?.niy
                              ? 'NIY ' + row.employee.staff.niy
                              : 'Profil pegawai'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{employeeLabel(row)}</td>
                    <td className="px-4 py-3 text-slate-600">{row.date}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      {row.arrival.basis === 'TEACHING' ? (
                        <>
                          <span className="block">
                            Mengajar {formatAttendanceTime(row.arrival.firstTeachingAt)}
                          </span>
                          <span className="text-[10px]">
                            Batas hadir {formatAttendanceTime(row.arrival.dueAt)}
                          </span>
                        </>
                      ) : row.arrival.basis === 'WORKDAY' ? (
                        formatAttendanceTime(row.arrival.dueAt) + ' WIB'
                      ) : row.arrival.basis === 'EXEMPT' ? (
                        'Tidak terikat jam'
                      ) : row.arrival.basis === 'NONE' ? (
                        'Tidak ada jadwal'
                      ) : (
                        'Belum terverifikasi'
                      )}
                    </td>
                    <td className="px-4 py-3">{formatAttendanceTime(row.receipt?.checkInAt)}</td>
                    <td className="px-4 py-3">{formatAttendanceTime(row.receipt?.checkOutAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{duration(row)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          'whitespace-nowrap rounded-lg px-2.5 py-1.5 font-medium ' +
                          (row.status === 'PRESENT'
                            ? 'bg-emerald-50 text-emerald-800'
                            : row.status === 'LATE'
                              ? 'bg-amber-50 text-amber-800'
                              : row.status === 'ABSENT'
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-slate-100 text-slate-600')
                        }
                      >
                        {ATTENDANCE_STATUS_LABEL[row.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.receipt ? <LocationBadge status={row.receipt.locationInStatus} /> : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-11 w-11"
                        disabled={!row.receipt}
                        aria-label={'Detail ' + row.employee.fullName}
                        onClick={() => void showDetail(row)}
                      >
                        <Eye size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              {(loading || !report?.data.length) && (
                <tr>
                  <td colSpan={10} className="p-10 text-center text-sm text-slate-500">
                    {loading
                      ? 'Memuat rekap…'
                      : error
                        ? 'Data tidak tersedia.'
                        : 'Tidak ada catatan sesuai filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-4 p-4 text-xs text-slate-500">
          <span>
            Halaman {page} dari {Math.max(1, Math.ceil((report?.total ?? 0) / 20))}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={loading || page <= 1}
              onClick={() => setPage((current) => current - 1)}
              aria-label="Halaman sebelumnya"
            >
              <ChevronLeft size={15} />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={loading || page * 20 >= (report?.total ?? 0)}
              onClick={() => setPage((current) => current + 1)}
              aria-label="Halaman berikutnya"
            >
              <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      </section>
      <Dialog
        open={detailOpen}
        onOpenChange={(value: boolean) => {
          if (!saving) {
            if (!value) detailRequest.current++;
            setDetailOpen(value);
          }
        }}
      >
        <DialogContent className="left-auto right-0 top-0 h-dvh max-h-dvh w-full translate-x-0 translate-y-0 overflow-y-auto rounded-none border-l p-5 sm:max-w-[410px]">
          <DialogHeader className="pr-10">
            <DialogTitle>Detail Pegawai</DialogTitle>
            <DialogDescription>
              Informasi presensi, riwayat koreksi, dan catatan admin.
            </DialogDescription>
          </DialogHeader>
          {detailLoading && (
            <p role="status" className="py-10 text-center text-slate-500">
              Memuat detail…
            </p>
          )}
          {detailError && (
            <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
              {detailError}
            </p>
          )}
          {detail && (
            <>
              <div className="flex items-center gap-3 py-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-xl font-bold text-blue-700">
                  {detail.user.fullName
                    .split(' ')
                    .slice(0, 2)
                    .map((word) => word[0])
                    .join('')}
                </div>
                <div>
                  <h3 className="font-bold text-slate-950">{detail.user.fullName}</h3>
                  <p className="mt-1 text-xs text-slate-500">{formatAttendanceDate(detail.date)}</p>
                </div>
              </div>
              <div className="flex border-b">
                {[
                  ['summary', 'Ringkasan'],
                  ['history', 'Riwayat'],
                  ['correction', 'Koreksi'],
                  ['notes', 'Catatan'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    aria-pressed={tab === id}
                    className={
                      'flex-1 border-b-2 py-3 text-xs font-semibold ' +
                      (tab === id
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-500')
                    }
                    onClick={() => setTab(id!)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {tab === 'summary' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                    <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      <ShieldCheck size={17} className="text-blue-600" />
                      Ringkasan Presensi
                    </h4>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[11px] text-slate-500">Masuk</p>
                        <p className="mt-1 text-lg font-bold">
                          {formatAttendanceTime(detail.checkInAt)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500">Pulang</p>
                        <p className="mt-1 text-lg font-bold">
                          {formatAttendanceTime(detail.checkOutAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                  {['in', 'out'].map((direction) => (
                    <div key={direction} className="rounded-xl border p-4">
                      <h4 className="mb-3 text-sm font-semibold text-slate-900">
                        Lokasi {direction === 'in' ? 'masuk' : 'pulang'}
                      </h4>
                      {direction === 'out' && !detail.checkOutAt ? (
                        <p className="text-xs text-slate-500">Belum melakukan presensi pulang.</p>
                      ) : (
                        <>
                          <LocationBadge
                            status={
                              direction === 'in'
                                ? detail.locationInStatus
                                : (detail.locationOutStatus ?? 'UNVERIFIED')
                            }
                          />
                          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <dt className="text-slate-500">Jarak sekolah</dt>
                              <dd className="mt-1 font-semibold">
                                {(direction === 'in' ? detail.distanceInM : detail.distanceOutM) ??
                                  '—'}{' '}
                                m
                              </dd>
                            </div>
                            <div>
                              <dt className="text-slate-500">Akurasi GPS</dt>
                              <dd className="mt-1 font-semibold">
                                {(direction === 'in' ? detail.accuracyInM : detail.accuracyOutM) ??
                                  '—'}{' '}
                                m
                              </dd>
                            </div>
                          </dl>
                        </>
                      )}
                    </div>
                  ))}
                  <p className="text-xs leading-relaxed text-slate-500">
                    Koordinat presisi tidak ditampilkan dalam rekap. Status kehadiran dan status
                    lokasi adalah dua hal berbeda.
                  </p>
                </div>
              )}
              {tab === 'history' && (
                <div className="space-y-3">
                  {detail.events.map((event) => (
                    <article key={event.id} className="rounded-xl border p-3">
                      <p className="flex items-center gap-2 text-xs font-semibold text-blue-700">
                        <FileText size={14} />
                        {event.kind === 'CORRECTION'
                          ? 'Koreksi manual'
                          : event.kind === 'NOTE'
                            ? 'Catatan admin'
                            : event.kind === 'CHECK_IN'
                              ? 'Presensi masuk'
                              : event.kind === 'CHECK_OUT'
                                ? 'Presensi pulang'
                                : 'Impor historis'}
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-slate-700">{event.reason}</p>
                      <p className="mt-2 text-[11px] text-slate-500">
                        {new Date(event.createdAt).toLocaleString('id-ID', {
                          timeZone: 'Asia/Jakarta',
                        })}{' '}
                        WIB
                      </p>
                      {event.kind === 'CORRECTION' && (
                        <p className="mt-2 text-[11px] text-slate-600">
                          Masuk: {formatAttendanceTime(event.before?.checkInAt as string)} →{' '}
                          {formatAttendanceTime(event.after?.checkInAt as string)}
                          <br />
                          Pulang: {formatAttendanceTime(event.before?.checkOutAt as string)} →{' '}
                          {formatAttendanceTime(event.after?.checkOutAt as string)}
                        </p>
                      )}
                    </article>
                  ))}
                  {!detail.events.length && (
                    <p className="py-8 text-center text-sm text-slate-500">
                      Belum ada riwayat tambahan.
                    </p>
                  )}
                </div>
              )}
              {tab === 'correction' &&
                (canManage ? (
                  <div className="space-y-4">
                    <p className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                      Koreksi tidak mengubah bukti lokasi. Nilai sebelum/sesudah dan alasan disimpan
                      sebagai riwayat yang tidak dapat dihapus.
                    </p>
                    <label className="grid gap-1.5 text-xs text-slate-600">
                      Masuk (WIB)
                      <input
                        type="time"
                        className={inputClass}
                        value={editIn}
                        onChange={(event) => setEditIn(event.target.value)}
                      />
                    </label>
                    <label className="grid gap-1.5 text-xs text-slate-600">
                      Pulang (WIB, kosong = belum pulang)
                      <input
                        type="time"
                        className={inputClass}
                        value={editOut}
                        onChange={(event) => setEditOut(event.target.value)}
                      />
                    </label>
                    <label className="grid gap-1.5 text-xs text-slate-600">
                      Alasan koreksi
                      <textarea
                        rows={3}
                        maxLength={500}
                        className="rounded-lg border p-3 text-base sm:text-sm"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                      />
                    </label>
                    <Button
                      className="w-full bg-blue-600"
                      disabled={saving || reason.trim().length < 10}
                      onClick={() => void correct()}
                    >
                      {saving ? 'Menyimpan…' : 'Simpan koreksi teraudit'}
                    </Button>
                  </div>
                ) : (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                    Akses baca saja. Koreksi memerlukan izin Super Admin.
                  </p>
                ))}
              {tab === 'notes' && (
                <div className="space-y-3">
                  {detail.events
                    .filter((event) => event.kind === 'NOTE')
                    .map((event) => (
                      <p key={event.id} className="rounded-lg border p-3 text-sm text-slate-700">
                        {event.reason}
                      </p>
                    ))}
                  {canManage ? (
                    <>
                      <label className="grid gap-1.5 text-xs text-slate-600">
                        Catatan baru
                        <textarea
                          rows={3}
                          className="rounded-lg border p-3 text-base sm:text-sm"
                          maxLength={500}
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                        />
                      </label>
                      <Button
                        className="w-full"
                        disabled={saving || note.trim().length < 3}
                        onClick={() => void addNote()}
                      >
                        Tambah catatan
                      </Button>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Catatan hanya dapat ditambahkan oleh Super Admin.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={policyOpen}
        onOpenChange={(value: boolean) => {
          if (!saving) setPolicyOpen(value);
        }}
      >
        <DialogContent className="max-h-[94dvh] w-[calc(100%_-_2rem)] overflow-y-auto">
          <DialogHeader className="pr-10">
            <DialogTitle>Kebijakan Presensi</DialogTitle>
            <DialogDescription>
              Konfigurasi penerimaan lokasi, hari/jam kerja, dan jeda pengingat.
            </DialogDescription>
          </DialogHeader>
          {policy && (
            <div className="space-y-4">
              <label className="grid gap-1.5 text-xs text-slate-600">
                Lokasi gagal / di luar area
                <select
                  className={inputClass}
                  value={policy.attendanceMode}
                  onChange={(event) =>
                    setPolicy({
                      ...policy,
                      attendanceMode: event.target.value as AttendancePolicy['attendanceMode'],
                    })
                  }
                >
                  <option value="REVIEW">Catat sebagai perlu review</option>
                  <option value="STRICT">Tolak sampai di dalam area terverifikasi</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-xs text-slate-600">
                  Batas akurasi (meter)
                  <input
                    type="number"
                    min={5}
                    max={500}
                    className={inputClass}
                    value={policy.attendanceAccuracyM}
                    onChange={(event) =>
                      setPolicy({ ...policy, attendanceAccuracyM: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="grid gap-1.5 text-xs text-slate-600">
                  Jeda pengingat (menit)
                  <input
                    type="number"
                    min={5}
                    max={240}
                    className={inputClass}
                    value={policy.attendancePromptCooldown}
                    onChange={(event) =>
                      setPolicy({ ...policy, attendancePromptCooldown: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="grid gap-1.5 text-xs text-slate-600">
                  Jam masuk pegawai lain (TU tetap 07.00)
                  <input
                    type="time"
                    className={inputClass}
                    value={fmtMin(policy.attendanceStartMinute)}
                    onChange={(event) => {
                      const [hour, minute] = event.target.value.split(':').map(Number);
                      setPolicy({ ...policy, attendanceStartMinute: hour! * 60 + minute! });
                    }}
                  />
                </label>
                <label className="grid gap-1.5 text-xs text-slate-600">
                  Jam pulang
                  <input
                    type="time"
                    className={inputClass}
                    value={fmtMin(policy.attendanceEndMinute)}
                    onChange={(event) => {
                      const [hour, minute] = event.target.value.split(':').map(Number);
                      setPolicy({ ...policy, attendanceEndMinute: hour! * 60 + minute! });
                    }}
                  />
                </label>
                <label className="grid gap-1.5 text-xs text-slate-600">
                  Guru: batas hadir sebelum mengajar (menit)
                  <input
                    type="number"
                    min={0}
                    max={120}
                    className={inputClass}
                    value={policy.attendanceTeacherLeadMin}
                    onChange={(event) =>
                      setPolicy({ ...policy, attendanceTeacherLeadMin: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="grid gap-1.5 text-xs text-slate-600">
                  Guru: anjuran datang sebelum mengajar (menit)
                  <input
                    type="number"
                    min={policy.attendanceTeacherLeadMin}
                    max={180}
                    className={inputClass}
                    value={policy.attendanceTeacherLeadTarget}
                    onChange={(event) =>
                      setPolicy({
                        ...policy,
                        attendanceTeacherLeadTarget: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((label, index) => (
                  <label
                    key={label}
                    className="flex items-center gap-1.5 rounded-lg border p-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={policy.attendanceWorkingDays.includes(index + 1)}
                      onChange={(event) =>
                        setPolicy({
                          ...policy,
                          attendanceWorkingDays: event.target.checked
                            ? [...policy.attendanceWorkingDays, index + 1].sort()
                            : policy.attendanceWorkingDays.filter((day) => day !== index + 1),
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p className="text-xs leading-relaxed text-slate-500">
                Guru mengikuti pelajaran pertama; TU wajib hadir pukul 07.00. Kepala sekolah dengan
                jabatan aktif tidak terikat jam kehadiran. Koordinat dan radius tetap di Profil
                Sekolah. Mode ketat memerlukan geofence sekolah yang telah dikonfigurasi.
              </p>
              {error && (
                <p role="alert" className="text-sm text-rose-700">
                  {error}
                </p>
              )}
              <Button
                disabled={saving || !policy.attendanceWorkingDays.length}
                onClick={async () => {
                  if (saveLock.current) return;
                  saveLock.current = true;
                  setSaving(true);
                  try {
                    await gateway.policy(policy);
                    await refresh();
                    setPolicyOpen(false);
                    setRevision((current) => current + 1);
                    setError('');
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : 'Kebijakan gagal disimpan.');
                  } finally {
                    saveLock.current = false;
                    setSaving(false);
                  }
                }}
              >
                Simpan kebijakan
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
