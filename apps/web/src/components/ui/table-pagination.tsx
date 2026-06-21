'use client';

// TablePagination — kontrol halaman untuk tabel data server-side. Presentasional;
// parent menyetel halaman via onPage (URL via useQueryState). Reusable lintas tabel.

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TablePaginationProps {
  page: number;
  limit: number;
  total: number;
  onPage: (page: number) => void;
}

export function TablePagination({ page, limit, total, onPage }: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
      <span className="text-sm text-muted-foreground">
        {from}–{to} dari <b className="text-foreground">{total}</b>
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Halaman sebelumnya">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">Hal {page} / {totalPages}</span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Halaman berikutnya">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
