'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

// =============================================================================
// Role → Label mapping
// =============================================================================
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  KEPALA_SEKOLAH: 'Kepala Sekolah',
  GURU: 'Guru',
  SISWA: 'Siswa',
  ORANG_TUA: 'Orang Tua',
  INDUSTRI: 'Industri',
};

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'bg-red-100 text-red-700',
  KEPALA_SEKOLAH: 'bg-purple-100 text-purple-700',
  GURU: 'bg-blue-100 text-blue-700',
  SISWA: 'bg-green-100 text-green-700',
  ORANG_TUA: 'bg-yellow-100 text-yellow-700',
  INDUSTRI: 'bg-orange-100 text-orange-700',
};

// =============================================================================
// Navigation menu — filtered by role visibility
// =============================================================================
interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles?: string[]; // undefined = all roles
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: '🏠' },
  { label: 'Dashboard Eksekutif', href: '/dashboard/executive', icon: '📊', roles: ['KEPALA_SEKOLAH', 'SUPER_ADMIN'] },
  { label: 'Akademik', href: '/dashboard/akademik', icon: '📚', roles: ['GURU', 'SISWA', 'KEPALA_SEKOLAH', 'SUPER_ADMIN'] },
  { label: 'Data Siswa', href: '/dashboard/siswa', icon: '🎓', roles: ['GURU', 'KEPALA_SEKOLAH', 'SUPER_ADMIN'] },
  { label: 'PPDB', href: '/dashboard/ppdb', icon: '📋', roles: ['KEPALA_SEKOLAH', 'SUPER_ADMIN'] },
  { label: 'Keuangan', href: '/dashboard/keuangan', icon: '💰', roles: ['KEPALA_SEKOLAH', 'SUPER_ADMIN'] },
  { label: 'Nilai & Absensi', href: '/dashboard/nilai', icon: '📊', roles: ['SISWA', 'ORANG_TUA'] },
  { label: 'Lowongan', href: '/dashboard/lowongan', icon: '💼', roles: ['INDUSTRI', 'SISWA'] },
  { label: 'Basis Pengetahuan', href: '/dashboard/knowledge', icon: '🧠', roles: ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA'] },
  { label: 'AI Asisten', href: '/dashboard/ai', icon: '🤖' },
  { label: 'Manajemen User', href: '/dashboard/users', icon: '👥', roles: ['SUPER_ADMIN'] },
  { label: 'System Health', href: '/dashboard/health', icon: '🩺', roles: ['SUPER_ADMIN'] },
];

// =============================================================================
// Sidebar Component
// =============================================================================
export function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const roles: string[] = (session?.roles as string[]) ?? [];

  const primaryRole = roles[0] ?? '';
  const roleLabel = ROLE_LABELS[primaryRole] ?? primaryRole;
  const roleBadgeColor = ROLE_COLORS[primaryRole] ?? 'bg-gray-100 text-gray-700';

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.some((r) => roles.includes(r)),
  );

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-white border-r border-gray-100 shadow-sm">
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

      {/* User info */}
      <div className="px-5 py-4 border-b border-gray-100">
        <p className="text-sm font-medium text-gray-800 truncate">{session?.user?.name ?? '—'}</p>
        <p className="text-xs text-gray-400 truncate mb-2">{session?.user?.email ?? ''}</p>
        <span className={clsx('badge', roleBadgeColor)}>{roleLabel}</span>
      </div>

      {/* Navigation */}
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

      {/* Logout */}
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
