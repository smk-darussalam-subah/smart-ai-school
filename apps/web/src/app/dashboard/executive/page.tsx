// =============================================================================
// Dasbor Eksekutif — /dashboard/executive
//
// RBAC: HANYA KEPALA_SEKOLAH & SUPER_ADMIN. Role lain → redirect ke /dashboard.
// Native analytics (chart SVG sendiri) — Metabase DIHAPUS (2N).
// Data di-fetch server-side via server action fetchExecutiveBundle (paralel,
// graceful null per-sumber), lalu di-render oleh client component interaktif.
// =============================================================================

import type { Metadata } from 'next';
import ExecutiveDashboard from './_components/ExecutiveDashboard';
import { fetchExecutivePageData } from './actions';

export const metadata: Metadata = { title: 'Dasbor Eksekutif' };
export const dynamic = 'force-dynamic';

export default async function ExecutiveDashboardPage() {
  const { initial, years } = await fetchExecutivePageData({});

  return <ExecutiveDashboard initial={initial} years={years} />;
}
