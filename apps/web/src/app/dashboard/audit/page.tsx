import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import type { Metadata } from 'next';
import AuditClient from './_components/AuditClient';

export const metadata: Metadata = { title: 'Audit Log' };

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  statusCode: number;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface AuditResponse {
  data: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const roles: string[] = await getEffectiveRoles(session);
  if (!roles.includes('SUPER_ADMIN')) redirect('/dashboard');

  const sp = await searchParams;
  const params = new URLSearchParams();
  if (sp.actorId)      params.set('actorId', sp.actorId);
  if (sp.resourceType) params.set('resourceType', sp.resourceType);
  if (sp.action)       params.set('action', sp.action);
  if (sp.from)         params.set('from', sp.from);
  if (sp.to)           params.set('to', sp.to);
  if (sp.statusCode)   params.set('statusCode', sp.statusCode);
  params.set('limit', sp.limit ?? '20');
  params.set('offset', sp.offset ?? '0');

  const token = session.accessToken ?? '';
  const data = await apiFetch<AuditResponse>(`/audit-logs?${params.toString()}`, token);

  return (
    <AuditClient
      entries={data?.data ?? []}
      total={data?.total ?? 0}
      limit={Number(sp.limit ?? 20)}
      offset={Number(sp.offset ?? 0)}
      filters={{
        actorId:      sp.actorId ?? '',
        resourceType: sp.resourceType ?? '',
        action:       sp.action ?? '',
        from:         sp.from ?? '',
        to:           sp.to ?? '',
        statusCode:   sp.statusCode ?? '',
      }}
    />
  );
}
