import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch, PaginatedResponse } from '@/lib/api';
import LoadError from '@/components/LoadError';
import PpdbTable from './_components/PpdbTable';
import { PPDB_LEADS_PAGE_LIMIT, ppdbLeadsListPath } from './ppdb-query';

interface Lead {
  id: string; fullName: string; phone: string; schoolOrigin: string | null;
  interestMajor: string | null; source: string; status: string; notes: string | null;
  assignedTo: string | null; createdAt: string;
  enrollmentRequired?: boolean;
  enrollmentAction?: { href: string; label: string };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));

export default async function PpdbPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const roles: string[] = await getEffectiveRoles(session);

  if (roles.includes('GURU')) redirect('/dashboard');

  const canEdit = roles.includes('SUPER_ADMIN') || roles.includes('TATA_USAHA');
  const token = session.accessToken ?? '';
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const status = one(sp.status);
  const search = one(sp.search).slice(0, 100);
  const data = await apiFetch<PaginatedResponse<Lead>>(
    ppdbLeadsListPath({ page, limit: PPDB_LEADS_PAGE_LIMIT, status, search }),
    token,
  );
  if (data === null) return <LoadError />;
  const leads = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <PpdbTable
      leads={leads}
      total={total}
      canEdit={canEdit}
      query={{ page, limit: PPDB_LEADS_PAGE_LIMIT, status, search }}
    />
  );
}
