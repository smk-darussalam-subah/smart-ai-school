'use client';
import { useEffect, useState } from 'react';
import {
  CalendarDays,
  Check,
  Clock3,
  LogIn,
  LogOut,
  MapPin,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAttendance, LocationBadge, TeachingCard } from './AttendanceEngine';
import {
  closestTeaching,
  formatAttendanceDate,
  formatAttendanceTime,
  LOCATION_HELP,
  type AttendanceReceipt,
} from '@/lib/staff-attendance';

export default function TeacherAttendanceView() {
  const { context, error, loading, busy, refresh, openPrompt, gateway } = useAttendance();
  const [history, setHistory] = useState<AttendanceReceipt[]>([]);
  const [historyError, setHistoryError] = useState('');
  useEffect(() => {
    let cancelled = false;
    void gateway
      .history()
      .then((data) => {
        if (!cancelled) {
          setHistory(data);
          setHistoryError('');
        }
      })
      .catch(() => {
        if (!cancelled) setHistoryError('Riwayat belum dapat dimuat. Coba muat ulang.');
      });
    return () => {
      cancelled = true;
    };
  }, [gateway, context?.receipt?.updatedAt]);
  const receipt = context?.receipt;
  const now = new Date(context?.serverNow ?? Date.now());
  const nearest = closestTeaching(context?.schedules ?? [], now);
  const completed = history.filter((item) => item.checkOutAt).length;
  const completeRate = history.length ? Math.round((completed / history.length) * 100) : 0;
  return (
    <div className="space-y-4 text-sm sm:space-y-5 [&_button]:min-h-11">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600 sm:h-12 sm:w-12">
            <CalendarDays size={25} />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
              Presensi Saya
            </h1>
            <p className="mt-1 text-sm text-slate-500">Kehadiran, lokasi, dan aktivitas hari ini</p>
          </div>
        </div>
        <Button variant="outline" disabled={loading || busy} onClick={() => void refresh()}>
          <RefreshCw size={15} className="mr-2" />
          Muat ulang
        </Button>
      </header>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          {error} Data sebelumnya tidak dianggap sebagai status terbaru.
        </div>
      )}
      {!context ? (
        <div className="rounded-2xl border bg-white p-10 text-center text-slate-500" role="status">
          {loading
            ? 'Memuat status presensi…'
            : 'Status belum tersedia. Muat ulang sebelum mencatat presensi.'}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
            <p className="text-sm font-medium text-blue-950">
              {formatAttendanceDate(context.date)}{' '}
              <span className="ml-2 text-xs text-slate-500">WIB · waktu server</span>
            </p>
            {context.holiday && <span className="text-xs text-blue-800">{context.holiday}</span>}
            <span className="text-xs text-slate-600">
              Radius sekolah: {context.policy.geofenceRadiusM} meter
            </span>
          </div>
          <div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-[1.05fr_1fr]">
            <div className="space-y-4 sm:space-y-5">
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-lg font-bold text-blue-600 sm:h-16 sm:w-16 sm:text-xl">
                    {context.employee.fullName
                      .split(' ')
                      .slice(0, 2)
                      .map((name) => name[0])
                      .join('')}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-slate-950 sm:text-lg">
                      {context.employee.fullName}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {context.arrival.basis === 'EXEMPT'
                        ? 'Kepala sekolah'
                        : context.employee.teacher
                          ? 'Guru · aktivitas mengajar'
                          : 'Tenaga kependidikan'}
                    </p>
                    <p
                      className={
                        'mt-3 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ' +
                        (receipt ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800')
                      }
                    >
                      <Check size={13} />
                      {receipt
                        ? receipt.checkOutAt
                          ? 'Presensi hari ini lengkap'
                          : 'Sudah presensi masuk'
                        : 'Belum presensi masuk'}
                    </p>
                  </div>
                </div>
                <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-950 sm:mt-5 sm:p-4">
                  {context.arrival.basis === 'TEACHING' ? (
                    <>
                      <p className="font-semibold">
                        Datang {formatAttendanceTime(context.arrival.recommendedAt)}–
                        {formatAttendanceTime(context.arrival.dueAt)} WIB
                      </p>
                      <p className="mt-1 text-xs leading-relaxed">
                        Pelajaran pertama {formatAttendanceTime(context.arrival.firstTeachingAt)}{' '}
                        WIB. Dianjurkan {context.policy.attendanceTeacherLeadTarget} menit
                        sebelumnya, batas hadir {context.policy.attendanceTeacherLeadMin} menit
                        sebelum mengajar.
                      </p>
                    </>
                  ) : context.arrival.basis === 'EXEMPT' ? (
                    <p>
                      Kepala sekolah tidak terikat batas waktu kehadiran. Presensi tetap dicatat
                      tanpa penilaian terlambat.
                    </p>
                  ) : context.arrival.basis === 'NONE' ? (
                    <p>
                      Tidak ada jadwal mengajar hari ini. Anda tidak ditandai terlambat berdasarkan
                      jam masuk pagi.
                    </p>
                  ) : context.arrival.basis === 'UNAVAILABLE' ? (
                    <p>
                      Jadwal belum terverifikasi. Status terlambat tidak ditentukan sampai jadwal
                      tersedia.
                    </p>
                  ) : (
                    <p>
                      Jam masuk tenaga kependidikan: {formatAttendanceTime(context.arrival.dueAt)}{' '}
                      WIB.
                    </p>
                  )}
                </div>
                <dl className="mt-4 divide-y divide-slate-100 text-sm sm:mt-5">
                  <div className="flex items-center justify-between gap-3 py-3">
                    <dt className="flex items-center gap-2 text-slate-500">
                      <Clock3 size={16} />
                      Waktu masuk
                    </dt>
                    <dd className="font-semibold text-slate-900">
                      {formatAttendanceTime(receipt?.checkInAt)} WIB
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-3">
                    <dt className="flex items-center gap-2 text-slate-500">
                      <Clock3 size={16} />
                      Waktu pulang
                    </dt>
                    <dd className="font-semibold text-slate-900">
                      {formatAttendanceTime(receipt?.checkOutAt)} WIB
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-3">
                    <dt className="flex items-center gap-2 text-slate-500">
                      <MapPin size={16} />
                      Lokasi masuk
                    </dt>
                    <dd>
                      {receipt ? (
                        <LocationBadge status={receipt.locationInStatus} />
                      ) : (
                        'Belum dicatat'
                      )}
                    </dd>
                  </div>
                  {receipt?.checkOutAt && (
                    <div className="flex items-center justify-between gap-3 py-3">
                      <dt className="text-slate-500">Lokasi pulang</dt>
                      <dd>
                        <LocationBadge status={receipt.locationOutStatus ?? 'UNVERIFIED'} />
                      </dd>
                    </div>
                  )}
                </dl>
                {receipt?.locationInReason && (
                  <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                    {LOCATION_HELP[receipt.locationInReason] ??
                      'Catatan lokasi lama dipertahankan; akurasi historis tidak direkonstruksi.'}
                  </p>
                )}
                <Button
                  className="mt-4 h-11 w-full bg-blue-600 text-sm hover:bg-blue-700 sm:mt-5 sm:h-12"
                  disabled={busy || loading || Boolean(error) || Boolean(receipt?.checkOutAt)}
                  onClick={() => void openPrompt(Boolean(receipt))}
                >
                  {receipt ? (
                    <LogOut className="mr-2" size={18} />
                  ) : (
                    <LogIn className="mr-2" size={18} />
                  )}
                  {receipt?.checkOutAt
                    ? 'Terima kasih, presensi lengkap'
                    : receipt
                      ? 'Presensi Pulang'
                      : 'Presensi Masuk Sekarang'}
                </Button>
              </section>
              {context.employee.teacher && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-900">
                    <CalendarDays size={19} className="text-blue-600" />
                    Jadwal Mengajar Hari Ini
                  </h2>
                  {context.scheduleError ? (
                    <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                      {context.scheduleError}
                    </p>
                  ) : context.schedules.length ? (
                    <div className="space-y-3">
                      {context.schedules.map((slot) => (
                        <TeachingCard
                          key={slot.id}
                          slot={slot}
                          now={now}
                          highlight={slot.id === nearest?.id}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                      Tidak ada jadwal mengajar hari ini.
                    </p>
                  )}
                </section>
              )}
            </div>
            <div className="space-y-4 sm:space-y-5">
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-900">
                  <ShieldCheck size={19} className="text-blue-600" />
                  Verifikasi Lokasi
                </h2>
                <div className="relative flex h-32 items-center justify-center overflow-hidden rounded-xl bg-slate-50 sm:h-40">
                  <svg viewBox="0 0 300 150" className="absolute h-full w-full" aria-hidden="true">
                    <path
                      d="M0 30h300M0 75h300M0 120h300M45 0v150M105 0v150M165 0v150M225 0v150M285 0v150"
                      stroke="#e2e8f0"
                      strokeWidth="12"
                    />
                    <circle
                      cx="150"
                      cy="75"
                      r="52"
                      fill="#d1fae5"
                      fillOpacity=".8"
                      stroke="#6ee7b7"
                      strokeWidth="2"
                      strokeDasharray="5 4"
                    />
                  </svg>
                  <div className="relative rounded-xl border border-white bg-white/90 px-5 py-3 text-center shadow-sm">
                    <MapPin className="mx-auto mb-2 text-emerald-600" size={26} />
                    <p className="text-xs font-semibold text-slate-800">
                      {receipt
                        ? 'Status lokasi pada saat presensi'
                        : 'Lokasi diperiksa saat presensi'}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Ilustrasi area · bukan peta pelacakan
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Jarak saat masuk</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {receipt?.distanceInM != null ? receipt.distanceInM + ' m' : 'Belum tersedia'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Akurasi GPS</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {receipt?.accuracyInM != null
                        ? Math.round(receipt.accuracyInM) + ' m'
                        : 'Belum tersedia'}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  Lokasi diambil untuk verifikasi presensi, bukan untuk memantau pergerakan Anda
                  terus-menerus.
                </p>
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <h2 className="font-bold text-slate-900">Ringkasan Catatan Saya</h2>
                <div className="mt-4 flex items-center gap-4 sm:mt-5 sm:gap-6">
                  <div
                    className="relative h-24 w-24 shrink-0 rounded-full sm:h-28 sm:w-28"
                    style={{
                      background: 'conic-gradient(#10b981 ' + completeRate + '%, #e2e8f0 0)',
                    }}
                    role="img"
                    aria-label={completeRate + '% catatan masuk-pulang lengkap'}
                  >
                    <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-white">
                      <strong className="text-xl text-slate-950 sm:text-2xl">
                        {completeRate}%
                      </strong>
                      <span className="text-[10px] text-slate-500">Catatan lengkap</span>
                    </div>
                  </div>
                  <dl className="flex-1 space-y-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Presensi masuk</dt>
                      <dd className="font-semibold">{history.length}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Masuk & pulang</dt>
                      <dd className="font-semibold">{completed}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Perlu review lokasi</dt>
                      <dd className="font-semibold">
                        {
                          history.filter((item) =>
                            ['OUTSIDE', 'UNVERIFIED'].includes(item.locationInStatus),
                          ).length
                        }
                      </dd>
                    </div>
                  </dl>
                </div>
                <p className="mt-3 text-[11px] text-slate-500">
                  Berdasarkan paling banyak 31 catatan terakhir; bukan persentase hari kerja.
                </p>
              </section>
            </div>
          </div>
        </>
      )}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="mb-4 font-bold text-slate-900">Riwayat Presensi Saya</h2>
        {historyError ? (
          <p role="alert" className="text-sm text-rose-700">
            {historyError}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="divide-y md:hidden">
              {history.map((item) => (
                <article key={item.id} className="py-3">
                  <h3 className="text-xs font-semibold text-slate-700">
                    {formatAttendanceDate(item.date)}
                  </h3>
                  <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="mb-1 text-xs text-slate-500">
                        Masuk {formatAttendanceTime(item.checkInAt)}
                      </p>
                      <LocationBadge status={item.locationInStatus} />
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-slate-500">
                        Pulang {formatAttendanceTime(item.checkOutAt)}
                      </p>
                      {item.checkOutAt ? (
                        <LocationBadge status={item.locationOutStatus ?? 'UNVERIFIED'} />
                      ) : (
                        'Belum dicatat'
                      )}
                    </div>
                  </div>
                </article>
              ))}
              {!history.length && (
                <p className="py-8 text-center text-sm text-slate-500">
                  Belum ada riwayat presensi.
                </p>
              )}
            </div>
            <table className="hidden w-full min-w-[540px] text-left text-sm md:table">
              <thead className="border-b text-xs text-slate-500">
                <tr>
                  <th className="pb-3">Tanggal</th>
                  <th>Masuk</th>
                  <th>Pulang</th>
                  <th>Lokasi masuk</th>
                  <th>Lokasi pulang</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 text-xs font-medium text-slate-700">
                      {formatAttendanceDate(item.date)}
                    </td>
                    <td>{formatAttendanceTime(item.checkInAt)}</td>
                    <td>{formatAttendanceTime(item.checkOutAt)}</td>
                    <td>
                      <LocationBadge status={item.locationInStatus} />
                    </td>
                    <td>
                      {item.checkOutAt ? (
                        <LocationBadge status={item.locationOutStatus ?? 'UNVERIFIED'} />
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
                {!history.length && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      Belum ada riwayat presensi.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
