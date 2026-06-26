'use client';

import { useState } from 'react';
import { CheckCircle, Clock } from 'lucide-react';
import { fmtRupiahExact, daysUntil, fmtDateShort } from '@/lib/academic';
import type { Pembayaran } from '@/lib/academic';
import type { ModalState } from './OrtuWorkspace';
import { mapSppToPembayaran, type SppApiItem } from './ortu-mappers';

interface PembayaranOrtuProps {
  setModal: (modal: ModalState) => void;
  /** Data SPP real dari /student-dashboard/spp. Kosong = tampilkan empty state. */
  spp?: SppApiItem[];
}

type PayTab = 'all' | 'unpaid' | 'paid';

export default function PembayaranOrtu({ setModal, spp }: PembayaranOrtuProps) {
  const [payTab, setPayTab] = useState<PayTab>('all');

  // T1-01 (audit v2): sumber data real (dipetakan ke view-model). JANGAN fallback ke SIM.
  const payments: Pembayaran[] = mapSppToPembayaran(spp ?? []);
  const unpaid = payments.filter((p) => p.status === 'unpaid');
  const paid = payments.filter((p) => p.status === 'paid');

  let filtered: Pembayaran[] = payments;
  if (payTab === 'unpaid') filtered = unpaid;
  else if (payTab === 'paid') filtered = paid;

  const tabs: { key: PayTab; label: string; count?: number }[] = [
    { key: 'all', label: 'Semua' },
    { key: 'unpaid', label: 'Belum Bayar', count: unpaid.length },
    { key: 'paid', label: 'Lunas', count: paid.length },
  ];

  return (
    <div className="px-4 pb-4">
      <div className="mb-3.5">
        <h1 className="text-xl font-extrabold">Pembayaran</h1>
        <p className="mt-0.5 text-[12px] font-medium text-[var(--muted)]">Status SPP & biaya pendidikan</p>
      </div>

      {/* Segmented tabs */}
      <div className="mb-3 flex gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setPayTab(t.key)}
            className="flex-1 cursor-pointer rounded-[var(--r-sm)] border border-[var(--border)] py-2 text-[11px] font-bold transition-colors"
            style={{
              background: payTab === t.key ? 'var(--pri)' : 'var(--surface)',
              color: payTab === t.key ? '#fff' : 'var(--muted)',
              borderColor: payTab === t.key ? 'var(--pri)' : 'var(--border)',
            }}
          >
            {t.label}
            {t.count != null && (
              <span
                className="ml-1 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold"
                style={{
                  background: payTab === t.key ? 'rgba(255,255,255,.15)' : 'var(--surface2)',
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Payment list */}
      {filtered.length === 0 ? (
        <div className="py-6 text-center text-[12px] font-semibold text-[var(--dim)]">
          Tidak ada data pembayaran
        </div>
      ) : (
        filtered.map((p) => {
          const dd = daysUntil(p.due);
          const isOverdue = p.status === 'unpaid' && dd < 0;
          const isPaid = p.status === 'paid';
          const bBg = isPaid ? 'rgba(16,185,129,.15)' : isOverdue ? 'rgba(239,68,68,.15)' : 'rgba(245,158,11,.15)';
          const bTx = isPaid ? 'var(--em)' : isOverdue ? 'var(--rose)' : 'var(--amber)';
          const bText = isPaid ? 'Lunas' : isOverdue ? 'Terlewat' : `${dd} hari`;

          return (
            <div
              key={p.id}
              onClick={() => setModal({ type: 'pay', data: { payment: p } })}
              className="mb-2 flex cursor-pointer items-center gap-2.5 rounded-[var(--r-sm)] border border-[var(--border)] p-2.5 transition-colors hover:border-[var(--border2)] hover:bg-[var(--surface2)] last:mb-0"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setModal({ type: 'pay', data: { payment: p } }); } }}
            >
              {/* Icon */}
              <div
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px]"
                style={{ background: isPaid ? 'rgba(16,185,129,.15)' : 'rgba(245,158,11,.15)' }}
              >
                {isPaid
                  ? <CheckCircle className="h-[18px] w-[18px] text-[var(--em)]" />
                  : <Clock className="h-[18px] w-[18px] text-[var(--amber)]" />}
              </div>
              {/* Body */}
              <div className="min-w-0 flex-1">
                <b className="block text-[12.5px]">{p.jenis}</b>
                <small className="text-[10px] font-semibold text-[var(--muted)]">
                  {isPaid ? `Dibayar ${p.paidDate}` : `Jatuh tempo ${fmtDateShort(p.due)}`}
                </small>
              </div>
              {/* Amount + badge */}
              <div className="text-right">
                <div
                  className="whitespace-nowrap text-[14px] font-extrabold"
                  style={{ color: isPaid ? 'var(--em)' : 'var(--text)' }}
                >
                  {fmtRupiahExact(p.amount)}
                </div>
                <span
                  className="inline-block rounded-md px-2 py-0.5 text-[9px] font-extrabold whitespace-nowrap"
                  style={{ background: bBg, color: bTx }}
                >
                  {bText}
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
