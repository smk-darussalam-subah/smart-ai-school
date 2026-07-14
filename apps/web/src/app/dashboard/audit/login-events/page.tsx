// =============================================================================
// Login Events — Admin audit trail for authentication events
// Shows who logged in, when, from where (IP, User-Agent).
// =============================================================================

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import LoadError from '@/components/LoadError';
import type { Metadata } from 'next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Login Events' };

interface LoginEventEntry {
  id: string;
  userId: string;
  userRole: string;
  userName: string;
  ipAddress: string | null;
  userAgent: string | null;
  eventType: string;
  createdAt: string;
}

interface LoginEventsResponse {
  data: LoginEventEntry[];
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

export default async function LoginEventsPage({
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
  if (sp.eventType) params.set('eventType', sp.eventType);
  if (sp.role) params.set('role', sp.role);
  if (sp.from) params.set('from', sp.from);
  if (sp.to) params.set('to', sp.to);
  params.set('limit', sp.limit ?? '20');
  params.set('offset', sp.offset ?? '0');

  const token = session.accessToken ?? '';
  const data = await apiFetch<LoginEventsResponse>(`/users/login-events?${params.toString()}`, token);

  if (data === null) return <LoadError />;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Login Events</h1>
        <p className="text-muted-foreground">Audit trail aktivitas login/logout pengguna sistem.</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <a href="?" className={`px-3 py-1 rounded-full text-sm ${!sp.eventType ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
          Semua
        </a>
        <a href="?eventType=login" className={`px-3 py-1 rounded-full text-sm ${sp.eventType === 'login' ? 'bg-green-600 text-white' : 'bg-muted'}`}>
          Login
        </a>
        <a href="?eventType=logout" className={`px-3 py-1 rounded-full text-sm ${sp.eventType === 'logout' ? 'bg-blue-600 text-white' : 'bg-muted'}`}>
          Logout
        </a>
        <a href="?eventType=failed" className={`px-3 py-1 rounded-full text-sm ${sp.eventType === 'failed' ? 'bg-red-600 text-white' : 'bg-muted'}`}>
          Gagal
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
                  <th className="text-left py-2 px-3 font-medium">Event</th>
                  <th className="text-left py-2 px-3 font-medium">IP Address</th>
                  <th className="text-left py-2 px-3 font-medium">Waktu</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((event) => (
                  <tr key={event.id} className="border-b hover:bg-muted/50">
                    <td className="py-2 px-3 font-medium">{event.userName}</td>
                    <td className="py-2 px-3">
                      <Badge variant="outline">{ROLE_LABELS[event.userRole] ?? event.userRole}</Badge>
                    </td>
                    <td className="py-2 px-3">
                      <Badge
                        className={
                          event.eventType === 'login'
                            ? 'bg-green-100 text-green-800 hover:bg-green-100'
                            : event.eventType === 'logout'
                              ? 'bg-blue-100 text-blue-800 hover:bg-blue-100'
                              : 'bg-red-100 text-red-800 hover:bg-red-100'
                        }
                      >
                        {event.eventType}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-muted-foreground font-mono text-xs">
                      {event.ipAddress ?? '—'}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))}
                {data.data.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      Belum ada event login tercatat.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination info */}
          {data.total > 0 && (
            <div className="flex justify-between items-center mt-4 text-sm text-muted-foreground">
              <span>Menampilkan {data.offset + 1}–{Math.min(data.offset + data.limit, data.total)} dari {data.total}</span>
              <div className="flex gap-2">
                {data.offset > 0 && (
                  <a href={`?offset=${Math.max(0, data.offset - data.limit)}&limit=${data.limit}`} className="px-3 py-1 bg-muted rounded hover:bg-muted/80">
                    Sebelumnya
                  </a>
                )}
                {data.offset + data.limit < data.total && (
                  <a href={`?offset=${data.offset + data.limit}&limit=${data.limit}`} className="px-3 py-1 bg-muted rounded hover:bg-muted/80">
                    Berikutnya
                  </a>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
