import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function LowonganPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const roles: string[] = (session?.roles as string[]) ?? [];
  if (!roles.some(r => ['INDUSTRI', 'SISWA', 'SUPER_ADMIN'].includes(r))) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">💼 Lowongan & BKK</h1>
      <Card>
        <CardHeader><CardTitle>Bursa Kerja Khusus</CardTitle></CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Modul lowongan kerja dan BKK akan tersedia di tahap selanjutnya.
            Fitur ini mencakup informasi lowongan dari mitra industri, rekrutmen, dan penempatan PKL/Prakerin.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
