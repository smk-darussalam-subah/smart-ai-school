import React from 'react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { resolveDashboardAuthority } from '@/lib/dashboard-authority';
import AcademicDataNotice from '../_components/AcademicDataNotice';
import RppBoard, { type RppItem } from './_components/RppBoard';

const PAGE_SIZE = 20;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

interface ListResponse { data: RppItem[]; total: number; page: number; limit: number }

export default async function RppPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const authority = await resolveDashboardAuthority(session);
  const canRead = authority.can('rpp.read') && authority.hasRole('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'KAPROG');
  if (!canRead) redirect('/dashboard/akademik');

  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const status = one(sp.status);
  const search = one(sp.search).trim().slice(0, 100);
  const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (status) query.set('status', status);
  if (search) query.set('search', search);

  const response = await apiFetch<ListResponse>(`/rpp?${query.toString()}`, session.accessToken ?? '');
  if (!response) return <AcademicDataNotice href="/dashboard/rpp" message="Antrean Review Modul Ajar belum dapat dimuat." />;

  return <RppBoard
    items={response.data}
    total={response.total}
    query={{ page, limit: PAGE_SIZE, status, search }}
    canCurriculumReview={authority.can('rpp.curriculum.review') && authority.hasRole('WAKA_KURIKULUM', 'KAPROG')}
    canFinalApprove={authority.can('rpp.final.approve') && authority.hasRole('KEPALA_SEKOLAH')}
    canArchive={authority.hasRole('SUPER_ADMIN')}
  />;
}
