'use client';

import { X, Info, CreditCard, Upload } from 'lucide-react';
import { fmtRupiahExact, daysUntil, fmtDateShort } from '@/lib/academic';
import type { Pembayaran } from '@/lib/academic';

interface PayDetailModalProps {
  payment: Pembayaran;
  onClose: () => void;
  showToast: (msg: string) => void;
}

export default function PayDetailModal({ payment: p, onClose, showToast }: PayDetailModalProps) {
  const dd = daysUntil(p.due);
  const isOverdue = p.status === 'unpaid' && dd < 0;
  const isPaid = p.status === 'paid';

  return (
    <div
      className="ortu-app fixed inset-0 z-50 flex items-end justify-center bg-[var(--ovl-bg)] backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Detail pembayaran ${p.jenis}`}
    >
      <div className="max-h-[85vh] w-full max-w-[560px] overflow-auto rounded-t-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg2)] p-4 pb-8 animate-[slideUp_0.3s_cubic-bezier(0.22,0.61,0.36,1)]">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <b className="text-[15px] font-extrabold">{p.jenis}</b>
          <button
            onClick={onClose}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Big amount display */}
        <div className="mb-4 text-center">
          <div
            className="inline-block rounded-[var(--r)] px-7 py-4 text-white"
            style={{ background: isPaid ? 'var(--em)' : 'var(--amber)' }}
          >
            <div className="text-[28px] font-extrabold">{fmtRupiahExact(p.amount)}</div>
            <div className="mt-0.5 text-[11px] font-semibold opacity-85">
              {isPaid ? 'LUNAS' : 'BELUM DIBAYAR'}
            </div>
          </div>
        </div>

        {/* Detail card */}
        <div className="mb-2.5 rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
          <div className="mb-2.5 flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
            <Info className="h-[15px] w-[15px] text-[var(--pri)]" />
            Detail Pembayaran
          </div>
          <div className="flex justify-between border-b border-[var(--border)] py-2">
            <span className="text-[12px] text-[var(--muted)]">Jenis</span>
            <span className="text-[12px] font-bold">{p.jenis}</span>
          </div>
          <div className="flex justify-between border-b border-[var(--border)] py-2">
            <span className="text-[12px] text-[var(--muted)]">Keterangan</span>
            <span className="text-[12px] font-bold">{p.desc}</span>
          </div>
          <div className="flex justify-between border-b border-[var(--border)] py-2">
            <span className="text-[12px] text-[var(--muted)]">Jatuh Tempo</span>
            <span className="text-[12px] font-bold">{fmtDateShort(p.due)}</span>
          </div>
          {isPaid ? (
            <div className="flex justify-between py-2">
              <span className="text-[12px] text-[var(--muted)]">Tanggal Bayar</span>
              <span className="text-[12px] font-bold text-[var(--em)]">{p.paidDate}</span>
            </div>
          ) : (
            <div className="flex justify-between py-2">
              <span className="text-[12px] text-[var(--muted)]">Status</span>
              <span className="text-[12px] font-bold" style={{ color: isOverdue ? 'var(--rose)' : 'var(--amber)' }}>
                {isOverdue ? `Terlewat ${Math.abs(dd)} hari` : 'Belum dibayar'}
              </span>
            </div>
          )}
        </div>

        {/* Action buttons (unpaid only) */}
        {!isPaid && (
          <>
            <button
              onClick={() => showToast(`Pembayaran ${p.jenis} — simulasi VA: 8801${String(p.id).padStart(4, '0')}`)}
              className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[12px] bg-[var(--grad)] py-3 text-[13px] font-bold text-white"
            >
              <CreditCard className="h-4 w-4" />
              Bayar Sekarang
            </button>
            <button
              onClick={() => showToast('Bukti pembayaran diunggah (simulasi)')}
              className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] py-3 text-[13px] font-bold text-[var(--pri)]"
            >
              <Upload className="h-4 w-4" />
              Upload Bukti Bayar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
