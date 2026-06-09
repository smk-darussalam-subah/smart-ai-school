import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { apiFetch, PaginatedResponse } from '@/lib/api';
import PpdbTable from './_components/PpdbTable';

interface Lead {
  id: string; fullName: string; phone: string; schoolOrigin: string | null;
  interestMajor: string | null; source: string; status: string; notes: string | null;
  assignedTo: string | null; createdAt: string;
}

export default async function PpdbPage() {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken ?? '';
  const roles: string[] = (session?.roles as string[]) ?? [];
  const canEdit = roles.includes('SUPER_ADMIN') || roles.includes('TATA_USAHA');

  const data = await apiFetch<PaginatedResponse<Lead>>('/ppdb/leads?limit=200', token);
  const leads = data?.data ?? [];
  const total = data?.total ?? 0;

  return <PpdbTable leads={leads} total={total} canEdit={canEdit} />;
}
