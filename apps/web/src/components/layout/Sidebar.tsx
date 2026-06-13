'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import ViewAsSwitcher from './ViewAsSwitcher';
import { can } from '@/lib/permissions';
import {
  Home, BarChart3, BookOpen, CalendarDays, ClipboardCheck, GraduationCap,
  Backpack, FileText, Users, ClipboardList, Wallet, Briefcase, MapPin,
  Megaphone, Sparkles, Brain, UserCog, Activity, ShieldCheck, LogOut,
  type LucideIcon,
} from 'lucide-react';

// =============================================================================
// Role → Label mapping
// =============================================================================
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  KEPALA_SEKOLAH: 'Kepala Sekolah',
  TATA_USAHA: 'Tata Usaha',
  GURU: 'Guru',
  SISWA: 'Siswa',
  ORANG_TUA: 'Orang Tua',
  INDUSTRI: 'Industri',
};

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'bg-red-100 text-red-700',
  KEPALA_SEKOLAH: 'bg-purple-100 text-purple-700',
  TATA_USAHA: 'bg-teal-100 text-teal-700',
  GURU: 'bg-blue-100 text-blue-700',
  SISWA: 'bg-green-100 text-green-700',
  ORANG_TUA: 'bg-yellow-100 text-yellow-700',
  INDUSTRI: 'bg-orange-100 text-orange-700',
};

// =============================================================================
// Navigasi — dikelompokkan (2L). Role & permission DIPERTAHANKAN persis dari
// versi lama (tidak mengubah otorisasi). Item tanpa visible → group ikut hilang.
// =============================================================================
interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles?: string[];
  permissions?: string[];
}
interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Ringkasan',
    items: [
      { label: 'Beranda', href: '/dashboard', icon: Home },
      { label: 'Dasbor Eksekutif', href: '/dashboard/executive', icon: BarChart3, roles: ['KEPALA_SEKOLAH', 'SUPER_ADMIN'], permissions: ['finance.read'] },
    ],
  },
  {
    title: 'Akademik',
    items: [
      { label: 'Akademik', href: '/dashboard/akademik', icon: BookOpen, roles: ['GURU', 'SISWA', 'KEPALA_SEKOLAH', 'SUPER_ADMIN'], permissions: ['academic.grade.read'] },
      { label: 'Jadwal', href: '/dashboard/jadwal', icon: CalendarDays, roles: ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA'], permissions: ['academic.schedule.read'] },
      { label: 'Nilai & Absensi', href: '/dashboard/nilai', icon: ClipboardCheck, roles: ['SISWA', 'ORANG_TUA'], permissions: ['grade.own.read', 'grade.child.read'] },
      { label: 'Rapor', href: '/dashboard/rapor', icon: GraduationCap, roles: ['SISWA', 'ORANG_TUA', 'KEPALA_SEKOLAH', 'SUPER_ADMIN', 'TATA_USAHA', 'GURU'], permissions: ['report.read'] },
      { label: 'Kegiatan Kelas', href: '/dashboard/kegiatan', icon: Backpack, roles: ['GURU', 'SISWA', 'ORANG_TUA', 'KEPALA_SEKOLAH', 'SUPER_ADMIN', 'TATA_USAHA'], permissions: ['activity.read'] },
      { label: 'RPP', href: '/dashboard/rpp', icon: FileText, roles: ['GURU', 'KEPALA_SEKOLAH', 'SUPER_ADMIN'], permissions: ['rpp.read'] },
    ],
  },
  {
    title: 'Kesiswaan',
    items: [
      { label: 'Data Siswa', href: '/dashboard/siswa', icon: Users, roles: ['GURU', 'KEPALA_SEKOLAH', 'SUPER_ADMIN', 'TATA_USAHA'], permissions: ['student.read'] },
      { label: 'PPDB', href: '/dashboard/ppdb', icon: ClipboardList, roles: ['KEPALA_SEKOLAH', 'SUPER_ADMIN', 'TATA_USAHA'], permissions: ['ppdb.read'] },
      { label: 'Lowongan', href: '/dashboard/lowongan', icon: Briefcase, roles: ['INDUSTRI', 'SISWA'], permissions: ['student.read', 'ai.chat'] },
    ],
  },
  {
    title: 'Keuangan',
    items: [
      { label: 'Keuangan', href: '/dashboard/keuangan', icon: Wallet, roles: ['KEPALA_SEKOLAH', 'SUPER_ADMIN', 'TATA_USAHA', 'SISWA', 'ORANG_TUA'], permissions: ['finance.read', 'finance.own.read', 'finance.child.read'] },
    ],
  },
  {
    title: 'Guru',
    items: [
      { label: 'Presensi Guru', href: '/dashboard/presensi-guru', icon: MapPin, roles: ['GURU', 'SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA'], permissions: ['teacher.attendance.read'] },
    ],
  },
  {
    title: 'Komunikasi',
    items: [
      { label: 'Pengumuman', href: '/dashboard/pengumuman', icon: Megaphone, permissions: ['announcement.read'] },
      { label: 'Asisten AI', href: '/dashboard/ai', icon: Sparkles, permissions: ['ai.chat'] },
      { label: 'Basis Pengetahuan', href: '/dashboard/knowledge', icon: Brain, roles: ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA'], permissions: ['ai.knowledge.read'] },
    ],
  },
  {
    title: 'Administrasi Sistem',
    items: [
      { label: 'Manajemen Pengguna', href: '/dashboard/users', icon: UserCog, roles: ['SUPER_ADMIN', 'TATA_USAHA'], permissions: ['user.read'] },
      { label: 'Kesehatan Sistem', href: '/dashboard/health', icon: Activity, roles: ['SUPER_ADMIN'], permissions: ['audit.read'] },
      { label: 'Audit Log', href: '/dashboard/audit', icon: ShieldCheck, roles: ['SUPER_ADMIN'], permissions: ['audit.read'] },
    ],
  },
];

// =============================================================================
// Sidebar Component
// =============================================================================
export function Sidebar({ viewAs = null, permissions = [], permError = false, className }: { viewAs?: string | null; permissions?: string[]; permError?: boolean; className?: string }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const realRoles: string[] = (session?.roles as string[]) ?? [];
  // Mode tinjau: sempitkan tampilan ke role terpilih (server sudah validasi cookie)
  const roles: string[] = viewAs && realRoles.includes(viewAs) ? [viewAs] : realRoles;

  const primaryRole = roles[0] ?? '';
  const roleLabel = ROLE_LABELS[primaryRole] ?? primaryRole;
  const roleBadgeColor = ROLE_COLORS[primaryRole] ?? 'bg-gray-100 text-gray-700';

  // Kontrak izin: SUPER_ADMIN = wildcard '*' (lih. lib/permissions.can + auth.service.getMe).
  // Jaga wildcard secara LOKAL agar menu SA tidak hilang walau /auth/me sempat gagal/seed tertinggal.
  const isSuperAdmin = roles.includes('SUPER_ADMIN');
  const effectivePermissions = isSuperAdmin ? ['*'] : permissions;

  const isVisible = (item: NavItem): boolean => {
    if (item.roles && !item.roles.some((r) => roles.includes(r))) return false;
    // Mode terbatas (permError = /auth/me gagal): lewati gate izin, andalkan filter role saja —
    // RBAC backend tetap menegakkan akses di setiap request, jadi ini aman dan mencegah menu kosong.
    if (!permError && item.permissions && !can(effectivePermissions, item.permissions)) return false;
    return true;
  };

  const visibleGroups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter(isVisible) }))
    .filter((g) => g.items.length > 0);

  const isItemActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

  return (
    <aside className={clsx('flex flex-col w-64 min-h-screen bg-white border-r border-emerald-900/10 shadow-soft-sm', className)}>
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-gray-100">
        <div className="w-9 h-9 bg-smk-emerald-deep rounded-xl flex items-center justify-center shrink-0">
          <span className="text-white text-sm font-bold">D</span>
        </div>
        <div className="min-w-0">
          <p className="font-bold text-gray-900 text-sm leading-tight">DIIS</p>
          <p className="text-xs text-gray-400 truncate">SMK Darussalam Subah</p>
        </div>
      </div>

      {/* Info pengguna */}
      <div className="px-5 py-4 border-b border-gray-100">
        <p className="text-sm font-medium text-gray-800 truncate">{session?.user?.name ?? '—'}</p>
        <p className="text-xs text-gray-400 truncate mb-2">{session?.user?.email ?? ''}</p>
        <span className={clsx('badge', roleBadgeColor)}>
          {roleLabel}
          {viewAs ? ' · tinjau' : ''}
        </span>
        <div className="mt-3">
          <ViewAsSwitcher realRoles={realRoles} viewAs={viewAs} />
        </div>
      </div>

      {/* Navigasi (grup) */}
      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        {permError && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-700">
            Gagal memuat izin. Menu tampil <span className="font-semibold">mode terbatas</span> — coba muat ulang halaman.
          </div>
        )}
        {visibleGroups.map((group) => (
          <div key={group.title}>
            <p className="px-3 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              {group.title}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isItemActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      'relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      active
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-smk-emerald" />
                    )}
                    <Icon className="w-[18px] h-[18px] shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Keluar */}
      <div className="px-3 py-4 border-t border-gray-100">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          Keluar
        </button>
      </div>
    </aside>
  );
}
