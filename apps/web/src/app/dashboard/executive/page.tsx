// =============================================================================
// Dasbor Eksekutif — /dashboard/executive
//
// RBAC: HANYA KEPALA_SEKOLAH & SUPER_ADMIN. Role lain → redirect ke /dashboard.
// Native analytics (chart SVG sendiri) — Metabase DIHAPUS (2N).
// Data di-fetch server-side via server action fetchExecutiveBundle (paralel,
// graceful null per-sumber), lalu di-render oleh client component interaktif.
// =============================================================================

import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import ExecutiveDashboard from './_components/ExecutiveDashboard';
import { fetchAcademicYears, fetchExecutiveBundle } from './actions';

export const metadata: Metadata = { title: 'Dasbor Eksekutif' };
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['KEPALA_SEKOLAH', 'SUPER_ADMIN'] as const;

export default async function ExecutiveDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) redirect('/login');

  const roles: string[] = await getEffectiveRoles(session);
  if (!ALLOWED_ROLES.some((r) => roles.includes(r))) {
    redirect('/dashboard');
  }

  const [initial, years] = await Promise.all([fetchExecutiveBundle({}), fetchAcademicYears()]);

  return <ExecutiveDashboard initial={initial} years={years} />;
}
