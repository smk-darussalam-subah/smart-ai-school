'use client';

import { useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { TablePagination } from '@/components/ui/table-pagination';
import { approveSpp, recordSpp, searchStudentsForSppAction } from '../actions';
import { isSppApprovable } from './spp-ui';

interface SppPayment {
  id: string; month: number; year: number;
  amount: string; status: string;
  paidAt: string | null; receiptNo: string | null;
  approvedAt: string | null;
  student: { id: string; nis: string; user: { fullName: string } };
}

interface StudentOption {
  id: string;
  nis: string;
  user: { fullName: string };
  class?: { name: string } | null;
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

const PAGE_SIZE = 10;

export default function KeuanganTable({ payments, total, canRecord, canApprove }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentError, setStudentError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = payments.filter((p) => {
    const matchSearch = !search || p.student.nis.includes(search) || p.student.user.fullName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Reset ke halaman 1 saat filter berubah
  useEffect(() => { setCurrentPage(1); }, [search, statusFilter]);
  useEffect(() => {
    if (!formOpen) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setStudentLoading(true);
      setStudentError('');
      const result = await searchStudentsForSppAction(studentSearch);
      if (cancelled) return;
      setStudentLoading(false);
      if (!result.success) {
        setStudentOptions([]);
        setStudentError(result.error ?? 'Gagal mencari siswa');
        return;
      }
      const data = result.data as { data?: StudentOption[] } | undefined;
      setStudentOptions(data?.data ?? []);
    }, studentSearch.trim() ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [formOpen, studentSearch]);

  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleRecord = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(e.currentTarget);
    const result = await recordSpp(form);
    setLoading(false);
    if (result?.success) {
      setFormOpen(false);
      setSelectedStudentId('');
      setSelectedStudent(null);
      setStudentSearch('');
    }
    else setError(result?.error || 'Gagal');
  };

  const handleApprove = async (id: string) => {
    setApproving(id);
    await approveSpp(id);
    setApproving(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Keuangan SPP</h1>
          <p className="mt-1 text-sm text-muted-foreground">Setup tagihan berjalan manual per siswa/bulan; sistem menolak duplikat periode yang sama.</p>
        </div>
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
        <span className="text-sm text-muted-foreground self-center">{filtered.length} dari {total} transaksi</span>
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
            ) : paginated.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.student.user.fullName} <span className="text-muted-foreground">({p.student.nis})</span></TableCell>
                <TableCell>{MONTHS[p.month]} {p.year}</TableCell>
                <TableCell className="text-right font-mono">Rp {Number(p.amount).toLocaleString('id')}</TableCell>
                <TableCell><Badge variant={STATUS_MAP[p.status]?.variant ?? 'secondary'}>{STATUS_MAP[p.status]?.label ?? p.status}</Badge></TableCell>
                {canApprove && (
                  <TableCell>
                    {isSppApprovable(p) && (
                      <Button variant="outline" size="sm" className="text-green-700" disabled={approving === p.id}
                        onClick={() => handleApprove(p.id)}>
                        {approving === p.id ? '...' : 'Terima'}
                      </Button>
                    )}
                    {p.approvedAt && <span className="text-xs text-green-600">✓ Approved</span>}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <TablePagination page={currentPage} limit={PAGE_SIZE} total={filtered.length} onPage={setCurrentPage} />

      <Dialog open={formOpen} onOpenChange={(next: boolean) => { setFormOpen(next); if (!next) { setSelectedStudentId(''); setSelectedStudent(null); setStudentSearch(''); setStudentOptions([]); setStudentError(''); setError(''); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Catat Pembayaran SPP</DialogTitle></DialogHeader>
          <form onSubmit={handleRecord} className="space-y-4">
            <div>
              <Label htmlFor="student-search">Siswa</Label>
              <Input
                id="student-search"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Cari NIS, nama, atau kelas..."
                className="mt-1"
              />
              <input type="hidden" name="studentId" value={selectedStudentId} />
              {selectedStudent && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-smk-blue">
                  <span className="font-semibold">{selectedStudent.user.fullName}</span>
                  <span className="text-blue-700">({selectedStudent.nis})</span>
                  <span className="text-xs text-blue-700">{selectedStudent.class?.name ?? 'Tanpa kelas'}</span>
                  <button
                    type="button"
                    className="ml-auto text-xs font-semibold hover:underline"
                    onClick={() => { setSelectedStudent(null); setSelectedStudentId(''); }}
                  >
                    Ganti
                  </button>
                </div>
              )}
              <div className="mt-2 max-h-48 overflow-y-auto rounded-md border">
                {studentLoading ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">Mencari siswa...</div>
                ) : studentError ? (
                  <div className="px-3 py-6 text-center text-sm text-red-600">{studentError}</div>
                ) : studentOptions.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">Tidak ada siswa yang cocok.</div>
                ) : studentOptions.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => { setSelectedStudentId(student.id); setSelectedStudent(student); }}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-blue-50 ${
                      selectedStudentId === student.id ? 'bg-blue-50 text-smk-blue' : ''
                    }`}
                  >
                    <span>
                      <span className="font-semibold">{student.user.fullName}</span>
                      <span className="ml-2 text-muted-foreground">({student.nis})</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{student.class?.name ?? 'Tanpa kelas'}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Menampilkan maksimal 20 hasil teratas per pencarian.</p>
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
              <Button type="submit" disabled={loading || !selectedStudentId} className="bg-smk-blue hover:bg-primary-700">{loading ? 'Menyimpan...' : 'Simpan'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
