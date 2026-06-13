'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AuditLogEntry } from '../page';

interface Filters {
  actorId: string;
  resourceType: string;
  action: string;
  from: string;
  to: string;
  statusCode: string;
}

interface Props {
  entries: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
  filters: Filters;
}

function statusBadge(code: number) {
  if (code < 300) return <Badge variant="default" className="bg-green-100 text-green-800">{code}</Badge>;
  if (code < 400) return <Badge variant="outline">{code}</Badge>;
  if (code < 500) return <Badge variant="secondary">{code}</Badge>;
  return <Badge variant="destructive">{code}</Badge>;
}

function MetaPanel({ entry, onClose }: { entry: AuditLogEntry; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Detail audit log"
        className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-white shadow-xl flex flex-col outline-none"
        tabIndex={-1}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <p className="font-semibold text-gray-900 text-sm">{entry.action}</p>
            <p className="text-xs text-gray-500">{entry.resourceType} {entry.resourceId ? `· ${entry.resourceId.slice(0, 8)}…` : ''}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl p-1" aria-label="Tutup">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
            <div><span className="font-medium">Actor:</span> {entry.actorName ?? entry.actorId.slice(0, 12)}</div>
            <div><span className="font-medium">Role:</span> {entry.actorRole ?? '—'}</div>
            <div><span className="font-medium">Status:</span> {entry.statusCode}</div>
            <div><span className="font-medium">IP:</span> {entry.ipAddress ?? '—'}</div>
            <div className="col-span-2"><span className="font-medium">Waktu:</span> {new Date(entry.createdAt).toLocaleString('id')}</div>
          </div>
          <div>
            <p className="font-medium text-gray-700 mb-1">Metadata:</p>
            <pre className="bg-gray-50 rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">
              {entry.metadata ? JSON.stringify(entry.metadata, null, 2) : 'null'}
            </pre>
          </div>
          {entry.userAgent && (
            <div>
              <p className="font-medium text-gray-700 mb-1">User Agent:</p>
              <p className="text-xs text-gray-500 break-all">{entry.userAgent}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function AuditClient({ entries, total, limit, offset, filters }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);
  const [localFilters, setLocalFilters] = useState<Filters>(filters);

  const applyFilters = () => {
    const params = new URLSearchParams(sp.toString());
    Object.entries(localFilters).forEach(([k, v]) => {
      if (v) params.set(k, v); else params.delete(k);
    });
    params.delete('offset');
    startTransition(() => router.push(`/dashboard/audit?${params.toString()}`));
  };

  const resetFilters = () => {
    setLocalFilters({ actorId: '', resourceType: '', action: '', from: '', to: '', statusCode: '' });
    startTransition(() => router.push('/dashboard/audit'));
  };

  const setPage = (newOffset: number) => {
    const params = new URLSearchParams(sp.toString());
    params.set('offset', String(newOffset));
    startTransition(() => router.push(`/dashboard/audit?${params.toString()}`));
  };

  const uf = (k: keyof Filters, v: string) => setLocalFilters(p => ({ ...p, [k]: v }));

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">🛡 Audit Log</h1>

      {/* Filters */}
      <div className="rounded-xl border p-4 space-y-3 bg-gray-50">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Input placeholder="Actor ID" value={localFilters.actorId} onChange={e => uf('actorId', e.target.value)} className="bg-white" />
          <Input placeholder="Resource type (e.g. student)" value={localFilters.resourceType} onChange={e => uf('resourceType', e.target.value)} className="bg-white" />
          <Input placeholder="Action (e.g. CREATE)" value={localFilters.action} onChange={e => uf('action', e.target.value)} className="bg-white" />
          <Input type="datetime-local" placeholder="Dari" value={localFilters.from} onChange={e => uf('from', e.target.value)} className="bg-white" />
          <Input type="datetime-local" placeholder="Sampai" value={localFilters.to} onChange={e => uf('to', e.target.value)} className="bg-white" />
          <Input type="number" placeholder="Status code (e.g. 200)" value={localFilters.statusCode} onChange={e => uf('statusCode', e.target.value)} className="bg-white" />
        </div>
        <div className="flex gap-2">
          <Button onClick={applyFilters} disabled={isPending} className="bg-smk-blue hover:bg-primary-700" size="sm">Filter</Button>
          <Button onClick={resetFilters} disabled={isPending} variant="outline" size="sm">Reset</Button>
          <span className="text-xs text-gray-400 self-center ml-auto">{total} entri ditemukan</span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border shadow-sm overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-36">Waktu</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Aksi</TableHead>
              <TableHead className="hidden md:table-cell">Resource</TableHead>
              <TableHead className="w-16">Status</TableHead>
              <TableHead className="w-16">Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                  Tidak ada entri audit log yang cocok.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((e) => (
                <TableRow key={e.id} className="hover:bg-gray-50">
                  <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                    {new Date(e.createdAt).toLocaleString('id', { dateStyle: 'short', timeStyle: 'short' })}
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium text-gray-800 truncate max-w-[140px]">{e.actorName ?? e.actorId.slice(0, 12)}</p>
                    {e.actorRole && <p className="text-xs text-gray-400">{e.actorRole}</p>}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{e.action}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-gray-600">
                    {e.resourceType}{e.resourceId ? ` · ${e.resourceId.slice(0, 8)}…` : ''}
                  </TableCell>
                  <TableCell>{statusBadge(e.statusCode)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSelected(e)}>JSON</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <Button variant="outline" size="sm" disabled={offset === 0 || isPending} onClick={() => setPage(Math.max(0, offset - limit))}>
            ← Sebelumnya
          </Button>
          <span>Halaman {currentPage} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={offset + limit >= total || isPending} onClick={() => setPage(offset + limit)}>
            Berikutnya →
          </Button>
        </div>
      )}

      {/* Metadata detail panel */}
      {selected && <MetaPanel entry={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
