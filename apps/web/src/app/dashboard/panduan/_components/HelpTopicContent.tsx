import React from 'react';
import Link from 'next/link';
import { ArrowRight, Check, CircleAlert, ExternalLink, Info, LockKeyhole, ShieldCheck } from 'lucide-react';
import {
  buildVerifiedChildQuery,
  resolveHelpWorkflowTarget,
  type HelpWorkflowPersona,
} from '@/lib/help/help-links';
import type { HelpTopicProjection } from '@/lib/help/help-projection';
import type { HelpContentBlock } from '@/lib/help/help-schema';
import type { HelpTocItem } from '@/lib/help/help-toc';

const CALLOUT_STYLE = {
  info: { className: 'border-blue-300 bg-blue-50 text-blue-950', icon: Info },
  warning: { className: 'border-amber-300 bg-amber-50 text-amber-950', icon: CircleAlert },
  privacy: { className: 'border-violet-300 bg-violet-50 text-violet-950', icon: LockKeyhole },
  success: { className: 'border-emerald-300 bg-emerald-50 text-emerald-950', icon: ShieldCheck },
} as const;

function Block({
  block,
  headingId,
  selectedChildId,
  isParentViewer,
  workflowPersona,
}: {
  block: HelpContentBlock;
  headingId?: string;
  selectedChildId: string | null;
  isParentViewer: boolean;
  workflowPersona: HelpWorkflowPersona;
}) {
  if (block.kind === 'heading') {
    return block.level === 2
      ? <h2 id={headingId} className="mt-10 scroll-mt-24 text-xl font-bold text-slate-950">{block.text}</h2>
      : <h3 id={headingId} className="mt-7 scroll-mt-24 text-base font-bold text-slate-950">{block.text}</h3>;
  }
  if (block.kind === 'paragraph') return <p className="mt-3 max-w-3xl text-[15px] leading-7 text-slate-700">{block.text}</p>;
  if (block.kind === 'steps') {
    return <ol className="mt-4 max-w-3xl space-y-3">{block.items.map((item, index) => (
      <li key={item} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 text-[15px] leading-7 text-slate-700">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">{index + 1}</span>
        <span>{item}</span>
      </li>
    ))}</ol>;
  }
  if (block.kind === 'checklist') {
    return <ul className="mt-4 max-w-3xl space-y-2">{block.items.map((item) => (
      <li key={item} className="flex gap-3 text-[15px] leading-7 text-slate-700">
        <Check className="mt-1 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
        <span>{item}</span>
      </li>
    ))}</ul>;
  }
  if (block.kind === 'callout') {
    const style = CALLOUT_STYLE[block.tone];
    const Icon = style.icon;
    return <aside className={`mt-6 max-w-3xl border-l-4 px-4 py-4 ${style.className}`}>
      <div className="flex gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div><p className="font-bold">{block.title}</p><p className="mt-1 text-sm leading-6">{block.text}</p></div>
      </div>
    </aside>;
  }
  if (block.kind === 'authority-note') {
    return <aside className="mt-6 max-w-3xl border-l-4 border-slate-700 bg-slate-100 px-4 py-4 text-slate-900">
      <p className="flex items-center gap-2 font-bold"><ShieldCheck className="h-5 w-5" aria-hidden="true" />Batas kewenangan</p>
      <p className="mt-1 text-sm leading-6">{block.text}</p>
    </aside>;
  }
  if (block.kind === 'faq') return <details className="mt-6 max-w-3xl border-y border-slate-200 py-4"><summary className="min-h-11 cursor-pointer py-2 font-semibold text-slate-950">{block.question}</summary><p className="pb-2 text-sm leading-6 text-slate-700">{block.answer}</p></details>;
  if (block.kind === 'cta') {
    const target = resolveHelpWorkflowTarget({
      href: block.href,
      label: block.label,
      selectedChildId,
      preserveSelectedChild: block.preserveSelectedChild && isParentViewer,
      persona: workflowPersona,
    });
    if (!target) {
      return <aside className="print:hidden mt-6 max-w-3xl border-l-4 border-amber-500 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950">
        Pilih anak yang terverifikasi sebelum membuka workflow ini.
      </aside>;
    }
    const linkClassName = 'min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-800 px-4 text-sm font-semibold text-white hover:bg-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2';
    return <section aria-label="Lanjutkan di DIIS" className="print:hidden mt-6 max-w-3xl border-y border-blue-200 bg-blue-50 px-4 py-5 sm:px-5">
      <p className="text-sm font-bold text-slate-950">Lanjutkan di DIIS</p>
      <p className="mt-1 text-sm leading-6 text-slate-700">
        Buka workflow utama tanpa kehilangan panduan pada perangkat desktop.
      </p>
      <div className="mt-4">
        <Link href={target.href} className={`help-workflow-cta-same-tab ${linkClassName}`}>
          {target.label}<ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Link
          href={target.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`help-workflow-cta-new-tab ${linkClassName}`}
        >
          {target.label}<ExternalLink className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">(membuka tab baru)</span>
        </Link>
      </div>
      <p className="help-workflow-cta-new-tab mt-2 text-xs leading-5 text-slate-600">
        Membuka tab baru; panduan ini tetap terbuka.
      </p>
    </section>;
  }
  if (block.kind === 'related-topic') return null;
  if (block.kind === 'screenshot') {
    const isMobile = block.viewport === 'mobile-390x844';
    const selectedChildQuery = buildVerifiedChildQuery(selectedChildId);
    return <figure className={`mt-7 ${isMobile ? 'max-w-[390px]' : 'max-w-4xl'}`}>
      <div className="overflow-hidden border border-slate-300 bg-slate-100">
        {/* Authenticated media must retain its selected-child query and bypass the public image optimizer. */}
        <img
          src={`/api/help/screenshots/${encodeURIComponent(block.screenshotId)}${selectedChildQuery}`}
          alt={block.altText}
          width={block.width}
          height={block.height}
          className="h-auto w-full"
          loading="lazy"
          decoding="async"
        />
      </div>
      <figcaption className="mt-2 text-sm leading-6 text-slate-600">{block.caption}</figcaption>
    </figure>;
  }
  return null;
}

export default function HelpTopicContent({
  topic,
  toc,
  selectedChildId = null,
  isParentViewer = false,
  workflowPersona = 'staff',
}: {
  topic: HelpTopicProjection;
  toc: HelpTocItem[];
  selectedChildId?: string | null;
  isParentViewer?: boolean;
  workflowPersona?: HelpWorkflowPersona;
}) {
  const headingIds = new Map(toc.map((item) => [item.blockIndex, item.id]));
  return <div>{topic.blocks.map((block, index) => (
    <Block
      key={`${block.kind}-${block.kind === 'screenshot' ? block.screenshotId : index}`}
      block={block}
      headingId={headingIds.get(index)}
      selectedChildId={selectedChildId}
      isParentViewer={isParentViewer}
      workflowPersona={workflowPersona}
    />
  ))}</div>;
}
