'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { WaLogEntry } from '../page';

interface Filters {
  eventType: string;
  status: string;
  studentId: string;
}

interface Props {
  entries: WaLogEntry[];
  total: number;
  page: number;
  limit: number;
  filters: Filters;
}

const EVENT_TYPES = [
  'ABSENSI',
  'NILAI',
  'PENGUMUMAN',
  'PEMBAYARAN',
  'RAPOR',
  'KEGIATAN',
  'PRESENSI_GURU',
];

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    sent:      { label: 'Terkirim',  className: 'bg-green-100 text-green-800' },
    delivered: { label: 'Terkirim',  className: 'bg-green-100 text-green-800' },
    read:      { label: 'Dibaca',    className: 'bg-blue-100 text-blue-800' },
    failed:    { label: 'Gagal',     className: 'bg-red-100 text-red-800' },
    pending:   { label: 'Menunggu',  className: 'bg-yellow-100 text-yellow-800' },
  };
  const m = map[status] ?? { label: status, className: 'bg-gray-100 text-gray-800' };
  return <Badge variant="outline" className={m.className}>{m.label}</Badge>;
}

function DetailPanel({ entry, onClose }: { entry: WaLogEntry; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Detail log WA"
        className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-white shadow-xl flex flex-col outline-none"
        tabIndex={-1}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <p className="font-semibold text-gray-900 text-sm">
              {entry.eventType ?? 'Notifikasi'}
            </p>
            <p className="text-xs text-gray-500">
              {entry.recipient} · {new Date(entry.createdAt).toLocaleString('id')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl p-1" aria-label="Tutup">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
            <div><span className="font-medium">Status:</span> {statusBadge(entry.status)}</div>
            <div><span className="font-medium">Terkirim:</span> {entry.sentAt ? new Date(entry.sentAt).toLocaleString('id') : '—'}</div>
            <div><span className="font-medium">Terdeliver:</span> {entry.deliveredAt ? new Date(entry.deliveredAt).toLocaleString('id') : '—'}</div>
            <div><span className="font-medium">Dibaca:</span> {entry.readAt ? new Date(entry.readAt).toLocaleString('id') : '—'}</div>
          </div>
          <div>
            <p className="font-medium text-gray-700 mb-1">Pesan:</p>
            <div className="bg-gray-50 rounded-lg p-3 text-xs whitespace-pre-wrap break-all">
              {entry.message}
            </div>
          </div>
          <div className="text-xs text-gray-400">
            <p>Log ID: {entry.id}</p>
            {entry.notificationLogId && <p>Notif ID: {entry.notificationLogId}</p>}
          </div>
        </div>
      </div>
    </>
  );
}

export default function WaLogClient({ entries, total, page, limit, filters }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<WaLogEntry | null>(null);
  const [localFilters, setLocalFilters] = useState<Filters>(filters);

  const applyFilters = () => {
    const params = new URLSearchParams();
    Object.entries(localFilters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    params.set('page', '1');
    startTransition(() => router.push(`/dashboard/wa-log?${params.toString()}`));
  };

  const resetFilters = () => {
    setLocalFilters({ eventType: '', status: '', studentId: '' });
    startTransition(() => router.push('/dashboard/wa-log'));
  };

  const setPage = (newPage: number) => {
    const params = new URLSearchParams(sp.toString());
    params.set('page', String(newPage));
    startTransition(() => router.push(`/dashboard/wa-log?${params.toString()}`));
  };

  const uf = (k: keyof Filters, v: string) => setLocalFilters((p) => ({ ...p, [k]: v }));

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">📱 Log Notifikasi WA</h1>
      <p className="text-sm text-gray-500 -mt-2">
        Pantau pengiriman notifikasi WhatsApp ke siswa dan orang tua.
      </p>

      {/* Filters */}
      <div className="rounded-xl border p-4 space-y-3 bg-gray-50">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Tipe Event</label>
            <Select
              value={localFilters.eventType || '__all__'}
              onValueChange={(v: string) => uf('eventType', v === '__all__' ? '' : v)}
            >
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Semua tipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Semua tipe</SelectItem>
                {EVENT_TYPES.map((et) => (
                  <SelectItem key={et} value={et}>{et}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Status</label>
            <Select
              value={localFilters.status || '__all__'}
              onValueChange={(v: string) => uf('status', v === '__all__' ? '' : v)}
            >
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Semua status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Semua status</SelectItem>
                <SelectItem value="sent">Terkirim</SelectItem>
                <SelectItem value="delivered">Terdeliver</SelectItem>
                <SelectItem value="read">Dibaca</SelectItem>
                <SelectItem value="failed">Gagal</SelectItem>
                <SelectItem value="pending">Menunggu</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">ID Siswa</label>
            <Input
              placeholder="UUID siswa (opsional)"
              value={localFilters.studentId}
              onChange={(e) => uf('studentId', e.target.value)}
              className="bg-white"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={applyFilters} disabled={isPending} className="bg-smk-blue hover:bg-primary-700" size="sm">
            Filter
          </Button>
          <Button onClick={resetFilters} disabled={isPending} variant="outline" size="sm">
            Reset
          </Button>
          <span className="text-xs text-gray-400 self-center ml-auto">{total} entri ditemukan</span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border shadow-sm overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Waktu</TableHead>
              <TableHead>Penerima</TableHead>
              <TableHead>Tipe</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="hidden md:table-cell">Pesan</TableHead>
              <TableHead className="w-16">Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                  Belum ada log notifikasi.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((e) => (
                <TableRow key={e.id} className="hover:bg-gray-50">
                  <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                    {new Date(e.createdAt).toLocaleString('id', { dateStyle: 'short', timeStyle: 'short' })}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-mono text-gray-700">{e.recipient}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                      {e.eventType ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell>{statusBadge(e.status)}</TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-gray-600 max-w-[200px] truncate">
                    {e.message.length > 80 ? `${e.message.slice(0, 80)}…` : e.message}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSelected(e)}>
                      Lihat
                    </Button>
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
          <Button variant="outline" size="sm" disabled={page <= 1 || isPending} onClick={() => setPage(page - 1)}>
            ← Sebelumnya
          </Button>
          <span>Halaman {page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages || isPending} onClick={() => setPage(page + 1)}>
            Berikutnya →
          </Button>
        </div>
      )}

      {/* Detail panel */}
      {selected && <DetailPanel entry={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
