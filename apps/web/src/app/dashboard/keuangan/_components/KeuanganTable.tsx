'use client';

import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { approveSpp, recordSpp } from '../actions';

interface SppPayment {
  id: string; month: number; year: number;
  amount: string; status: string;
  paidAt: string | null; receiptNo: string | null;
  approvedAt: string | null;
  student: { id: string; nis: string; user: { fullName: string } };
}

interface Props {
  payments: SppPayment[];
  total: number;
  canRecord: boolean;
  canApprove: boolean;
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  paid: { label: 'Lunas', variant: 'default' },
  unpaid: { label: 'Belum', variant: 'secondary' },
  late: { label: 'Telat', variant: 'destructive' },
  waived: { label: 'Bebas', variant: 'outline' },
};

const MONTHS = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export default function KeuanganTable({ payments, total, canRecord, canApprove }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const filtered = payments.filter((p) => {
    const matchSearch = !search || p.student.nis.includes(search) || p.student.user.fullName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleRecord = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(e.currentTarget);
    const result = await recordSpp(form);
    setLoading(false);
    if (result?.success) setFormOpen(false);
    else setError(result?.error || 'Gagal');
  };

  const handleApprove = async (id: string) => {
    await approveSpp(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Keuangan SPP</h1>
        {canRecord && (
          <Button onClick={() => setFormOpen(true)} className="bg-smk-blue hover:bg-primary-700">
            + Catat Pembayaran
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Input placeholder="Cari NIS atau nama..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua</SelectItem>
            {Object.entries(STATUS_MAP).map(([k, v]) => (<SelectItem key={k} value={k}>{v.label}</SelectItem>))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground self-center">{total} transaksi</span>
      </div>

      <div className="rounded-xl border shadow-sm overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Siswa (NIS)</TableHead>
              <TableHead>Bulan/Tahun</TableHead>
              <TableHead className="text-right">Jumlah</TableHead>
              <TableHead>Status</TableHead>
              {canApprove && <TableHead className="w-24">Aksi</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={canApprove ? 5 : 4} className="text-center h-24 text-muted-foreground">Belum ada data SPP</TableCell></TableRow>
            ) : filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.student.user.fullName} <span className="text-muted-foreground">({p.student.nis})</span></TableCell>
                <TableCell>{MONTHS[p.month]} {p.year}</TableCell>
                <TableCell className="text-right font-mono">Rp {Number(p.amount).toLocaleString('id')}</TableCell>
                <TableCell><Badge variant={STATUS_MAP[p.status]?.variant ?? 'secondary'}>{STATUS_MAP[p.status]?.label ?? p.status}</Badge></TableCell>
                {canApprove && (
                  <TableCell>
                    {p.status === 'paid' && !p.approvedAt && (
                      <Button variant="outline" size="sm" className="text-green-700" onClick={() => handleApprove(p.id)}>Approve</Button>
                    )}
                    {p.approvedAt && <span className="text-xs text-green-600">✓ Approved</span>}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Catat Pembayaran SPP</DialogTitle></DialogHeader>
          <form onSubmit={handleRecord} className="space-y-4">
            <div>
              <Label htmlFor="studentId">Student ID</Label>
              <Input id="studentId" name="studentId" placeholder="UUID siswa" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="month">Bulan (1-12)</Label>
                <Input id="month" name="month" type="number" min={1} max={12} defaultValue={6} required />
              </div>
              <div>
                <Label htmlFor="year">Tahun</Label>
                <Input id="year" name="year" type="number" defaultValue={2026} required />
              </div>
            </div>
            <div>
              <Label htmlFor="amount">Jumlah (Rp)</Label>
              <Input id="amount" name="amount" type="number" defaultValue={150000} required />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Batal</Button>
              <Button type="submit" disabled={loading} className="bg-smk-blue hover:bg-primary-700">{loading ? 'Menyimpan...' : 'Simpan'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
