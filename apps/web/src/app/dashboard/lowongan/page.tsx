import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';

export default async function LowonganPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const roles: string[] = await getEffectiveRoles(session);
  if (!roles.some(r => ['INDUSTRI', 'SISWA', 'SUPER_ADMIN'].includes(r))) redirect('/dashboard');

  const isIndustri = roles.includes('INDUSTRI');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">💼 Bursa Kerja Khusus (BKK) & PKL</h1>
        <p className="text-gray-500 text-sm mt-1">
          Pusat informasi lowongan kerja, rekrutmen mitra, dan penempatan PKL/Prakerin
        </p>
      </div>

      {/* Empty State — Honest: modul belum dibangun */}
      <Card className="border-2 border-dashed border-gray-200 bg-gray-50/50">
        <CardContent className="pt-6">
          <div className="text-center max-w-lg mx-auto py-4">
            <div className="w-16 h-16 rounded-2xl bg-orange-100 flex items-center justify-center text-3xl mx-auto mb-4">
              🏗️
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Modul dalam Pengembangan</h2>
            <p className="text-sm text-gray-500 leading-relaxed mb-4">
              Fitur Bursa Kerja Khusus (BKK) dan manajemen PKL/Prakerin sedang dalam tahap perencanaan.
              Fitur ini akan mencakup:
            </p>
            <ul className="text-sm text-gray-500 text-left space-y-2 mb-6 inline-block">
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                <span>Lowongan kerja dari mitra industri terverifikasi</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                <span>Rekrutmen dan pelamaran terintegrasi</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                <span>Penempatan PKL/Prakerin dengan pemantauan</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                <span>Penilaian industri dan laporan kemajuan siswa</span>
              </li>
            </ul>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {isIndustri && (
                <Link
                  href="/dashboard/pengumuman"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  📢 Hubungi Koordinator BKK
                </Link>
              )}
              <Link
                href="/dashboard/siswa"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                👥 Lihat Data Siswa
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
