import type { Metadata } from 'next';
import React from 'react';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ArrowRight, Download, FileClock, LifeBuoy } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { apiFetchResult } from '@/lib/api';
import { resolveHelpAuthority } from '@/lib/help/help-authority';
import { HELP_TOPIC_BY_SLUG } from '@/lib/help/help-catalog';
import { projectHelpTopic } from '@/lib/help/help-projection';
import { buildHelpTableOfContents } from '@/lib/help/help-toc';
import HelpTopicContent from '../_components/HelpTopicContent';
import PrintButton from '../_components/PrintButton';
import { resolveHelpWorkflowPersona } from '@/lib/help/help-links';

export const metadata: Metadata = { title: 'Panduan DIIS' };

interface PublicSchoolProfile {
  name: string;
  phone: string | null;
  email: string | null;
}

export default async function HelpTopicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ studentId?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login?callbackUrl=/dashboard/panduan');
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const source = HELP_TOPIC_BY_SLUG.get(slug);
  if (!source) notFound();

  const result = await resolveHelpAuthority(session, query.studentId ?? null);
  const topic = projectHelpTopic(source, result.authority);
  if (!topic) notFound();
  const toc = buildHelpTableOfContents(topic.blocks);
  const profileResult = topic.id === 'topic.official-support'
    ? await apiFetchResult<PublicSchoolProfile>('/school/profile', session.accessToken ?? '')
    : null;
  const profile = profileResult?.status === 'success' ? profileResult.data : null;
  const hasOfficialContact = Boolean(profile?.phone || profile?.email);
  const currentIndex = result.topics.findIndex((item) => item.id === topic.id);
  const previous = currentIndex > 0 ? result.topics[currentIndex - 1] : null;
  const next = currentIndex >= 0 ? result.topics[currentIndex + 1] ?? null : null;
  const selectedChildQuery = result.authority.selectedChildVerified && query.studentId
    ? `?studentId=${encodeURIComponent(query.studentId)}`
    : '';
  const workflowPersona = resolveHelpWorkflowPersona(result.authority);

  return (
    <article className="help-print-surface mx-auto max-w-5xl bg-white pb-12">
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <Link href={`/dashboard/panduan${selectedChildQuery}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Semua panduan
        </Link>
        <PrintButton />
      </div>

      <header className="border-b border-slate-200 py-8">
        <p className="text-xs font-semibold uppercase text-emerald-800">Panduan versi {topic.version}</p>
        <h1 className="mt-2 max-w-4xl text-3xl font-bold text-slate-950">{topic.title}</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">{topic.summary}</p>
        <p className="mt-3 text-xs text-slate-500">Diverifikasi {topic.updatedAt} · Status fitur: {topic.featureStatus === 'available' ? 'Tersedia' : topic.featureStatus === 'limited' ? 'Terbatas' : 'Belum tersedia'}</p>
      </header>

      {toc.length > 0 && (
        <nav aria-label="Daftar isi panduan" className="print:hidden mt-7 border-y border-slate-200 py-5">
          <p className="text-sm font-bold text-slate-950">Daftar isi</p>
          <ol className="mt-2 grid gap-x-6 sm:grid-cols-2">
            {toc.map((item) => (
              <li key={item.id} className={item.level === 3 ? 'sm:pl-4' : ''}>
                <a href={`#${item.id}`} className="inline-flex min-h-11 items-center py-2 text-sm font-semibold text-blue-800 hover:text-blue-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700">
                  {item.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <HelpTopicContent
        topic={topic}
        toc={toc}
        selectedChildId={result.authority.selectedChildVerified ? query.studentId ?? null : null}
        isParentViewer={result.authority.identityRoles.includes('ORANG_TUA')}
        workflowPersona={workflowPersona}
      />

      {topic.id === 'topic.official-support' && (
        <section aria-labelledby="official-contact-heading" className="mt-8 max-w-3xl border-y border-slate-200 py-6">
          <div className="flex gap-3">
            <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-blue-800" aria-hidden="true" />
            <div>
              <h2 id="official-contact-heading" className="text-lg font-bold text-slate-950">Kontak resmi</h2>
              {hasOfficialContact ? (
                <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                  <p className="font-semibold text-slate-950">{profile?.name}</p>
                  {profile?.phone && <p>Telepon sekolah: <span className="font-semibold">{profile.phone}</span></p>}
                  {profile?.email && <p>Email sekolah: <span className="font-semibold">{profile.email}</span></p>}
                </div>
              ) : (
                <div role="alert" className="mt-3 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                  Kontak resmi belum dapat diverifikasi dari profil sekolah. Jangan memakai nomor pribadi atau kontak alternatif yang tidak disahkan.
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {topic.artifacts.map((artifact) => (
        <aside key={artifact.id} className="print:hidden mt-10 border-y border-slate-200 py-5">
          <div className="flex flex-col gap-4 text-slate-700 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <FileClock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold text-slate-950">{artifact.label}</p>
                <p className="mt-1 text-sm leading-6">
                  {artifact.status === 'ready' ? 'Dokumen telah dibekukan untuk konteks Anda.' : artifact.status === 'pending' ? 'Dokumen sedang disiapkan setelah screenshot exact-SHA disetujui.' : 'Dokumen tidak tersedia untuk rilis ini.'}
                </p>
              </div>
            </div>
            {artifact.status === 'ready' && (
              <a
                href={`/api/help/artifacts/${encodeURIComponent(artifact.id)}${selectedChildQuery}`}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-800 px-4 text-sm font-semibold text-white hover:bg-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
              >
                <Download className="h-4 w-4" aria-hidden="true" /> Unduh PDF
              </a>
            )}
          </div>
        </aside>
      ))}

      {topic.relatedTopics.length > 0 && (
        <section aria-labelledby="related-heading" className="print:hidden mt-8">
          <h2 id="related-heading" className="text-lg font-bold text-slate-950">Panduan terkait</h2>
          <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
            {topic.relatedTopics.map((related) => <Link key={related.id} href={`/dashboard/panduan/${related.slug}${selectedChildQuery}`} className="flex min-h-12 items-center justify-between gap-4 py-3 text-sm font-semibold text-blue-800 hover:text-blue-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"><span>{related.title}</span><ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>)}
          </div>
        </section>
      )}

      <nav aria-label="Panduan sebelum dan berikutnya" className="print:hidden mt-10 grid gap-3 border-t border-slate-200 pt-6 sm:grid-cols-2">
        {previous ? <Link href={`/dashboard/panduan/${previous.slug}${selectedChildQuery}`} className="flex min-h-14 flex-col justify-center rounded-lg border border-slate-300 px-4 text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"><span className="text-xs text-slate-500">Sebelumnya</span><span className="mt-1 font-semibold text-slate-900">{previous.title}</span></Link> : <span />}
        {next && <Link href={`/dashboard/panduan/${next.slug}${selectedChildQuery}`} className="flex min-h-14 flex-col justify-center rounded-lg border border-slate-300 px-4 text-sm sm:text-right hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"><span className="text-xs text-slate-500">Berikutnya</span><span className="mt-1 font-semibold text-slate-900">{next.title}</span></Link>}
      </nav>
    </article>
  );
}
