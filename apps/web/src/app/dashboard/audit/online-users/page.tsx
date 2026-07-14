// =============================================================================
// Online Users — Real-time "Who Is Online" admin dashboard.
// Shows users with recent heartbeat (lastSeenAt within threshold).
// Auto-refreshes every 30s via meta refresh.
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

export const metadata: Metadata = { title: 'User Online' };

interface OnlineUser {
  id: string;
  fullName: string;
  role: string;
  email: string;
  lastSeenAt: string;
  avatarUrl: string | null;
}

interface OnlineResponse {
  users: OnlineUser[];
  threshold: number;
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

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'bg-red-100 text-red-800 hover:bg-red-100',
  KEPALA_SEKOLAH: 'bg-purple-100 text-purple-800 hover:bg-purple-100',
  TATA_USAHA: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  GURU: 'bg-green-100 text-green-800 hover:bg-green-100',
  SISWA: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  ORANG_TUA: 'bg-cyan-100 text-cyan-800 hover:bg-cyan-100',
  INDUSTRI: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return 'Baru saja';
  if (diffSec < 120) return '1 menit lalu';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} menit lalu`;
  if (diffSec < 7200) return '1 jam lalu';
  return `${Math.floor(diffSec / 3600)} jam lalu`;
}

export default async function OnlineUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const roles: string[] = await getEffectiveRoles(session);
  if (!roles.includes('SUPER_ADMIN') && !roles.includes('KEPALA_SEKOLAH') && !roles.includes('TATA_USAHA')) {
    redirect('/dashboard');
  }

  const sp = await searchParams;
  const threshold = Number(sp.threshold) || 120;
  const roleFilter = sp.role ?? '';

  const token = session.accessToken ?? '';
  const params = new URLSearchParams();
  params.set('threshold', String(threshold));
  if (roleFilter) params.set('role', roleFilter);

  const data = await apiFetch<OnlineResponse>(`/users/online?${params.toString()}`, token);
  if (data === null) return <LoadError />;

  // Group by role
  const grouped: Record<string, OnlineUser[]> = {};
  for (const u of data.users) {
    if (roleFilter && u.role !== roleFilter) continue;
    const key = u.role;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(u);
  }

  const roleOrder = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA', 'INDUSTRI'];
  const sortedRoles = Object.keys(grouped).sort(
    (a, b) => (roleOrder.indexOf(a) === -1 ? 99 : roleOrder.indexOf(a)) - (roleOrder.indexOf(b) === -1 ? 99 : roleOrder.indexOf(b)),
  );

  return (
    <div className="space-y-6 p-6">
      {/* Auto-refresh every 30 seconds */}
      <meta httpEquiv="refresh" content="30" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Online</h1>
          <p className="text-muted-foreground">
            User aktif dalam {threshold} detik terakhir — {data.users.length} user online
          </p>
        </div>
        <div className="flex gap-2">
          <a href="?threshold=60" className={`px-3 py-1 rounded-full text-sm ${threshold === 60 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
            1 menit
          </a>
          <a href="?threshold=120" className={`px-3 py-1 rounded-full text-sm ${threshold === 120 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
            2 menit
          </a>
          <a href="?threshold=300" className={`px-3 py-1 rounded-full text-sm ${threshold === 300 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
            5 menit
          </a>
        </div>
      </div>

      {/* Role filter */}
      <div className="flex gap-2 flex-wrap">
        <a href={`?threshold=${threshold}`} className={`px-3 py-1 rounded-full text-sm ${!roleFilter ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
          Semua Role
        </a>
        {roleOrder.map((r) => (
          <a
            key={r}
            href={`?threshold=${threshold}&role=${r}`}
            className={`px-3 py-1 rounded-full text-sm ${roleFilter === r ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
          >
            {ROLE_LABELS[r] ?? r}
          </a>
        ))}
      </div>

      {/* Grouped results */}
      {sortedRoles.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Tidak ada user yang sedang online saat ini.
          </CardContent>
        </Card>
      )}

      {sortedRoles.map((role) => {
        const users = grouped[role]!;
        return (
        <Card key={role}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Badge className={ROLE_COLORS[role] ?? 'bg-muted'}>
                {ROLE_LABELS[role] ?? role}
              </Badge>
              <span className="text-muted-foreground text-sm font-normal">
                {users.length} user
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid gap-2">
              {users.map((user) => (
                <div key={user.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        user.fullName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{user.fullName}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground" title={new Date(user.lastSeenAt).toLocaleString('id-ID')}>
                    {relativeTime(user.lastSeenAt)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        );
      })}
    </div>
  );
}
