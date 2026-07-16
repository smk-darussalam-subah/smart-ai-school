import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch, PaginatedResponse } from '@/lib/api';
import LoadError from '@/components/LoadError';
import PpdbTable from './_components/PpdbTable';

interface Lead {
  id: string; fullName: string; phone: string; schoolOrigin: string | null;
  interestMajor: string | null; source: string; status: string; notes: string | null;
  assignedTo: string | null; createdAt: string;
  enrollmentRequired?: boolean;
  enrollmentAction?: { href: string; label: string };
}

export default async function PpdbPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const roles: string[] = await getEffectiveRoles(session);

  if (roles.includes('GURU')) redirect('/dashboard');

  const canEdit = roles.includes('SUPER_ADMIN') || roles.includes('TATA_USAHA');
  const token = session.accessToken ?? '';
  const data = await apiFetch<PaginatedResponse<Lead>>('/ppdb/leads?limit=200', token);
  if (data === null) return <LoadError />;
  const leads = data?.data ?? [];
  const total = data?.total ?? 0;

  return <PpdbTable leads={leads} total={total} canEdit={canEdit} />;
}
