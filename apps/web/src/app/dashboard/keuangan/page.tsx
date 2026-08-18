import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveDashboardAuthority } from '@/lib/dashboard-authority';
import { redirect } from 'next/navigation';
import { apiFetch, PaginatedResponse } from '@/lib/api';
import LoadError from '@/components/LoadError';
import KeuanganTable from './_components/KeuanganTable';
import { buildFinanceSppQuery, canApproveSpp, canRecordSpp } from './keuangan-ui';

interface SppPayment {
  id: string; month: number; year: number;
  amount: string; status: string;
  paidAt: string | null; receiptNo: string | null;
  approvedAt: string | null;
  student: { id: string; nis: string; user: { fullName: string } };
}

interface ClassOption {
  id: string;
  name: string;
}

const LIMIT = 10;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));

export default async function KeuanganPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const token = session?.accessToken ?? '';
  const authority = await resolveDashboardAuthority(session);

  if (authority.hasRole('INDUSTRI')) redirect('/dashboard');

  const canRecord = canRecordSpp(authority);
  const canApprove = canApproveSpp(authority);
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const search = one(sp.search).slice(0, 100);
  const status = one(sp.status);
  const month = one(sp.month);
  const year = one(sp.year);
  const classId = one(sp.classId);
  const qs = buildFinanceSppQuery({ page, limit: LIMIT, search, status, month, year, classId });

  const [data, classData] = await Promise.all([
    apiFetch<PaginatedResponse<SppPayment>>(`/finance/spp?${qs.toString()}`, token),
    apiFetch<PaginatedResponse<ClassOption>>('/classes?limit=200', token),
  ]);
  if (data === null) return <LoadError />;
  const payments = data?.data ?? [];
  const total = data?.total ?? 0;
  const classes = classData?.data ?? [];

  return (
    <KeuanganTable
      payments={payments}
      total={total}
      page={page}
      limit={LIMIT}
      filters={{ search, status: ['paid', 'unpaid', 'late', 'waived'].includes(status) ? status : 'all', month, year, classId }}
      classes={classes}
      canRecord={canRecord}
      canApprove={canApprove}
    />
  );
}
