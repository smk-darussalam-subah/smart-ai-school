'use client';

import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SiswaFormDialog from './SiswaForm';
import SiswaDeleteDialog from './SiswaDelete';

interface Student {
  id: string; nis: string; status: string;
  user: { fullName: string; email: string };
  class?: { id: string; name: string } | null;
  joinedAt?: string; createdAt: string;
}

interface SiswaTableProps {
  students: Student[];
  total: number;
  classes: { id: string; name: string }[];
  canEdit: boolean;
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'Aktif', variant: 'default' },
  inactive: { label: 'Nonaktif', variant: 'secondary' },
  graduated: { label: 'Lulus', variant: 'outline' },
  dropped: { label: 'DO', variant: 'destructive' },
};

export default function SiswaTable({ students, total, classes, canEdit }: SiswaTableProps) {
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [deleteStudent, setDeleteStudent] = useState<Student | null>(null);

  const filtered = students.filter((s) => {
    const matchSearch = !search || s.nis.includes(search) || s.user.fullName.toLowerCase().includes(search.toLowerCase());
    const matchClass = classFilter === 'all' || s.class?.id === classFilter;
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchSearch && matchClass && matchStatus;
  });

  const handleEdit = (student: Student) => {
    setEditStudent(student);
    setFormOpen(true);
  };

  const handleNew = () => {
    setEditStudent(null);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Data Siswa</h1>
        {canEdit && (
          <Button onClick={handleNew} className="bg-smk-blue hover:bg-primary-700">
            + Tambah Siswa
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Cari NIS atau nama..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Semua Kelas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Kelas</SelectItem>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Semua Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            {Object.entries(STATUS_MAP).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground self-center">
          {total} siswa
        </span>
      </div>

      <div className="rounded-xl border shadow-sm overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>NIS</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead className="hidden md:table-cell">Kelas</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
              {canEdit && <TableHead className="w-24">Aksi</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 5 : 4} className="text-center h-24 text-muted-foreground">
                  {search || classFilter !== 'all' || statusFilter !== 'all'
                    ? 'Tidak ada siswa yang cocok dengan filter'
                    : 'Belum ada data siswa'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-sm">{s.nis}</TableCell>
                  <TableCell className="font-medium">{s.user.fullName}</TableCell>
                  <TableCell className="hidden md:table-cell">{s.class?.name ?? '-'}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant={STATUS_MAP[s.status]?.variant ?? 'secondary'}>
                      {STATUS_MAP[s.status]?.label ?? s.status}
                    </Badge>
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(s)}>Edit</Button>
                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => setDeleteStudent(s)}>Hapus</Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <SiswaFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        student={editStudent}
        classes={classes}
      />
      <SiswaDeleteDialog
        student={deleteStudent}
        onClose={() => setDeleteStudent(null)}
      />
    </div>
  );
}
