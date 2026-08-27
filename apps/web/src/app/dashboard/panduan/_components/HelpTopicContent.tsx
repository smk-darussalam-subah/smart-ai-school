import React from 'react';
import Link from 'next/link';
import { ArrowRight, Check, CircleAlert, Info, LockKeyhole, ShieldCheck } from 'lucide-react';
import type { HelpTopicProjection } from '@/lib/help/help-projection';
import type { HelpContentBlock } from '@/lib/help/help-schema';
import type { HelpTocItem } from '@/lib/help/help-toc';

const CALLOUT_STYLE = {
  info: { className: 'border-blue-300 bg-blue-50 text-blue-950', icon: Info },
  warning: { className: 'border-amber-300 bg-amber-50 text-amber-950', icon: CircleAlert },
  privacy: { className: 'border-violet-300 bg-violet-50 text-violet-950', icon: LockKeyhole },
  success: { className: 'border-emerald-300 bg-emerald-50 text-emerald-950', icon: ShieldCheck },
} as const;

function Block({ block, headingId }: { block: HelpContentBlock; headingId?: string }) {
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
  if (block.kind === 'cta') return <Link href={block.href} className="print:hidden mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-800 px-4 text-sm font-semibold text-white hover:bg-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2">{block.label}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>;
  if (block.kind === 'related-topic') return null;
  if (block.kind === 'screenshot') return null;
  return null;
}

export default function HelpTopicContent({ topic, toc }: { topic: HelpTopicProjection; toc: HelpTocItem[] }) {
  const headingIds = new Map(toc.map((item) => [item.blockIndex, item.id]));
  return <div>{topic.blocks.map((block, index) => (
    <Block key={`${block.kind}-${index}`} block={block} headingId={headingIds.get(index)} />
  ))}</div>;
}
