import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import type { Metadata } from 'next';
import { apiFetch } from '@/lib/api';
import AttendanceHeatmap, { HeatmapData } from './_components/AttendanceHeatmap';

export const metadata: Metadata = { title: 'Dashboard' };

// =============================================================================
// Stat Card (server component)
// =============================================================================
function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="card flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-400 font-medium mb-0.5">{label}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// =============================================================================
// Role greeting copy
// =============================================================================
const ROLE_GREETING: Record<string, string> = {
  SUPER_ADMIN: 'Selamat datang, Admin. Sistem berjalan normal. ✅',
  KEPALA_SEKOLAH: 'Selamat datang, Bapak/Ibu Kepala Sekolah. Berikut ringkasan hari ini.',
  GURU: 'Selamat datang! Berikut jadwal dan data kelas Anda hari ini.',
  SISWA: 'Halo! Semangat belajar hari ini ya 🎓',
  ORANG_TUA: 'Selamat datang. Berikut perkembangan putra/putri Anda.',
  INDUSTRI: 'Selamat datang, Mitra Industri. Berikut profil siswa tersedia.',
};

// =============================================================================
// Placeholder stats per role
// =============================================================================
interface AdminStats {
  totalSiswa: number | null;
  totalKelas: number | null;
  kehadiranHariIni: number | null;
  kehadiranDelta: number | null;
  ppdbLeads: number | null;
  rppMenunggu: number | null;
}

function RoleStats({ role, adminStats }: { role: string; adminStats?: AdminStats }) {
  if (role === 'SUPER_ADMIN' || role === 'KEPALA_SEKOLAH') {
    const st = adminStats;
    const fmt = (v: number | null | undefined, suffix = '') =>
      v === null || v === undefined ? '—' : `${v}${suffix}`;
    const deltaSub =
      st?.kehadiranDelta === null || st?.kehadiranDelta === undefined
        ? 'vs kemarin: —'
        : `vs kemarin: ${st.kehadiranDelta >= 0 ? '+' : ''}${st.kehadiranDelta.toFixed(1)}%`;
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
        <StatCard icon="👥" label="Total Siswa" value={fmt(st?.totalSiswa)} sub="Terdaftar aktif" color="bg-blue-50" />
        <StatCard icon="🏫" label="Rombel Aktif" value={fmt(st?.totalKelas)} sub="Kelas X, XI, XII" color="bg-purple-50" />
        <StatCard icon="✅" label="Kehadiran Hari Ini" value={fmt(st?.kehadiranHariIni, '%')} sub={deltaSub} color="bg-green-50" />
        <StatCard icon="📋" label="Pendaftar PPDB" value={fmt(st?.ppdbLeads)} sub="Total leads" color="bg-orange-50" />
        <StatCard icon="📄" label="RPP Menunggu" value={fmt(st?.rppMenunggu)} sub="Perlu direview" color="bg-yellow-50" />
      </div>
    );
  }

  if (role === 'GURU') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        <StatCard icon="📚" label="Jam Mengajar" value="24 jp" sub="Minggu ini" color="bg-blue-50" />
        <StatCard icon="👨‍🎓" label="Siswa Dibimbing" value="156" sub="3 kelas" color="bg-green-50" />
        <StatCard icon="📝" label="Tugas Belum Dinilai" value="12" sub="Perlu segera" color="bg-yellow-50" />
      </div>
    );
  }

  if (role === 'SISWA') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        <StatCard icon="📊" label="Rata-rata Nilai" value="82.4" sub="Semester ini" color="bg-blue-50" />
        <StatCard icon="✅" label="Kehadiran" value="94%" sub="Bulan ini" color="bg-green-50" />
        <StatCard icon="📝" label="Tugas Pending" value="3" sub="Harus dikumpulkan" color="bg-red-50" />
      </div>
    );
  }

  return null;
}

// =============================================================================
// Dashboard Page
// =============================================================================
export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const roles: string[] = (session?.roles as string[]) ?? [];
  const primaryRole = roles[0] ?? '';
  const greeting = ROLE_GREETING[primaryRole] ?? 'Selamat datang di DIIS.';
  const firstName = session?.user?.name?.split(' ')[0] ?? 'Pengguna';

  // Data nyata untuk staf (SA/KS/TU) — gagal fetch ⇒ tampil '—', halaman tetap hidup
  const isStaf = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA'].some((r) => roles.includes(r));
  let adminStats: AdminStats | undefined;
  let heatmap: HeatmapData | null = null;
  if (isStaf) {
    const token = session?.accessToken ?? '';
    const isReviewer = ['SUPER_ADMIN', 'KEPALA_SEKOLAH'].some((r) => roles.includes(r));
    const [students, classes, hm, ppdb, rpp] = await Promise.all([
      apiFetch<{ total: number }>('/students?limit=1', token),
      apiFetch<{ total: number }>('/classes?limit=1', token),
      apiFetch<HeatmapData>('/attendance/heatmap?days=10', token),
      apiFetch<{ total?: number; data?: { total?: number } }>('/ppdb/stats', token),
      isReviewer
        ? apiFetch<{ total: number }>('/rpp?status=submitted&limit=1', token)
        : Promise.resolve(null),
    ]);
    heatmap = hm ?? null;
    const ppdbTotal =
      typeof ppdb?.total === 'number'
        ? ppdb.total
        : typeof ppdb?.data?.total === 'number'
          ? ppdb.data.total
          : null;
    const today = hm?.overall?.today?.pct ?? null;
    const yest = hm?.overall?.yesterday?.pct ?? null;
    adminStats = {
      totalSiswa: students?.total ?? null,
      totalKelas: classes?.total ?? null,
      kehadiranHariIni: today,
      kehadiranDelta: today !== null && yest !== null ? Math.round((today - yest) * 10) / 10 : null,
      ppdbLeads: ppdbTotal,
      rppMenunggu: rpp?.total ?? null,
    };
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Halo, {firstName}! 👋
        </h1>
        <p className="text-gray-500 mt-1">{greeting}</p>
      </div>

      {/* Stats */}
      <RoleStats role={primaryRole} adminStats={adminStats} />

      {/* Heatmap kehadiran (staf) */}
      {heatmap && (
        <div className="mt-6">
          <AttendanceHeatmap data={heatmap} />
        </div>
      )}

      {/* Quick info */}
      <div className="mt-6 card">
        <h2 className="font-semibold text-gray-700 mb-3">📡 Status Sistem</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="flex items-center gap-1.5 text-green-600">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            API Backend
          </span>
          <span className="flex items-center gap-1.5 text-green-600">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            Database
          </span>
          <span className="flex items-center gap-1.5 text-green-600">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            Keycloak SSO
          </span>
          <span className="flex items-center gap-1.5 text-yellow-600">
            <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
            AI Engine (setup)
          </span>
        </div>
      </div>
    </div>
  );
}
