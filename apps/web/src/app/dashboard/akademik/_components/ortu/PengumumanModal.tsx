'use client';

import { X, Megaphone } from 'lucide-react';
import type { OrtuPengumuman } from './ortu-types';

interface PengumumanModalProps {
  announcements: OrtuPengumuman[];
  onClose: () => void;
}

export default function PengumumanModal({ announcements, onClose }: PengumumanModalProps) {
  return (
    <div
      className="ortu-app fixed inset-0 z-50 flex items-end justify-center bg-[var(--ovl-bg)] backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Pengumuman sekolah"
    >
      <div className="max-h-[85vh] w-full max-w-[560px] overflow-auto rounded-t-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg2)] p-4 pb-8 animate-[slideUp_0.3s_cubic-bezier(0.22,0.61,0.36,1)]">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-[var(--pri)]" />
            <b className="text-[15px] font-extrabold">Pengumuman Sekolah</b>
          </div>
          <button
            onClick={onClose}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Announcement list */}
        {announcements.length === 0 ? (
          <div className="py-6 text-center text-[12px] font-semibold text-[var(--dim)]">
            Tidak ada pengumuman
          </div>
        ) : (
          announcements.map((p) => (
            <div
              key={p.id}
              className="mb-2.5 rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5"
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="rounded-md bg-[var(--surface2)] px-2 py-0.5 text-[9px] font-extrabold text-[var(--pri)]">
                  {p.tag}
                </span>
                <small className="text-[10px] text-[var(--muted)]">{p.date}</small>
              </div>
              <b className="mb-1 block text-[13px]">{p.title}</b>
              <p className="text-[11.5px] leading-relaxed text-[var(--muted)]">{p.body}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
