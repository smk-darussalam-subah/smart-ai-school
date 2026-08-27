'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpenCheck, Search, WifiOff, X } from 'lucide-react';
import { searchProjectedHelp, type HelpTopicSummary } from '@/lib/help/help-search';

const CATEGORY_LABELS: Record<HelpTopicSummary['category'] | 'all', string> = {
  all: 'Semua',
  start: 'Mulai di sini',
  task: 'Tugas utama',
  feature: 'Panduan fitur',
  recovery: 'Masalah umum',
  governance: 'Tata kelola',
  contact: 'Hubungi bantuan',
};

export default function HelpExplorer({
  topics,
  contextualTopicId,
  selectedChildId,
}: {
  topics: HelpTopicSummary[];
  contextualTopicId: string | null;
  selectedChildId: string | null;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<HelpTopicSummary['category'] | 'all'>('all');
  const [online, setOnline] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const filtered = useMemo(() => {
    const searched = searchProjectedHelp(topics, query, 24);
    return category === 'all' ? searched : searched.filter((topic) => topic.category === category);
  }, [category, query, topics]);
  const contextual = topics.find((topic) => topic.id === contextualTopicId) ?? null;
  const topicHref = (slug: string) => selectedChildId
    ? `/dashboard/panduan/${slug}?studentId=${encodeURIComponent(selectedChildId)}`
    : `/dashboard/panduan/${slug}`;

  return (
    <div className="space-y-8">
      {!online && (
        <div role="status" className="flex items-start gap-3 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Perangkat sedang offline</p>
            <p className="mt-1 leading-6">Panduan yang sudah terbuka tetap dapat dibaca. Tautan fitur memerlukan koneksi.</p>
          </div>
        </div>
      )}

      {contextual && (
        <section aria-labelledby="contextual-help-heading" className="border-y border-emerald-200 bg-emerald-50/70 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-emerald-800">Bantuan untuk halaman sebelumnya</p>
              <h2 id="contextual-help-heading" className="mt-1 text-lg font-bold text-slate-950">{contextual.title}</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-700">{contextual.summary}</p>
            </div>
            <Link
              href={topicHref(contextual.slug)}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800 focus-visible:ring-offset-2"
            >
              Buka panduan <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      )}

      <section aria-labelledby="find-help-heading">
        <div className="max-w-3xl">
          <h2 id="find-help-heading" className="text-xl font-bold text-slate-950">Cari tugas atau masalah</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">Hasil hanya berasal dari panduan yang tersedia untuk konteks aktif Anda.</p>
          <label htmlFor="help-search" className="mt-4 block text-sm font-semibold text-slate-800">Cari panduan</label>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <input
              ref={inputRef}
              id="help-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Contoh: Rapor, penugasan guru, atau akun"
              autoComplete="off"
              className="min-h-12 w-full rounded-lg border border-slate-300 bg-white py-3 pl-12 pr-12 text-base text-slate-950 outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20"
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                aria-label="Hapus pencarian"
                className="absolute right-1 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-2" aria-label="Filter kategori panduan">
          {(Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setCategory(value)}
              aria-pressed={category === value}
              className={`min-h-11 shrink-0 rounded-lg border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 ${
                category === value
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {CATEGORY_LABELS[value]}
            </button>
          ))}
        </div>

        <p className="mt-2 text-sm text-slate-600" aria-live="polite">
          {filtered.length} panduan ditemukan
        </p>

        {filtered.length > 0 ? (
          <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
            {filtered.map((topic) => (
              <article key={topic.id} className="group grid gap-3 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div>
                  <p className="text-xs font-semibold uppercase text-emerald-800">{CATEGORY_LABELS[topic.category]}</p>
                  <h3 className="mt-1 text-base font-bold text-slate-950">{topic.title}</h3>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{topic.summary}</p>
                </div>
                <Link
                  href={topicHref(topic.slug)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold text-blue-800 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                >
                  Baca <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 border-y border-slate-200 py-10 text-center">
            <BookOpenCheck className="mx-auto h-8 w-8 text-slate-500" aria-hidden="true" />
            <h3 className="mt-3 text-base font-bold text-slate-950">Panduan tidak ditemukan</h3>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-600">Gunakan kata yang lebih umum atau pilih Semua. Hasil tidak akan menampilkan fitur di luar akses Anda.</p>
            <button
              type="button"
              onClick={() => { setQuery(''); setCategory('all'); inputRef.current?.focus(); }}
              className="mt-4 min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
            >
              Reset pencarian
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
