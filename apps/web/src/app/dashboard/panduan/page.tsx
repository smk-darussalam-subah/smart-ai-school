import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { BookOpenCheck, FileClock, LifeBuoy, ShieldCheck } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { resolveHelpAuthority } from '@/lib/help/help-authority';
import { normalizeHelpSourceRoute, ROUTE_TOPIC_MAP } from '@/lib/help/help-catalog';
import HelpExplorer from './_components/HelpExplorer';

export const metadata: Metadata = { title: 'Panduan DIIS' };

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; studentId?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login?callbackUrl=/dashboard/panduan');
  const params = await searchParams;
  const result = await resolveHelpAuthority(session, params.studentId ?? null);
  const sourceRoute = normalizeHelpSourceRoute(params.from);
  const contextualTopicId = sourceRoute ? ROUTE_TOPIC_MAP[sourceRoute] : null;

  return (
    <div className="mx-auto max-w-6xl pb-12">
      <header className="border-b border-slate-200 pb-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-800 text-white">
            <BookOpenCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-emerald-800">Pusat bantuan role-aware</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">Panduan DIIS</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Temukan langkah kerja, batas kewenangan, dan cara memulihkan masalah sesuai konteks akun Anda.</p>
          </div>
        </div>
        {result.authority.viewAs && (
          <div role="status" className="mt-5 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Panduan sedang diproyeksikan untuk mode tinjau <strong>{result.authority.viewAs}</strong>. Akses fitur tetap mengikuti akun asli.
          </div>
        )}
        {result.warning && (
          <div role="alert" className="mt-4 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
            {result.warning} Muat ulang untuk mencoba verifikasi kembali.
          </div>
        )}
      </header>

      <section aria-label="Ringkasan bantuan" className="grid border-b border-slate-200 py-6 sm:grid-cols-3">
        <div className="flex gap-3 py-3 sm:pr-5"><ShieldCheck className="h-5 w-5 shrink-0 text-emerald-700" /><div><p className="text-sm font-bold">Sesuai kewenangan</p><p className="mt-1 text-xs leading-5 text-slate-600">Topik difilter di server sebelum dikirim ke browser.</p></div></div>
        <div className="flex gap-3 border-slate-200 py-3 sm:border-x sm:px-5"><LifeBuoy className="h-5 w-5 shrink-0 text-blue-700" /><div><p className="text-sm font-bold">Pemulihan yang jelas</p><p className="mt-1 text-xs leading-5 text-slate-600">State gagal dibedakan dari data kosong.</p></div></div>
        <div className="flex gap-3 py-3 sm:pl-5"><FileClock className="h-5 w-5 shrink-0 text-slate-700" /><div><p className="text-sm font-bold">PDF belum dibekukan</p><p className="mt-1 text-xs leading-5 text-slate-600">Dokumen final tersedia setelah exact-SHA staging disetujui.</p></div></div>
      </section>

      <div className="pt-8">
        {result.topics.length > 0 ? (
          <HelpExplorer
            topics={result.topics}
            contextualTopicId={contextualTopicId}
            selectedChildId={result.authority.selectedChildVerified ? params.studentId ?? null : null}
          />
        ) : (
          <div role="status" className="border-y border-slate-200 py-12 text-center">
            <h2 className="text-lg font-bold text-slate-950">Panduan belum tersedia untuk konteks ini</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Kembali ke dashboard dan muat ulang. Jika masalah berlanjut, gunakan kanal bantuan resmi sekolah.</p>
          </div>
        )}
      </div>
    </div>
  );
}
