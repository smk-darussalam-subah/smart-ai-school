'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  createOnlineUsersPollingController,
  type OnlineUsersPollingStatus,
} from './online-users-polling';

export interface OnlineUser {
  id: string;
  fullName: string;
  role: string;
  email: string;
  lastSeenAt: string;
  avatarUrl: string | null;
}
export interface OnlineResponse {
  users: OnlineUser[];
  threshold: number;
}

const ROLE_ORDER = [
  'SUPER_ADMIN',
  'KEPALA_SEKOLAH',
  'TATA_USAHA',
  'GURU',
  'SISWA',
  'ORANG_TUA',
  'INDUSTRI',
];
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

function relativeTime(value: string): string {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'Baru saja';
  if (seconds < 120) return '1 menit lalu';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} menit lalu`;
  if (seconds < 7200) return '1 jam lalu';
  return `${Math.floor(seconds / 3600)} jam lalu`;
}

export default function OnlineUsersClient({
  initialData,
  threshold,
  roleFilter,
}: {
  initialData: OnlineResponse;
  threshold: number;
  roleFilter: string;
}) {
  const [data, setData] = useState(initialData);
  const [status, setStatus] = useState<OnlineUsersPollingStatus>('idle');
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());
  const initialUpdatedAt = useRef(updatedAt);
  const controller = useMemo(
    () =>
      createOnlineUsersPollingController<OnlineResponse>({
        fetchData: async (signal) => {
          const params = new URLSearchParams({ threshold: String(threshold) });
          if (roleFilter) params.set('role', roleFilter);
          const response = await fetch(`/api/backend/users/online?${params}`, {
            signal,
            cache: 'no-store',
          });
          if (!response.ok) throw new Error('refresh failed');
          return response.json() as Promise<OnlineResponse>;
        },
        onData: (next, time) => {
          setData(next);
          setUpdatedAt(time);
        },
        onStatus: setStatus,
      }),
    [roleFilter, threshold],
  );

  useEffect(() => {
    const receivedAt = Date.now();
    setData(initialData);
    setUpdatedAt(receivedAt);
    initialUpdatedAt.current = receivedAt;
  }, [initialData]);

  useEffect(() => {
    controller.start(initialUpdatedAt.current);
    const onVisibility = () => controller.setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      controller.stop();
    };
  }, [controller]);

  const grouped = data.users.reduce<Record<string, OnlineUser[]>>((result, user) => {
    if (!roleFilter || user.role === roleFilter) (result[user.role] ??= []).push(user);
    return result;
  }, {});
  const sortedRoles = Object.keys(grouped).sort(
    (a, b) =>
      (ROLE_ORDER.indexOf(a) < 0 ? 99 : ROLE_ORDER.indexOf(a)) -
      (ROLE_ORDER.indexOf(b) < 0 ? 99 : ROLE_ORDER.indexOf(b)),
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">User Online</h1>
          <p className="text-muted-foreground">
            User aktif dalam {threshold} detik terakhir · {data.users.length} user online
          </p>
          <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
            {status === 'error'
              ? 'Pembaruan gagal. Data terakhir tetap ditampilkan.'
              : status === 'refreshing'
                ? 'Memperbarui data…'
                : `Diperbarui ${new Date(updatedAt).toLocaleTimeString('id-ID')}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={() => void controller.refresh()}
            disabled={status === 'refreshing'}
            title="Perbarui data"
          >
            <RefreshCw className={`h-4 w-4 ${status === 'refreshing' ? 'animate-spin' : ''}`} />
            <span className="sr-only">Perbarui data</span>
          </Button>
          {[60, 120, 300].map((seconds) => (
            <Link
              key={seconds}
              href={`?threshold=${seconds}${roleFilter ? `&role=${roleFilter}` : ''}`}
              className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm ${threshold === seconds ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
            >
              {seconds / 60} menit
            </Link>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`?threshold=${threshold}`}
          className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm ${!roleFilter ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
        >
          Semua Role
        </Link>
        {ROLE_ORDER.map((role) => (
          <Link
            key={role}
            href={`?threshold=${threshold}&role=${role}`}
            className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm ${roleFilter === role ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
          >
            {ROLE_LABELS[role] ?? role}
          </Link>
        ))}
      </div>
      {sortedRoles.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Tidak ada user yang sedang online saat ini.
          </CardContent>
        </Card>
      )}
      {sortedRoles.map((role) => (
        <Card key={role}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Badge className={ROLE_COLORS[role] ?? 'bg-muted'}>{ROLE_LABELS[role] ?? role}</Badge>
              <span className="text-sm font-normal text-muted-foreground">
                {grouped[role]!.length} user
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid gap-2">
              {grouped[role]!.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt="" className="h-8 w-8 object-cover" />
                      ) : (
                        user.fullName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{user.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <span
                    className="ml-3 shrink-0 text-xs text-muted-foreground"
                    title={new Date(user.lastSeenAt).toLocaleString('id-ID')}
                  >
                    {relativeTime(user.lastSeenAt)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
