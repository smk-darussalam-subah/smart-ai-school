// =============================================================================
// lib/permissions.ts — Utilitas pengecekan permission di sisi klien.
//
// Digunakan oleh Sidebar (filter navigasi), halaman (guard tampilan),
// dan komponen (toggle aksi berdasarkan permission).
//
// SUPER_ADMIN mendapatkan wildcard '*' dari backend sehingga can() selalu true.
// =============================================================================

interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles?: string[];
  permissions?: string[];
}

// ── Permission mapping per rute sidebar ──────────────────────────────────────

const ROUTE_PERMISSIONS: Record<string, string[]> = {
  '/dashboard': [], // semua role
  '/dashboard/executive': ['finance.read'],
  '/dashboard/akademik': ['academic.grade.read'],
  '/dashboard/siswa': ['student.read'],
  '/dashboard/ppdb': ['ppdb.read'],
  '/dashboard/keuangan': ['finance.read'],
  '/dashboard/nilai': ['grade.own.read', 'grade.child.read'],
  '/dashboard/lowongan': ['student.read'],
  '/dashboard/jadwal': ['academic.schedule.read'],
  '/dashboard/kegiatan': ['activity.read'],
  '/dashboard/rapor': ['report.read'],
  '/dashboard/rpp': ['rpp.read'],
  '/dashboard/presensi-guru': ['teacher.attendance.read'],
  '/dashboard/pengumuman': ['announcement.read'],
  '/dashboard/knowledge': ['ai.knowledge.read'],
  '/dashboard/ai': ['ai.chat'],
  '/dashboard/users': ['user.read'],
  '/dashboard/kelas': ['academic.teaching.read'],
  '/dashboard/health': ['audit.read'],
};

// ── Fungsi utilitas ───────────────────────────────────────────────────────────

/**
 * Cek apakah user memiliki minimal satu dari permission yang disyaratkan.
 * SUPER_ADMIN ( memiliki '*' ) selalu lolos.
 */
export function can(userPermissions: string[], required: string | string[]): boolean {
  if (userPermissions.includes('*')) return true;
  const requiredArr = Array.isArray(required) ? required : [required];
  return requiredArr.some((p) => userPermissions.includes(p));
}

/**
 * Cek apakah user memiliki SEMUA permission yang disyaratkan.
 */
export function canAll(userPermissions: string[], required: string[]): boolean {
  if (userPermissions.includes('*')) return true;
  return required.every((p) => userPermissions.includes(p));
}

/**
 * Filter daftar item navigasi berdasarkan role DAN permission.
 * Item tanpa roles/permissions dianggap terbuka untuk semua user.
 */
export function filterNavByRoleAndPermission(
  items: NavItem[],
  roles: string[],
  userPermissions: string[],
): NavItem[] {
  return items.filter((item) => {
    // Cek role (bila ada batasan)
    if (item.roles && !item.roles.some((r) => roles.includes(r))) {
      return false;
    }
    // Cek permission (bila ada batasan)
    if (item.permissions && !can(userPermissions, item.permissions)) {
      return false;
    }
    return true;
  });
}

/**
 * Dapatkan daftar permission yang disyaratkan oleh suatu rute.
 * Mengembalikan array kosong bila rute tidak terdaftar (terbuka untuk semua).
 */
export function getRoutePermissions(href: string): string[] {
  return ROUTE_PERMISSIONS[href] ?? [];
}

export type { NavItem };
