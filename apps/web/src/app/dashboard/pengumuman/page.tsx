import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { resolveDashboardAuthority } from '@/lib/dashboard-authority';
import PengumumanList, { Announcement } from './_components/PengumumanList';

interface ListResponse {
  data: Announcement[];
  total: number;
  page: number;
  limit: number;
}

const LIMIT = 20;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));

export default async function PengumumanPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const token = session.accessToken ?? '';
  const authority = await resolveDashboardAuthority(session);
  const canManage = authority.can('announcement.manage');
  const canDelete = authority.can('announcement.delete');

  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const search = one(sp.search).slice(0, 100);
  const category = one(sp.category);
  const status = one(sp.status);
  const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (search) qs.set('search', search);
  if (['umum', 'akademik', 'keuangan', 'kegiatan', 'darurat'].includes(category)) qs.set('category', category);
  if (canManage && ['draft', 'published', 'archived'].includes(status)) qs.set('status', status);

  const res = await apiFetch<ListResponse>(`/announcements?${qs.toString()}`, token);
  const announcements = res?.data ?? [];
  const total = res?.total ?? 0;

  return (
    <PengumumanList
      announcements={announcements}
      total={total}
      page={page}
      limit={LIMIT}
      filters={{
        search,
        category: ['umum', 'akademik', 'keuangan', 'kegiatan', 'darurat'].includes(category) ? category : 'all',
        status: ['draft', 'published', 'archived'].includes(status) ? status : 'all',
      }}
      canManage={canManage}
      canDelete={canDelete}
    />
  );
}
