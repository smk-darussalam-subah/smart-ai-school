'use client';

import { useState } from 'react';
import { Bell, Tag, Calendar } from 'lucide-react';
import { SIM_PENGUMUMAN } from './siswa-data';
import type { SiswaPengumuman } from './siswa-types';

interface Props {
  announcements: SiswaPengumuman[];
  onClose: () => void;
}

export default function PengumumanModal({ announcements, onClose }: Props) {
  const [filter, setFilter] = useState<'all' | 'Penting' | 'Info' | 'Mapel'>('all');
  
  const displayAnnouncements = announcements.length > 0 ? announcements : SIM_PENGUMUMAN;
  const filtered = displayAnnouncements.filter((a: SiswaPengumuman) => {
    if (filter === 'all') return true;
    return a.tag === filter;
  });

  const pentingCount = displayAnnouncements.filter((a: SiswaPengumuman) => a.tag === 'Penting').length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-[560px] animate-[slideUp_.3s_ease] rounded-t-[20px] border border-[var(--border)] bg-[var(--bg2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--border)] p-5 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-extrabold">Pengumuman</h3>
              <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                {displayAnnouncements.length} pengumuman · {pentingCount} penting
              </p>
            </div>
            <button onClick={onClose} className="cursor-pointer text-[var(--muted)] hover:text-[var(--text)] transition-colors">
              ✕
            </button>
          </div>
        </div>

        {/* Tag Filters */}
        <div className="px-5 py-3 border-b border-[var(--border)]">
          <div className="flex gap-1.5">
            {([
              ['all', 'Semua'],
              ['Penting', 'Penting'],
              ['Info', 'Info'],
              ['Mapel', 'Mapel'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
                  filter === key
                    ? 'bg-emerald-500 text-white'
                    : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--border2)]'
                }`}
              >
                <Tag className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Announcements List */}
        <div className="max-h-[60vh] overflow-y-auto p-5 space-y-3">
          {filtered.length > 0 ? (
            filtered.map((ann: SiswaPengumuman) => (
              <div
                key={ann.id}
                className={`rounded-xl border p-4 transition-all ${
                  ann.tag === 'Penting'
                    ? 'border-rose-500/30 bg-rose-500/5'
                    : 'border-[var(--border)] bg-[var(--surface)]'
                } ${!ann.read ? 'border-l-4 border-l-emerald-500' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Bell className={`h-4 w-4 flex-shrink-0 ${
                        ann.tag === 'Penting' ? 'text-rose-500' : ann.tag === 'Info' ? 'text-blue-500' : 'text-emerald-500'
                      }`} />
                      <span className={`text-[10px] font-extrabold uppercase tracking-wider ${
                        ann.tag === 'Penting' ? 'text-rose-500' : ann.tag === 'Info' ? 'text-blue-500' : 'text-emerald-500'
                      }`}>
                        {ann.tag}
                      </span>
                      {!ann.read && (
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      )}
                    </div>
                    <h4 className="mt-2 text-sm font-bold">{ann.title}</h4>
                    <p className="mt-1 text-xs font-semibold text-[var(--muted)] line-clamp-2">{ann.body}</p>
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-[var(--muted)]">
                      <Calendar className="h-3 w-3" />
                      {ann.time}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-[var(--dim)]">
              <div className="mx-auto mb-2 h-8 w-8 opacity-50">📢</div>
              <div className="text-sm">Tidak ada pengumuman dengan filter ini</div>
            </div>
          )}
        </div>

        {/* Close Button */}
        <div className="border-t border-[var(--border)] p-5">
          <button
            onClick={onClose}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-bold text-[var(--text)] transition-all hover:border-[var(--border2)] hover:bg-[var(--surface2)]"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
