// =============================================================================
// Basis Pengetahuan — /dashboard/knowledge
//
// Roles: SUPER_ADMIN (CRUD + publish + delete + backfill)
//        KEPALA_SEKOLAH (CRUD + publish)
//        TATA_USAHA (CRUD saja — publish butuh SA/KS; separation of duties)
//
// Data diambil di server → diteruskan ke KnowledgeManager (client component).
// Mutasi via Server Actions (actions.ts) — token tidak terekspos ke client.
// =============================================================================

import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { apiFetch, type KnowledgeListItem } from '@/lib/api';
import { KnowledgeManager } from './_components/KnowledgeManager';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Basis Pengetahuan' };

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA'] as const;

// ── Error states ──────────────────────────────────────────────────────────────

function AccessDenied() {
  return (
    <Card className="p-6 text-center py-12">
      <p className="text-4xl mb-4" role="img" aria-label="Dilarang">🔒</p>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Akses Tidak Diizinkan</h2>
      <p className="text-sm text-gray-500">
        Halaman ini hanya untuk Super Admin, Kepala Sekolah, dan Tata Usaha.
      </p>
    </Card>
  );
}

function FetchError() {
  return (
    <Card className="p-6 text-center py-12">
      <p className="text-4xl mb-4" role="img" aria-label="Error">⚠️</p>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Gagal Memuat Data</h2>
      <p className="text-sm text-gray-500">
        Tidak dapat terhubung ke server. Coba muat ulang halaman.
      </p>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function KnowledgePage() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) redirect('/login');

  const roles: string[] = await getEffectiveRoles(session);

  if (!ALLOWED_ROLES.some((r) => roles.includes(r))) {
    return <AccessDenied />;
  }

  const items = await apiFetch<KnowledgeListItem[]>('/ai/knowledge', session.accessToken);
  if (items === null) {
    return <FetchError />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Basis Pengetahuan</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Kelola konten FAQ yang digunakan chatbot AI sekolah
        </p>
      </div>

      <KnowledgeManager initialItems={items} userRoles={roles} />
    </div>
  );
}
