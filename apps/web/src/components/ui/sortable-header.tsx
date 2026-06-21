'use client';

// SortableHeader — header tabel yang bisa diklik untuk sort (toggle asc/desc).
// Reusable lintas tabel data. Sort dikendalikan parent (URL via useQueryState).

import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface SortableHeaderProps {
  label: string;
  /** Nama kolom (harus cocok dgn whitelist sortBy backend). */
  column: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
  className?: string;
}

export function SortableHeader({ label, column, sortBy, sortOrder, onSort, className }: SortableHeaderProps) {
  const active = sortBy === column;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn('inline-flex items-center gap-1 font-medium transition-colors hover:text-foreground', active && 'text-foreground')}
        aria-label={`Urutkan ${label}`}
      >
        {label}
        {active ? (
          sortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}
