'use client';
import React from 'react';

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
  real: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  soon: 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  vision: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
};
const BADGE_LABEL: Record<DataLevel, string> = {
  real: 'Nyata',
  soon: 'Segera',
  vision: 'Visi',
};

export function Badge({ level }: { level: DataLevel }) {
  return (
    <span className={clsx('rounded px-2 py-1 text-xs font-semibold', BADGE_STYLE[level])}>
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

export function Card({
  title,
  subtitle,
  icon: Icon,
  level,
  className,
  right,
  children,
}: CardProps) {
  return (
    <section
      aria-label={title}
      className={clsx(
        'relative min-w-0 rounded-2xl border border-[#e3ece8] bg-white p-4 text-slate-900 shadow-[0_1px_2px_rgba(16,40,33,.04),0_8px_24px_-12px_rgba(16,40,33,.12)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:shadow-none',
        className,
      )}
    >
      {(title || level || right) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && (
              <h3 className="flex items-start gap-2 text-sm font-bold text-[#0f2e25] dark:text-slate-100">
                {Icon && (
                  <Icon
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                )}
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {right}
            {level && <Badge level={level} />}
          </div>
        </div>
      )}
      {children}
    </section>
  );
}

export function SectionLabel({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <h2 className="col-span-12 mt-3 flex items-center gap-2.5 text-sm font-bold uppercase text-emerald-800 dark:text-emerald-200">
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {children}
      <span
        className="ml-1 h-px min-w-4 flex-1 bg-emerald-100 dark:bg-emerald-900"
        aria-hidden="true"
      />
    </h2>
  );
}

/** Empty-state jujur di dalam kartu. */
export function EmptyState({ label = 'Belum ada data' }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex min-h-28 items-center justify-center rounded-lg bg-[#f4f7f5] px-3 py-6 text-center text-sm leading-relaxed text-slate-600 dark:bg-slate-800 dark:text-slate-300"
    >
      {label}
    </div>
  );
}

/** Buat fungsi skala Y untuk SVG (nilai → koordinat). */
export function yScale(min: number, max: number, height: number, pad: number) {
  return (v: number) =>
    height - pad - ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * (height - 2 * pad);
}

export function fmtRupiah(amount: number): string {
  if (amount >= 1_000_000_000) return `Rp ${(amount / 1_000_000_000).toFixed(1)} M`;
  if (amount >= 1_000_000) return `Rp ${(amount / 1_000_000).toFixed(1)} jt`;
  if (amount >= 1_000) return `Rp ${(amount / 1_000).toFixed(0)} rb`;
  return `Rp ${amount}`;
}
