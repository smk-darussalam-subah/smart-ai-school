'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import ViewAsSwitcher from './ViewAsSwitcher';
import { can } from '@/lib/permissions';

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
// Menu navigasi — difilter berdasarkan role + permission
// =============================================================================
interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles?: string[]; // undefined = semua role
  permissions?: string[]; // undefined = tidak perlu permission khusus
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Beranda', href: '/dashboard', icon: '🏠' },
  { label: 'Dasbor Eksekutif', href: '/dashboard/executive', icon: '📊', roles: ['KEPALA_SEKOLAH', 'SUPER_ADMIN'], permissions: ['finance.read'] },
  { label: 'Akademik', href: '/dashboard/akademik', icon: '📚', roles: ['GURU', 'SISWA', 'KEPALA_SEKOLAH', 'SUPER_ADMIN'], permissions: ['academic.grade.read'] },
  { label: 'Data Siswa', href: '/dashboard/siswa', icon: '🎓', roles: ['GURU', 'KEPALA_SEKOLAH', 'SUPER_ADMIN', 'TATA_USAHA'], permissions: ['student.read'] },
  { label: 'PPDB', href: '/dashboard/ppdb', icon: '📋', roles: ['KEPALA_SEKOLAH', 'SUPER_ADMIN', 'TATA_USAHA'], permissions: ['ppdb.read'] },
  { label: 'Keuangan', href: '/dashboard/keuangan', icon: '💰', roles: ['KEPALA_SEKOLAH', 'SUPER_ADMIN', 'TATA_USAHA', 'SISWA', 'ORANG_TUA'], permissions: ['finance.read', 'finance.own.read', 'finance.child.read'] },
  { label: 'Nilai & Absensi', href: '/dashboard/nilai', icon: '📊', roles: ['SISWA', 'ORANG_TUA'], permissions: ['grade.own.read', 'grade.child.read'] },
  { label: 'Lowongan', href: '/dashboard/lowongan', icon: '💼', roles: ['INDUSTRI', 'SISWA'], permissions: ['student.read', 'ai.chat'] },
  { label: 'Jadwal', href: '/dashboard/jadwal', icon: '📅', roles: ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA'], permissions: ['academic.schedule.read'] },
  { label: 'Kegiatan Kelas', href: '/dashboard/kegiatan', icon: '🎒', roles: ['GURU', 'SISWA', 'ORANG_TUA', 'KEPALA_SEKOLAH', 'SUPER_ADMIN', 'TATA_USAHA'], permissions: ['activity.read'] },
  { label: 'Rapor', href: '/dashboard/rapor', icon: '🎓', roles: ['SISWA', 'ORANG_TUA', 'KEPALA_SEKOLAH', 'SUPER_ADMIN', 'TATA_USAHA', 'GURU'], permissions: ['report.read'] },
  { label: 'RPP', href: '/dashboard/rpp', icon: '📄', roles: ['GURU', 'KEPALA_SEKOLAH', 'SUPER_ADMIN'], permissions: ['rpp.read'] },
  { label: 'Presensi Guru', href: '/dashboard/presensi-guru', icon: '📍', roles: ['GURU', 'SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA'], permissions: ['teacher.attendance.read'] },
  { label: 'Pengumuman', href: '/dashboard/pengumuman', icon: '📢', permissions: ['announcement.read'] },
  { label: 'Basis Pengetahuan', href: '/dashboard/knowledge', icon: '🧠', roles: ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA'], permissions: ['ai.knowledge.read'] },
  { label: 'Asisten AI', href: '/dashboard/ai', icon: '🤖', permissions: ['ai.chat'] },
  { label: 'Manajemen Pengguna', href: '/dashboard/users', icon: '👥', roles: ['SUPER_ADMIN', 'TATA_USAHA'], permissions: ['user.read'] },
  { label: 'Kesehatan Sistem', href: '/dashboard/health', icon: '🩺', roles: ['SUPER_ADMIN'], permissions: ['audit.read'] },
  { label: 'Audit Log', href: '/dashboard/audit', icon: '🛡', roles: ['SUPER_ADMIN'], permissions: ['audit.read'] },
];

// =============================================================================
// Sidebar Component
// =============================================================================
export function Sidebar({ viewAs = null, permissions = [], className }: { viewAs?: string | null; permissions?: string[]; className?: string }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const realRoles: string[] = (session?.roles as string[]) ?? [];
  // Mode tinjau: sempitkan tampilan ke role terpilih (server sudah validasi cookie)
  const roles: string[] = viewAs && realRoles.includes(viewAs) ? [viewAs] : realRoles;

  const primaryRole = roles[0] ?? '';
  const roleLabel = ROLE_LABELS[primaryRole] ?? primaryRole;
  const roleBadgeColor = ROLE_COLORS[primaryRole] ?? 'bg-gray-100 text-gray-700';

  const visibleItems = NAV_ITEMS.filter((item) => {
    // Filter berdasarkan role
    if (item.roles && !item.roles.some((r) => roles.includes(r))) {
      return false;
    }
    // Filter berdasarkan permission
    if (item.permissions && !can(permissions, item.permissions)) {
      return false;
    }
    return true;
  });

  return (
    <aside className={clsx("flex flex-col w-64 min-h-screen bg-white border-r border-gray-100 shadow-sm", className)}>
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-100">
        <div className="w-9 h-9 bg-smk-blue rounded-lg flex items-center justify-center shrink-0">
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

      {/* Navigasi */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-50 text-smk-blue'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
              )}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Keluar */}
      <div className="px-3 py-4 border-t border-gray-100">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <span className="text-base">🚪</span>
          Keluar
        </button>
      </div>
    </aside>
  );
}
