'use client';

// =============================================================================
// Primitif UI Dasbor Eksekutif — Card, Badge kejujuran data, label seksi,
// palet emerald statis & helper SVG. Anti-template: hierarki + depth + warna
// semantik (lihat .claude/rules/web/design-quality.md).
// =============================================================================

import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';

export const PALETTE = {
  emerald: '#059669',
  emerald2: '#10b981',
  emerald3: '#6ee7b7',
  sky: '#0284c7',
  amber: '#d97706',
  amber2: '#f59e0b',
  rose: '#e11d48',
  violet: '#7c3aed',
  line: '#e3ece8',
  ink: '#0f2e25',
  muted: '#6b8079',
} as const;

export const LINE_COLORS = ['#059669', '#0284c7', '#d97706', '#7c3aed', '#e11d48'];

export type DataLevel = 'real' | 'soon' | 'vision';

const BADGE_STYLE: Record<DataLevel, string> = {
  real: 'bg-emerald-50 text-emerald-700',
  soon: 'bg-amber-100 text-amber-700',
  vision: 'bg-slate-100 text-slate-500',
};
const BADGE_LABEL: Record<DataLevel, string> = {
  real: 'Nyata',
  soon: 'Segera',
  vision: 'Visi',
};

export function Badge({ level }: { level: DataLevel }) {
  return (
    <span className={clsx('rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide', BADGE_STYLE[level])}>
      {BADGE_LABEL[level]}
    </span>
  );
}

interface CardProps {
  title?: string;
  subtitle?: string;
  icon?: LucideIcon;
  level?: DataLevel;
  className?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}

export function Card({ title, subtitle, icon: Icon, level, className, right, children }: CardProps) {
  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-2xl border border-[#e3ece8] bg-white p-4 shadow-[0_1px_2px_rgba(16,40,33,.04),0_8px_24px_-12px_rgba(16,40,33,.12)]',
        className,
      )}
    >
      {(title || level || right) && (
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            {title && (
              <h3 className="flex items-center gap-2 text-[13.5px] font-bold tracking-tight text-[#0f2e25]">
                {Icon && <Icon className="h-[17px] w-[17px] text-emerald-600" />}
                {title}
              </h3>
            )}
            {subtitle && <p className="mt-0.5 text-[11.5px] font-medium text-[#6b8079]">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {right}
            {level && <Badge level={level} />}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

export function SectionLabel({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="col-span-12 mt-2 flex items-center gap-2.5 text-[11.5px] font-extrabold uppercase tracking-wider text-emerald-700">
      <Icon className="h-4 w-4" />
      {children}
      <span className="ml-1 h-px flex-1 bg-gradient-to-r from-emerald-200 to-transparent" />
    </div>
  );
}

/** Empty-state jujur di dalam kartu. */
export function EmptyState({ label = 'Belum ada data' }: { label?: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-xl bg-[#f4f7f5] text-[12px] font-medium text-[#9bb0a8]">
      {label}
    </div>
  );
}

/** Buat fungsi skala Y untuk SVG (nilai → koordinat). */
export function yScale(min: number, max: number, height: number, pad: number) {
  return (v: number) => height - pad - ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * (height - 2 * pad);
}

export function fmtRupiah(amount: number): string {
  if (amount >= 1_000_000_000) return `Rp ${(amount / 1_000_000_000).toFixed(1)} M`;
  if (amount >= 1_000_000) return `Rp ${(amount / 1_000_000).toFixed(1)} jt`;
  if (amount >= 1_000) return `Rp ${(amount / 1_000).toFixed(0)} rb`;
  return `Rp ${amount}`;
}
