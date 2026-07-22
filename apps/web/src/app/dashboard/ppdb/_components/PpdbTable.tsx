'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TablePagination } from '@/components/ui/table-pagination';
import { useQueryState } from '@/hooks/use-query-state';
import { updateLeadStatus } from '../actions';

interface Lead {
  id: string; fullName: string; phone: string; schoolOrigin: string | null;
  interestMajor: string | null; source: string; status: string; notes: string | null;
  assignedTo: string | null; createdAt: string;
  enrollmentRequired?: boolean;
  enrollmentAction?: { href: string; label: string };
}

interface Props {
  leads: Lead[];
  total: number;
  canEdit: boolean;
  query: {
    page: number;
    limit: number;
    status: string;
    search: string;
  };
}

const STATUS_FLOW: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; next: string[] }> = {
  new: { label: 'Baru', variant: 'default', next: ['contacted'] },
  contacted: { label: 'Dihubungi', variant: 'secondary', next: ['interested', 'rejected'] },
  interested: { label: 'Berminat', variant: 'secondary', next: ['registered', 'rejected'] },
  registered: { label: 'Terdaftar', variant: 'outline', next: ['paid', 'rejected'] },
  paid: { label: 'Lunas', variant: 'default', next: ['accepted'] },
  accepted: { label: 'Diterima', variant: 'outline', next: [] },
  rejected: { label: 'Ditolak', variant: 'destructive', next: [] },
  cold: { label: 'Cold', variant: 'secondary', next: [] },
};

export default function PpdbTable({ leads, total, canEdit, query }: Props) {
  const { setParams, isPending } = useQueryState();
  const [search, setSearch] = useState(query.search);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => { setSearch(query.search); }, [query.search]);
  useEffect(() => {
    if (search === query.search) return;
    const t = setTimeout(() => setParams({ search: search || null }), 400);
    return () => clearTimeout(t);
  }, [search, query.search, setParams]);

  const handleStatus = async (id: string, newStatus: string) => {
    setUpdating(id);
    await updateLeadStatus(id, newStatus);
    setUpdating(null);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">PPDB — Pipeline Calon Siswa</h1>

      <div className="flex flex-col sm:flex-row gap-3">
        <Input placeholder="Cari nama atau HP..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={query.status || 'all'} onValueChange={(value: string) => setParams({ status: value })}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            {Object.entries(STATUS_FLOW).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground self-center">{leads.length} dari {total} leads</span>
      </div>

      <div className={`rounded-xl border shadow-sm overflow-x-auto transition-opacity ${isPending ? 'opacity-60' : ''}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead className="hidden md:table-cell">HP</TableHead>
              <TableHead className="hidden lg:table-cell">Asal Sekolah</TableHead>
              <TableHead className="hidden sm:table-cell">Minat</TableHead>
              <TableHead>Status</TableHead>
              {canEdit && <TableHead className="w-32">Aksi</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 ? (
              <TableRow><TableCell colSpan={canEdit ? 6 : 5} className="text-center h-24 text-muted-foreground">Belum ada data PPDB</TableCell></TableRow>
            ) : leads.map(l => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.fullName}</TableCell>
                <TableCell className="hidden md:table-cell text-sm">{l.phone}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{l.schoolOrigin ?? '-'}</TableCell>
                <TableCell className="hidden sm:table-cell">{l.interestMajor ?? '-'}</TableCell>
                <TableCell><Badge variant={STATUS_FLOW[l.status]?.variant ?? 'secondary'}>{STATUS_FLOW[l.status]?.label ?? l.status}</Badge></TableCell>
                {canEdit && (
                  <TableCell>
                    {(() => { const s = STATUS_FLOW[l.status]; return s && s.next.length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
                        {s.next.map(ns => (
                          <Button key={ns} variant="outline" size="sm" disabled={updating === l.id}
                            onClick={() => handleStatus(l.id, ns)}>
                            {updating === l.id ? '...' : STATUS_FLOW[ns]?.label ?? ns}
                          </Button>
                        ))}
                      </div>
                    ) : l.enrollmentRequired && l.enrollmentAction ? (
                      <Button asChild variant="outline" size="sm">
                        <Link href={l.enrollmentAction.href}>{l.enrollmentAction.label}</Link>
                      </Button>
                    ) : null; })()}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <TablePagination page={query.page} limit={query.limit} total={total} onPage={(page) => setParams({ page })} />
    </div>
  );
}
