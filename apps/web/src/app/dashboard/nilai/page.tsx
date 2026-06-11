// =============================================================================
// Portal Nilai & Absensi — /dashboard/nilai
//
// Roles: SISWA (nilai + absensi diri sendiri)
//        ORANG_TUA (nilai + absensi anak; jika >1 anak tampilkan pemilih)
//
// Ownership ditegakkan di API (NestJS GradeService + AttendanceService).
// Halaman ini cukup fetch dengan token user; API menolak akses data lain.
//
// Data diambil di server (Server Component) → dikirim ke PortalNilaiClient
// untuk child-selector interaktif (state client-side, tidak perlu URL param
// karena tidak ada navigasi antar halaman dari selector ini).
// =============================================================================

import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import {
  apiFetch,
  type GradeItem,
  type AttendanceItem,
  type PaginatedResponse,
} from '@/lib/api';
import { PortalNilaiClient } from './_components/PortalNilaiClient';

export const metadata: Metadata = { title: 'Nilai & Absensi' };

// Paksa dynamic rendering — data nilai harus selalu fresh, tidak di-cache
export const dynamic = 'force-dynamic';

// ── Error states ─────────────────────────────────────────────────────────────

function AccessDenied() {
  return (
    <div className="card text-center py-12">
      <p className="text-4xl mb-4" role="img" aria-label="Dilarang">🔒</p>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Akses Tidak Diizinkan</h2>
      <p className="text-sm text-gray-500">
        Halaman ini hanya untuk siswa dan orang tua.
      </p>
    </div>
  );
}

function FetchError() {
  return (
    <div className="card text-center py-12">
      <p className="text-4xl mb-4" role="img" aria-label="Error">⚠️</p>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Gagal Memuat Data</h2>
      <p className="text-sm text-gray-500">
        Tidak dapat terhubung ke server. Coba muat ulang halaman.
      </p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function NilaiPage() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) redirect('/login');

  const roles: string[] = await getEffectiveRoles(session);
  const isSiswa    = roles.includes('SISWA');
  const isOrangTua = roles.includes('ORANG_TUA');

  // Hanya SISWA dan ORANG_TUA yang boleh akses halaman ini
  if (!isSiswa && !isOrangTua) {
    return <AccessDenied />;
  }

  // Fetch paralel — API menerapkan ownership otomatis berdasarkan token
  const [gradesRes, attendanceRes] = await Promise.all([
    apiFetch<PaginatedResponse<GradeItem>>('/grades', session.accessToken, {
      limit: '200',
    }),
    apiFetch<PaginatedResponse<AttendanceItem>>('/attendance', session.accessToken, {
      limit: '500',
    }),
  ]);

  if (!gradesRes && !attendanceRes) {
    return <FetchError />;
  }

  const grades     = gradesRes?.data     ?? [];
  const attendance = attendanceRes?.data ?? [];

  // Hitung rata-rata nilai untuk header (jika ada data)
  const avgScore =
    grades.length > 0
      ? (
          grades.reduce((sum, g) => sum + parseFloat(g.score), 0) / grades.length
        ).toFixed(1)
      : null;

  const firstName = session.user?.name?.split(' ')[0] ?? 'Anda';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nilai & Absensi</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isSiswa
              ? `Rekap nilai dan kehadiran ${firstName}`
              : 'Rekap nilai dan kehadiran putra/putri Anda'}
          </p>
        </div>
        {avgScore && (
          <div className="card py-3 px-4 flex items-center gap-2 self-start sm:self-auto">
            <span className="text-2xl" role="img" aria-label="Bintang">⭐</span>
            <div>
              <p className="text-xs text-gray-400">Rata-rata nilai</p>
              <p className="text-xl font-bold text-gray-900 leading-tight">{avgScore}</p>
            </div>
          </div>
        )}
      </div>

      {/* Content — interactive client component */}
      <PortalNilaiClient
        grades={grades}
        attendance={attendance}
        isOrangTua={isOrangTua}
      />
    </div>
  );
}
