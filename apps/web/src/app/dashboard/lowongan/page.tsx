import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { BriefcaseBusiness, Clock3 } from 'lucide-react';

export default async function LowonganPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const roles: string[] = await getEffectiveRoles(session);
  if (!roles.some(r => ['INDUSTRI', 'SISWA', 'SUPER_ADMIN'].includes(r))) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><BriefcaseBusiness className="h-6 w-6 text-orange-700" aria-hidden="true" />Bursa Kerja Khusus (BKK) & PKL</h1>
        <p className="text-gray-500 text-sm mt-1">
          Pusat informasi lowongan kerja, rekrutmen mitra, dan penempatan PKL/Prakerin
        </p>
      </div>

      <section aria-labelledby="lowongan-status" className="border-y border-gray-200 py-10">
          <div className="mx-auto max-w-lg text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100 text-orange-800">
              <Clock3 className="h-8 w-8" aria-hidden="true" />
            </div>
            <h2 id="lowongan-status" className="mb-2 text-lg font-semibold text-gray-900">Belum tersedia untuk operasional</h2>
            <p className="mb-6 text-sm leading-6 text-gray-600">
              DIIS belum menyediakan alur lowongan, rekrutmen, atau penempatan PKL yang dapat digunakan. Rancangan fitur belum dianggap sebagai layanan aktif.
            </p>
            <p className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm leading-6 text-orange-950">
              Belum ada aksi operasional pada modul ini. Data siswa tidak dibuka melalui halaman Industri.
            </p>
          </div>
      </section>
    </div>
  );
}
