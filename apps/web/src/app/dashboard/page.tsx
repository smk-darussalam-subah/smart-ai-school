import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import type { Metadata } from 'next';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/card';
import Link from 'next/link';
import type { HeatmapData } from './_components/AttendanceHeatmap';
import HeatmapInteractive from './_components/HeatmapInteractive';

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
    <Card className="p-6 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-400 font-medium mb-0.5">{label}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </Card>
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
  if (role === 'SUPER_ADMIN' || role === 'KEPALA_SEKOLAH' || role === 'TATA_USAHA') {
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
    const g = adminStats; // dipakai ulang sebagai kontainer angka guru
    const fmt = (v: number | null | undefined, suffix = '') =>
      v === null || v === undefined ? '—' : `${v}${suffix}`;
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
        <StatCard icon="📚" label="Jam Mengajar / Minggu" value={fmt(g?.totalSiswa, ' jp')} sub="Dari penugasan aktif" color="bg-blue-50" />
        <StatCard icon="🏫" label="Kelas Diampu" value={fmt(g?.totalKelas)} sub="Kelas berbeda" color="bg-purple-50" />
        <StatCard icon="📄" label="RPP Saya" value={fmt(g?.rppMenunggu)} sub="Menunggu review" color="bg-yellow-50" />
        <StatCard icon="📍" label="Presensi Hari Ini" value={g?.kehadiranHariIni === 1 ? '✓ Masuk' : 'Belum'} sub="Cek di Presensi Guru" color="bg-green-50" />
      </div>
    );
  }

  // SISWA/ORANG_TUA: tanpa angka palsu — kartu navigasi jujur ke modulnya
  if (role === 'SISWA' || role === 'ORANG_TUA') {
    const links = [
      { icon: '📊', label: 'Nilai & Absensi', href: '/dashboard/nilai', desc: role === 'SISWA' ? 'Nilai dan kehadiran Anda' : 'Perkembangan putra/putri Anda' },
      { icon: '💰', label: 'Keuangan SPP', href: '/dashboard/keuangan', desc: 'Status pembayaran SPP' },
      { icon: '📢', label: 'Pengumuman', href: '/dashboard/pengumuman', desc: 'Informasi terbaru sekolah' },
      { icon: '📅', label: 'Jadwal Pelajaran', href: '/dashboard/jadwal', desc: 'Jadwal mingguan kelas' },
    ];
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="block group">
            <Card className="p-6 flex items-start gap-4 group-hover:shadow-md transition-shadow">
              <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-xl shrink-0">{l.icon}</div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{l.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{l.desc}</p>
              </div>
            </Card>
          </Link>
        ))}
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
  const roles: string[] = await getEffectiveRoles(session);
  const primaryRole = roles[0] ?? '';
  const greeting = ROLE_GREETING[primaryRole] ?? 'Selamat datang di DIIS.';
  const firstName = session?.user?.name?.split(' ')[0] ?? 'Pengguna';

  // Data nyata untuk staf (SA/KS/TU) — gagal fetch ⇒ tampil '—', halaman tetap hidup
  const isStaf = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA'].some((r) => roles.includes(r));
  const isGuruOnly = !isStaf && roles.includes('GURU');
  let adminStats: AdminStats | undefined;
  let heatmap: HeatmapData | null = null;
  if (isGuruOnly) {
    const token = session?.accessToken ?? '';
    const [assignments, rpp, today] = await Promise.all([
      apiFetch<{ data: { hoursPerWeek: number; class: { id: string } }[] }>('/teaching-assignments?limit=200', token),
      apiFetch<{ total: number }>('/rpp?status=submitted&limit=1', token),
      apiFetch<{ record: unknown | null }>('/teacher-attendance/today', token),
    ]);
    const rows = assignments?.data ?? [];
    adminStats = {
      totalSiswa: rows.length > 0 ? rows.reduce((a, r) => a + (r.hoursPerWeek ?? 0), 0) : null, // jp/minggu
      totalKelas: rows.length > 0 ? new Set(rows.map((r) => r.class.id)).size : null,
      kehadiranHariIni: today ? (today.record ? 1 : 0) : null, // 1 = sudah check-in
      kehadiranDelta: null,
      ppdbLeads: null,
      rppMenunggu: rpp?.total ?? null,
    };
  }
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

      {/* Heatmap kehadiran (staf) — interaktif: klik sel → panel detail */}
      {heatmap && (
        <div className="mt-6">
          <HeatmapInteractive data={heatmap} />
        </div>
      )}

      {/* Status Sistem — hanya SA, dari /health NYATA (bukan indikator palsu) */}
      {roles.includes('SUPER_ADMIN') && <SystemStatus token={session?.accessToken ?? ''} />}
    </div>
  );
}

// =============================================================================
// SystemStatus — indikator dari GET /health NYATA (SA saja); gagal = merah jujur
// =============================================================================
async function SystemStatus({ token }: { token: string }) {
  const health = await apiFetch<{ status?: string; info?: Record<string, { status?: string }> }>(
    '/health', token,
  );
  const apiUp = health?.status === 'ok';
  const items = [
    { label: 'API Backend', up: apiUp },
    { label: 'Database', up: apiUp && (health?.info?.['database']?.status ?? 'up') !== 'down' },
  ];
  return (
    <Card className="mt-6 p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-700">📡 Status Sistem</h2>
        <a href="/dashboard/health" className="text-xs text-smk-blue hover:underline">Detail →</a>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        {items.map((i) => (
          <span key={i.label} className={`flex items-center gap-1.5 ${i.up ? 'text-green-600' : 'text-red-600'}`}>
            <span className={`w-2 h-2 rounded-full inline-block ${i.up ? 'bg-green-500' : 'bg-red-500'}`} />
            {i.label}{!i.up && ' (gangguan)'}
          </span>
        ))}
      </div>
    </Card>
  );
}
