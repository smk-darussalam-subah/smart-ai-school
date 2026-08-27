import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  HeartPulse,
  Landmark,
  MonitorCog,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { PapanRow } from './PapanPembelajaran';
import { classSessionStatusMeta } from '@/lib/class-session-status';

interface HomeStats {
  totalSiswa: number | null;
  totalKelas: number | null;
  kehadiranHariIni: number | null;
  ppdbLeads: number | null;
  rppMenunggu: number | null;
}

interface AgendaItem {
  id: string;
  name: string;
  date: string;
  endDate?: string;
}

interface SessionItem {
  id: string;
  className: string;
  subject: string;
  room: string | null;
  scheduledStartAt: string;
  scheduledEndAt: string;
  status: string;
  canStart?: boolean;
  canComplete?: boolean;
}

export interface RoleBasedHomeProps {
  firstName: string;
  roles: string[];
  permissions: string[];
  periodLabel: string | null;
  stats?: HomeStats;
  scheduleRows: PapanRow[];
  agenda: AgendaItem[];
  sessions: SessionItem[];
  monitoringSummary?: { active: number; late: number; missed: number } | null;
  dataAvailability: { schedule: boolean; agenda: boolean; sessions: boolean };
  generatedAt: string;
}

interface QuickLink {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

const POSITION_LABELS: Record<string, string> = {
  KEPALA_SEKOLAH: 'Kepala Sekolah',
  WAKA_KURIKULUM: 'Waka Kurikulum',
  WAKA_KESISWAAN: 'Waka Kesiswaan',
  WAKA_HUMAS: 'Waka Humas',
  WAKA_SARPRAS: 'Waka Sarpras',
  KEPALA_TU: 'Kepala Tata Usaha',
  KAPROG: 'Kepala Program Keahlian',
  KOOR_BKK: 'Koordinator BKK',
  KOOR_HUBIN: 'Koordinator Hubin',
  GURU_BK: 'Guru BK',
  BENDAHARA: 'Bendahara',
  STAF_KEPEGAWAIAN: 'Staf Kepegawaian',
  OPERATOR_DAPODIK: 'Operator Dapodik',
};

const IDENTITY_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  TATA_USAHA: 'Tata Usaha',
  GURU: 'Guru',
  SISWA: 'Siswa',
  ORANG_TUA: 'Orang Tua',
  INDUSTRI: 'Mitra Industri',
};

function includesAny(values: string[], expected: string[]) {
  return expected.some((item) => values.includes(item));
}

function buildQuickLinks(roles: string[], permissions: string[]): QuickLink[] {
  const can = (permission: string) => permissions.includes('*') || permissions.includes(permission);
  const links: QuickLink[] = [];
  const add = (item: QuickLink) => {
    if (!links.some((link) => link.href === item.href) && links.length < 6) links.push(item);
  };

  if (includesAny(roles, ['SUPER_ADMIN', 'KEPALA_SEKOLAH']) || can('operational.monitoring.read')) {
    add({
      href: '/dashboard/monitoring',
      label: 'Monitoring operasional',
      description: 'Sesi, alert, dan kesehatan display',
      icon: MonitorCog,
    });
  }
  if (includesAny(roles, ['SUPER_ADMIN', 'KEPALA_SEKOLAH'])) {
    add({
      href: '/dashboard/executive',
      label: 'Dasbor eksekutif',
      description: 'Analitik sekolah dan risiko',
      icon: Landmark,
    });
  }
  if (can('academic.schedule.read')) {
    add({
      href: '/dashboard/jadwal',
      label: 'Jadwal',
      description: 'Jadwal dan sesi pembelajaran',
      icon: CalendarDays,
    });
  }
  if (can('academic.teaching.read') || can('academic.grade.read')) {
    add({
      href: '/dashboard/akademik',
      label: 'Akademik',
      description: 'Pembelajaran, nilai, dan tindak lanjut',
      icon: BookOpen,
    });
  }
  if (can('student.read')) {
    add({
      href: '/dashboard/siswa',
      label: 'Data siswa',
      description: 'Registry dan kesiapan data',
      icon: Users,
    });
  }
  if (can('ppdb.read')) {
    add({
      href: '/dashboard/ppdb',
      label: 'PPDB',
      description: 'Pipeline calon siswa',
      icon: GraduationCap,
    });
  }
  if (can('finance.read')) {
    add({
      href: '/dashboard/keuangan',
      label: 'Keuangan',
      description: 'SPP dan bukti pembayaran',
      icon: Wallet,
    });
  }
  if (can('teacher.attendance.read')) {
    add({
      href: '/dashboard/presensi-guru',
      label: 'Presensi guru',
      description: 'Kehadiran dan catatan lokasi',
      icon: ClipboardCheck,
    });
  }
  if (can('audit.read')) {
    add({
      href: '/dashboard/health',
      label: 'Kesehatan sistem',
      description: 'Layanan dan recovery',
      icon: HeartPulse,
    });
  }
  if (roles.includes('INDUSTRI')) {
    add({
      href: '/dashboard/lowongan',
      label: 'Lowongan',
      description: 'Ruang kerja sama masih disiapkan',
      icon: BriefcaseBusiness,
    });
  }
  return links;
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${value}T00:00:00+07:00`));
}

export default function RoleBasedHome({
  firstName,
  roles,
  permissions,
  periodLabel,
  stats,
  scheduleRows,
  agenda,
  sessions,
  monitoringSummary,
  dataAvailability,
  generatedAt,
}: RoleBasedHomeProps) {
  const identity = roles.find((role) => IDENTITY_LABELS[role]);
  const positions = roles.filter((role) => POSITION_LABELS[role]);
  const quickLinks = buildQuickLinks(roles, permissions);
  const actionSessions = sessions.filter((session) => session.canStart || session.canComplete);
  const canMonitor = quickLinks.some((link) => link.href === '/dashboard/monitoring');

  return (
    <div className="mx-auto max-w-7xl space-y-8" data-help-anchor="beranda-role-aware">
      <header className="border-b border-slate-200 pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-800">Hari kerja DIIS</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">
              Selamat datang, {firstName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Fokus pada pekerjaan yang perlu diselesaikan hari ini. Data dan tindakan mengikuti
              kewenangan aktif Anda.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {identity && (
              <span className="rounded-md bg-slate-900 px-2.5 py-1.5 font-semibold text-white">
                {IDENTITY_LABELS[identity]}
              </span>
            )}
            {positions.map((position) => (
              <span
                key={position}
                className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 font-semibold text-emerald-900"
              >
                {POSITION_LABELS[position]}
              </span>
            ))}
            <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700">
              {periodLabel ?? 'Periode aktif belum tersedia'}
            </span>
          </div>
        </div>
      </header>

      <section aria-labelledby="hari-ini-heading">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 id="hari-ini-heading" className="text-lg font-bold text-slate-950">
              Hari ini
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Sesi dan agenda berdasarkan periode sekolah aktif.
            </p>
          </div>
          <p className="text-xs text-slate-500">Diperbarui {timeLabel(generatedAt)} WIB</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="grid grid-cols-[80px_minmax(0,1fr)_120px] border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase text-slate-500">
              <span>Waktu</span>
              <span>Kelas dan mapel</span>
              <span>Status</span>
            </div>
            {!dataAvailability.sessions ? (
              <div role="alert" className="p-5 text-sm leading-6 text-amber-900">
                Sesi hari ini belum dapat dimuat. Muat ulang halaman sebelum mengambil tindakan.
              </div>
            ) : sessions.length > 0 ? (
              sessions.slice(0, 6).map((session) => {
                const statusMeta = classSessionStatusMeta(session.status);
                return <article
                  key={session.id}
                  className="grid grid-cols-[80px_minmax(0,1fr)_120px] items-center border-b border-slate-100 px-4 py-3 last:border-b-0"
                >
                  <span className="text-sm font-semibold text-slate-700">
                    {timeLabel(session.scheduledStartAt)}
                  </span>
                  <div className="min-w-0 pr-3">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {session.className} · {session.subject}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {session.room || 'Ruang belum ditetapkan'} · hingga{' '}
                      {timeLabel(session.scheduledEndAt)}
                    </p>
                  </div>
                  <span className={`justify-self-start rounded-md px-2 py-1 text-xs font-semibold ${statusMeta.className}`}>
                    {statusMeta.label}
                  </span>
                </article>
              })
            ) : !dataAvailability.schedule ? (
              <div role="alert" className="p-5 text-sm leading-6 text-amber-900">
                Jadwal belum dapat diverifikasi. Data gagal tidak ditampilkan sebagai sesi kosong.
              </div>
            ) : scheduleRows.length > 0 ? (
              <div className="p-5 text-sm text-slate-600">
                Jadwal tersedia. Sesi harian sedang disiapkan dari jadwal dan Bell Schedule aktif.
              </div>
            ) : (
              <div className="p-5 text-sm text-slate-600">
                Tidak ada sesi terjadwal untuk konteks Anda hari ini.
              </div>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-bold text-slate-900">Agenda terdekat</h3>
            <div className="mt-3 space-y-3">
              {!dataAvailability.agenda ? (
                <p role="alert" className="text-sm leading-6 text-amber-900">
                  Agenda belum dapat dimuat untuk periode aktif. Muat ulang halaman.
                </p>
              ) : agenda.length > 0 ? (
                agenda.slice(0, 4).map((item) => (
                  <article
                    key={item.id}
                    className="flex gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0"
                  >
                    <time className="w-12 shrink-0 text-xs font-semibold text-emerald-800">
                      {dateLabel(item.date)}
                    </time>
                    <p className="text-sm leading-5 text-slate-700">{item.name}</p>
                  </article>
                ))
              ) : (
                <p className="text-sm text-slate-500">Belum ada agenda pada periode aktif.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="actions-heading">
        <div className="mb-3">
          <h2 id="actions-heading" className="text-lg font-bold text-slate-950">
            Perlu tindakan
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Hanya pekerjaan yang dapat Anda tindak lanjuti.
          </p>
        </div>
        <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {actionSessions.length > 0 ? (
            actionSessions.map((session) => (
              <article
                key={session.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    {session.className} · {session.subject}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {session.canComplete
                      ? 'Sesi sedang berjalan dan perlu diselesaikan.'
                      : 'Sesi berada dalam jendela mulai yang sah.'}
                  </p>
                </div>
                <Link
                  href="/dashboard/jadwal"
                  className="inline-flex min-h-11 items-center gap-2 self-start rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                >
                  Buka jadwal <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </article>
            ))
          ) : monitoringSummary &&
            (monitoringSummary.late > 0 || monitoringSummary.missed > 0) &&
            canMonitor ? (
            <article className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-950">
                  {monitoringSummary.late + monitoringSummary.missed} sesi membutuhkan perhatian
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Tinjau keterlambatan dan sesi terlewat pada Monitoring Operasional.
                </p>
              </div>
              <Link
                href="/dashboard/monitoring"
                className="inline-flex min-h-11 items-center gap-2 self-start rounded-md bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
              >
                Tinjau monitoring <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </article>
          ) : (
            <p className="px-4 py-5 text-sm text-slate-600">
              Tidak ada pekerjaan mendesak yang terdeteksi untuk kewenangan Anda.
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="quick-heading">
        <h2 id="quick-heading" className="text-lg font-bold text-slate-950">
          Akses cepat
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="group flex min-h-24 items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-blue-300 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700 group-hover:bg-blue-100 group-hover:text-blue-800">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-slate-950">{link.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    {link.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="summary-heading">
        <div className="flex items-center justify-between gap-4">
          <h2 id="summary-heading" className="text-lg font-bold text-slate-950">
            Ringkasan
          </h2>
          {canMonitor && (
            <Link
              href="/dashboard/monitoring"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              Lihat sumber operasional <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:grid-cols-4">
          {[
            ['Siswa aktif', stats?.totalSiswa],
            ['Rombel aktif', stats?.totalKelas],
            [
              'Kehadiran hari ini',
              stats?.kehadiranHariIni == null ? null : `${stats.kehadiranHariIni}%`,
            ],
            ['Pipeline PPDB', stats?.ppdbLeads],
          ].map(([label, value]) => (
            <article key={String(label)} className="bg-white p-4">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-950">{value ?? '—'}</p>
            </article>
          ))}
        </div>
        {roles.includes('INDUSTRI') && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>
              Workflow lowongan dan kemitraan belum lengkap. DIIS tidak akan menampilkan metrik atau
              tindakan yang belum memiliki proses backend resmi.
            </p>
          </div>
        )}
      </section>

      <footer className="flex items-center gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500">
        <Activity className="h-4 w-4" aria-hidden="true" />
        Ringkasan ini mengikuti data, Appointment, dan permission aktif pada saat halaman dimuat.
      </footer>
    </div>
  );
}
