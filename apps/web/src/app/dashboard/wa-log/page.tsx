import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import type { Metadata } from 'next';
import WaLogClient from './_components/WaLogClient';

export const metadata: Metadata = { title: 'Log Notifikasi WA' };

export interface WaLogEntry {
  id: string;
  studentId: string | null;
  parentId: string | null;
  recipient: string;
  message: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  eventType: string | null;
  notificationLogId: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
}

interface WaLogResponse {
  data: WaLogEntry[];
  total: number;
  page: number;
  limit: number;
}

export default async function WaLogPage({
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
  if (sp.status)    params.set('status', sp.status);
  if (sp.studentId) params.set('studentId', sp.studentId);
  params.set('page', sp.page ?? '1');
  params.set('limit', sp.limit ?? '20');

  const token = session.accessToken ?? '';
  const data = await apiFetch<WaLogResponse>(`/wa-log?${params.toString()}`, token);

  return (
    <WaLogClient
      entries={data?.data ?? []}
      total={data?.total ?? 0}
      page={Number(sp.page ?? 1)}
      limit={Number(sp.limit ?? 20)}
      filters={{
        eventType: sp.eventType ?? '',
        status:    sp.status ?? '',
        studentId: sp.studentId ?? '',
      }}
    />
  );
}
