// =============================================================================
// Dashboard Eksekutif — /dashboard/executive
//
// RBAC: HANYA KEPALA_SEKOLAH & SUPER_ADMIN.
// Role lain → redirect ke /dashboard.
//
// KPI cards di-fetch server-side dari NestJS (finance/spp/summary + students).
// Metabase iframe di-embed via signed JWT (HS256, exp = +10 menit).
// Tanpa METABASE_* env → tampilkan placeholder, bukan crash.
// =============================================================================

import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { apiFetch, type PaginatedResponse } from '@/lib/api';
import { metabaseEmbedUrl } from '@/lib/metabase';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Dashboard Eksekutif' };
export const dynamic = 'force-dynamic';

// ── RBAC ──────────────────────────────────────────────────────────────────────

const ALLOWED_ROLES = ['KEPALA_SEKOLAH', 'SUPER_ADMIN'] as const;

// ── NestJS response types ─────────────────────────────────────────────────────

interface SppSummaryRow {
  year:        number;
  month:       number;
  status:      string;
  totalAmount: string;
  count:       number;
}

// ── KPI helpers ───────────────────────────────────────────────────────────────

function currentMonthPaid(rows: SppSummaryRow[]): number {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return rows
    .filter((r) => r.year === y && r.month === m && r.status === 'paid')
    .reduce((sum, r) => sum + parseFloat(r.totalAmount), 0);
}

function fmtRupiah(amount: number): string {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)} M`;
  if (amount >= 1_000_000)     return `${(amount / 1_000_000).toFixed(1)} jt`;
  if (amount >= 1_000)         return `${(amount / 1_000).toFixed(0)} rb`;
  return amount.toString();
}

// ── UI components ──────────────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, sub, color,
}: {
  icon: string; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <Card className="p-6 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-400 font-medium mb-0.5">{label}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </Card>
  );
}

function DashboardNotConfigured() {
  return (
    <Card className="p-6 text-center py-16">
      <p className="text-4xl mb-4">⚙️</p>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Dashboard belum dikonfigurasi</h2>
      <p className="text-sm text-gray-500 max-w-md mx-auto">
        Tambahkan{' '}
        <code className="text-xs bg-gray-100 px-1 rounded">METABASE_SITE_URL</code>,{' '}
        <code className="text-xs bg-gray-100 px-1 rounded">METABASE_SECRET_KEY</code>, dan{' '}
        <code className="text-xs bg-gray-100 px-1 rounded">METABASE_DASHBOARD_ID</code>{' '}
        ke environment. Lihat{' '}
        <span className="font-medium">docs/runbooks/metabase-dashboard-ks-setup.md</span>.
      </p>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ExecutiveDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) redirect('/login');

  const roles: string[] = await getEffectiveRoles(session);

  // RBAC: non-KS/SA → back to dashboard hub
  if (!ALLOWED_ROLES.some((r) => roles.includes(r))) {
    redirect('/dashboard');
  }

  // Fetch KPI data concurrently — graceful null on error/403/network failure
  const [sppRows, studentsRes] = await Promise.all([
    apiFetch<SppSummaryRow[]>('/finance/spp/summary', session.accessToken),
    apiFetch<PaginatedResponse<unknown>>('/students', session.accessToken, {
      status: 'active',
      limit:  '1',
    }),
  ]);

  const paidAmount    = sppRows ? currentMonthPaid(sppRows) : null;
  const studentCount  = studentsRes?.total ?? null;

  const embedUrl = metabaseEmbedUrl();

  const now = new Date();
  const schoolYear = now.getMonth() >= 6
    ? `${now.getFullYear()}/${now.getFullYear() + 1}`
    : `${now.getFullYear() - 1}/${now.getFullYear()}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Eksekutif</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Ringkasan performa &amp; operasional sekolah — TA {schoolYear}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          icon="👥"
          label="Siswa Aktif"
          value={studentCount !== null ? studentCount.toLocaleString('id-ID') : '—'}
          sub="Status aktif"
          color="bg-blue-50"
        />
        <KpiCard
          icon="💰"
          label="SPP Terkumpul (Bulan Ini)"
          value={paidAmount !== null ? `Rp ${fmtRupiah(paidAmount)}` : '—'}
          sub="Pembayaran lunas"
          color="bg-green-50"
        />
        <KpiCard
          icon="📊"
          label="Analitik Lengkap"
          value="Lihat Bawah"
          sub="Metabase dashboard"
          color="bg-purple-50"
        />
        <KpiCard
          icon="📅"
          label="Tahun Ajaran"
          value={schoolYear}
          color="bg-orange-50"
        />
      </div>

      {/* Metabase Embed / Placeholder */}
      {embedUrl ? (
        <Card className="p-0 overflow-hidden rounded-xl">
          <iframe
            src={embedUrl}
            title="Dashboard Analitik — KS Overview"
            className="w-full border-0"
            style={{ height: '640px' }}
            allowFullScreen
          />
        </Card>
      ) : (
        <DashboardNotConfigured />
      )}
    </div>
  );
}
