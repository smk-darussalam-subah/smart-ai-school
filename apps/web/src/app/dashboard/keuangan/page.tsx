import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch, PaginatedResponse } from '@/lib/api';
import LoadError from '@/components/LoadError';
import KeuanganTable from './_components/KeuanganTable';

interface SppPayment {
  id: string; month: number; year: number;
  amount: string; status: string;
  paidAt: string | null; receiptNo: string | null;
  approvedAt: string | null;
  student: { id: string; nis: string; user: { fullName: string } };
}

export default async function KeuanganPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const token = session?.accessToken ?? '';
  const roles: string[] = await getEffectiveRoles(session);

  if (roles.includes('INDUSTRI')) redirect('/dashboard');

  const canRecord = roles.includes('SUPER_ADMIN') || roles.includes('TATA_USAHA');
  const canApprove = roles.includes('SUPER_ADMIN') || roles.includes('KEPALA_SEKOLAH');
  const data = await apiFetch<PaginatedResponse<SppPayment>>('/finance/spp?limit=100', token);
  if (data === null) return <LoadError />;
  const payments = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <KeuanganTable
      payments={payments}
      total={total}
      canRecord={canRecord}
      canApprove={canApprove}
    />
  );
}
