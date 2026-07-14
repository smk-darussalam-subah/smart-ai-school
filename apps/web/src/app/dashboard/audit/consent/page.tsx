// =============================================================================
// Consent Status — Admin view of PDP consent compliance (R-05)
// Shows which users have/haven't accepted the LoA.
// =============================================================================

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import LoadError from '@/components/LoadError';
import type { Metadata } from 'next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CURRENT_CONSENT_VERSION } from '@/lib/constants';

export const metadata: Metadata = { title: 'Status Persetujuan PDP' };

interface ConsentEntry {
  id: string;
  fullName: string;
  email: string;
  role: string;
  consentAt: string | null;
  consentVersion: string | null;
  createdAt: string;
}

interface ConsentResponse {
  data: ConsentEntry[];
  total: number;
  limit: number;
  offset: number;
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  KEPALA_SEKOLAH: 'Kepala Sekolah',
  TATA_USAHA: 'Tata Usaha',
  GURU: 'Guru',
  SISWA: 'Siswa',
  ORANG_TUA: 'Orang Tua',
  INDUSTRI: 'Industri',
};

export default async function ConsentStatusPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const roles: string[] = await getEffectiveRoles(session);
  if (!roles.includes('SUPER_ADMIN') && !roles.includes('KEPALA_SEKOLAH')) {
    redirect('/dashboard');
  }

  const sp = await searchParams;
  const params = new URLSearchParams();
  if (sp.role) params.set('role', sp.role);
  if (sp.consentStatus) params.set('consentStatus', sp.consentStatus);
  params.set('limit', sp.limit ?? '20');
  params.set('offset', sp.offset ?? '0');

  const token = session.accessToken ?? '';
  const data = await apiFetch<ConsentResponse>(`/users/consent-status?${params.toString()}`, token);

  if (data === null) return <LoadError />;

  const given = data.data.filter((u) => u.consentAt !== null).length;
  const pending = data.data.filter((u) => u.consentAt === null).length;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Status Persetujuan PDP</h1>
        <p className="text-muted-foreground">
          Monitoring kepatuhan UU PDP — Versi LoA saat ini: <strong>v{CURRENT_CONSENT_VERSION}</strong>
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total User</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{data.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Sudah Setuju</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{given}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Belum Setuju</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">{pending}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <a href="?consentStatus=all" className={`px-3 py-1 rounded-full text-sm ${!sp.consentStatus || sp.consentStatus === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
          Semua
        </a>
        <a href="?consentStatus=given" className={`px-3 py-1 rounded-full text-sm ${sp.consentStatus === 'given' ? 'bg-green-600 text-white' : 'bg-muted'}`}>
          Sudah Setuju
        </a>
        <a href="?consentStatus=pending" className={`px-3 py-1 rounded-full text-sm ${sp.consentStatus === 'pending' ? 'bg-amber-600 text-white' : 'bg-muted'}`}>
          Belum Setuju
        </a>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium">Nama</th>
                  <th className="text-left py-2 px-3 font-medium">Role</th>
                  <th className="text-left py-2 px-3 font-medium">Email</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="text-left py-2 px-3 font-medium">Tanggal Setuju</th>
                  <th className="text-left py-2 px-3 font-medium">Versi</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((user) => (
                  <tr key={user.id} className="border-b hover:bg-muted/50">
                    <td className="py-2 px-3 font-medium">{user.fullName}</td>
                    <td className="py-2 px-3">
                      <Badge variant="outline">{ROLE_LABELS[user.role] ?? user.role}</Badge>
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">{user.email}</td>
                    <td className="py-2 px-3">
                      {user.consentAt ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Setuju</Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pending</Badge>
                      )}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {user.consentAt ? new Date(user.consentAt).toLocaleDateString('id-ID') : '—'}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {user.consentVersion ?? '—'}
                    </td>
                  </tr>
                ))}
                {data.data.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      Tidak ada data user.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
