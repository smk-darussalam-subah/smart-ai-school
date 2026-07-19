'use client';

import { useEffect, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SortableHeader } from '@/components/ui/sortable-header';
import { TablePagination } from '@/components/ui/table-pagination';
import { useQueryState } from '@/hooks/use-query-state';
import { cn } from '@/lib/utils';
import { ChevronDown, FileSpreadsheet, UserCheck, UserPlus } from 'lucide-react';
import SiswaFormDialog from './SiswaForm';
import SiswaDeleteDialog from './SiswaDelete';
import SiswaWizard from './SiswaWizard';
import AssignParentDialog from './AssignParentDialog';
import StudentSingleEntrySheet from './StudentSingleEntrySheet';
import StudentImportDialog from './StudentImportDialog';
import type { WithoutParentItem } from '../page';
import type { PpdbEnrollmentLead } from './ppdb-enrollment-handoff';

interface Student {
  id: string; nis: string; status: string;
  parentId?: string | null;
  user: { id?: string; fullName: string; email: string; isActive?: boolean; consentAt?: string | null };
  parent?: { id: string; fullName: string } | null;
  class?: { id: string; name: string; grade?: number; majorCode?: string } | null;
  joinedAt?: string; createdAt: string;
}

interface SiswaQuery {
  page: number;
  limit: number;
  search: string;
  classId: string;
  status: string;
  grade: string;
  majorCode: string;
  joinedYear: string;
  parentState: string;
  classState: string;
  accountStatus: string;
  consentStatus: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

interface SiswaTableProps {
  students: Student[];
  total: number;
  classes: { id: string; name: string; grade?: number; majorCode?: string }[];
  canEdit: boolean;
  withoutParentStudents: WithoutParentItem[];
  withoutParentTotal: number;
  readinessCounts: {
    total: number;
    withoutParent: number;
    withoutClass: number;
    pendingConsent: number;
  };
  ppdbEnrollmentLead: PpdbEnrollmentLead | null;
  query: SiswaQuery;
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'Aktif', variant: 'default' },
  inactive: { label: 'Nonaktif', variant: 'secondary' },
  graduated: { label: 'Lulus', variant: 'outline' },
  dropped: { label: 'DO', variant: 'destructive' },
};

export default function SiswaTable({
  students, total, classes, canEdit, withoutParentStudents, withoutParentTotal, readinessCounts, ppdbEnrollmentLead, query,
}: SiswaTableProps) {
  const { setParams, isPending } = useQueryState();
  const [activeTab, setActiveTab] = useState<'semua' | 'tanpa-wali'>('semua');
  const [searchInput, setSearchInput] = useState(query.search);
  const [formOpen, setFormOpen] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [deleteStudent, setDeleteStudent] = useState<Student | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [singleEntryOpen, setSingleEntryOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [assignParentStudent, setAssignParentStudent] = useState<WithoutParentItem | null>(null);

  // Filter/sort/search/pagination = SERVER-SIDE via URL (useQueryState). `students`
  // sudah hasil query server. Search di-debounce; sinkron bila URL berubah dari luar.
  useEffect(() => { setSearchInput(query.search); }, [query.search]);
  useEffect(() => {
    if (canEdit && ppdbEnrollmentLead) setWizardOpen(true);
  }, [canEdit, ppdbEnrollmentLead?.id]);
  useEffect(() => {
    if (searchInput === query.search) return;
    const t = setTimeout(() => setParams({ search: searchInput || null }), 400);
    return () => clearTimeout(t);
  }, [searchInput, query.search, setParams]);

  const hasFilter = !!(
    query.search || query.classId || query.status || query.grade || query.majorCode || query.joinedYear ||
    query.parentState || query.classState || query.accountStatus || query.consentStatus
  );
  const handleEdit = (student: Student) => { setEditStudent(student); setFormOpen(true); };
  const handleOpenPpdb = () => { window.location.href = '/dashboard/ppdb'; };
  const handleSort = (column: string) => {
    const order = query.sortBy === column && query.sortOrder === 'asc' ? 'desc' : 'asc';
    setParams({ sortBy: column, sortOrder: order });
  };
  const gradeOptions = Array.from(new Set(classes.map((c) => c.grade).filter(Boolean))).sort();
  const majorOptions = Array.from(new Set(classes.map((c) => c.majorCode).filter(Boolean))).sort();
  const currentYear = new Date().getFullYear();
  const joinedYearOptions = Array.from({ length: currentYear - 2015 + 1 }, (_, i) => String(currentYear - i));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Siswa</h1>
          {ppdbEnrollmentLead && (
            <p className="mt-1 text-sm text-muted-foreground">
              Enrollment dari PPDB: {ppdbEnrollmentLead.fullName}. Lengkapi NIS, kelas, data wali, dan persetujuan.
            </p>
          )}
        </div>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="gap-2 bg-smk-blue hover:bg-primary-700">
                <UserPlus className="h-4 w-4" />
                Tambah Siswa
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onSelect={handleOpenPpdb} className="gap-2">
                <UserCheck className="h-4 w-4" />
                Tambah dari PPDB
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSingleEntryOpen(true)} className="gap-2">
                <UserPlus className="h-4 w-4" />
                Input satuan
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setImportOpen(true)} className="gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Import kolektif
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {canEdit && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Registry', value: readinessCounts.total, action: () => setParams({ parentState: null, classState: null, consentStatus: null }) },
            { label: 'Tanpa wali', value: readinessCounts.withoutParent, action: () => setParams({ parentState: 'without_parent' }) },
            { label: 'Tanpa kelas', value: readinessCounts.withoutClass, action: () => setParams({ classState: 'without_class' }) },
            { label: 'Consent pending', value: readinessCounts.pendingConsent, action: () => setParams({ consentStatus: 'pending' }) },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.action}
              className="flex items-center justify-between rounded-md border bg-white px-3 py-2 text-left text-sm transition-colors hover:border-smk-blue hover:bg-blue-50"
            >
              <span className="font-medium text-slate-700">{item.label}</span>
              <span className="font-mono text-base font-semibold text-slate-950">{item.value}</span>
            </button>
          ))}
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveTab('semua')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'semua'
              ? 'border-smk-blue text-smk-blue'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Semua Siswa
          <span className="ml-2 text-xs text-gray-400">({total})</span>
        </button>
        {canEdit && (
          <button
            type="button"
            onClick={() => setActiveTab('tanpa-wali')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'tanpa-wali'
                ? 'border-smk-blue text-smk-blue'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Tanpa Wali
            {withoutParentTotal > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-orange-100 text-orange-700 text-xs font-semibold min-w-[20px] h-5 px-1.5">
                {withoutParentTotal}
              </span>
            )}
          </button>
        )}
      </div>

      {/* === TAB: SEMUA SISWA === */}
      {activeTab === 'semua' && (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 lg:flex-row">
            <Input
              placeholder="Cari NIS atau nama..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="max-w-xs"
            />
            <Select value={query.classId || 'all'} onValueChange={(v: string) => setParams({ classId: v })}>
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
            <Select value={query.status || 'all'} onValueChange={(v: string) => setParams({ status: v })}>
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
            </div>
            <div className="flex flex-wrap gap-3">
              <Select value={query.grade || 'all'} onValueChange={(v: string) => setParams({ grade: v })}>
                <SelectTrigger className="w-[130px]"><SelectValue placeholder="Tingkat" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Tingkat</SelectItem>
                  {gradeOptions.map((grade) => (
                    <SelectItem key={grade} value={String(grade)}>{grade}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={query.majorCode || 'all'} onValueChange={(v: string) => setParams({ majorCode: v })}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Jurusan" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Jurusan</SelectItem>
                  {majorOptions.map((major) => (
                    <SelectItem key={major} value={String(major)}>{major}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={query.joinedYear || 'all'} onValueChange={(v: string) => setParams({ joinedYear: v })}>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="Tahun Masuk" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Tahun</SelectItem>
                  {joinedYearOptions.map((year) => (
                    <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={query.parentState || 'all'} onValueChange={(v: string) => setParams({ parentState: v })}>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="Wali" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Wali</SelectItem>
                  <SelectItem value="with_parent">Ada wali</SelectItem>
                  <SelectItem value="without_parent">Tanpa wali</SelectItem>
                </SelectContent>
              </Select>
              <Select value={query.classState || 'all'} onValueChange={(v: string) => setParams({ classState: v })}>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="Kelas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kelas</SelectItem>
                  <SelectItem value="with_class">Ada kelas</SelectItem>
                  <SelectItem value="without_class">Tanpa kelas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={query.accountStatus || 'all'} onValueChange={(v: string) => setParams({ accountStatus: v })}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Akun" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Akun</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="inactive">Nonaktif</SelectItem>
                </SelectContent>
              </Select>
              <Select value={query.consentStatus || 'all'} onValueChange={(v: string) => setParams({ consentStatus: v })}>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="Consent" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Consent</SelectItem>
                  <SelectItem value="given">Sudah consent</SelectItem>
                  <SelectItem value="pending">Belum consent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className={cn('rounded-xl border shadow-sm overflow-x-auto transition-opacity', isPending && 'opacity-60')}>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader label="NIS" column="nis" sortBy={query.sortBy} sortOrder={query.sortOrder} onSort={handleSort} />
                  <SortableHeader label="Nama" column="fullName" sortBy={query.sortBy} sortOrder={query.sortOrder} onSort={handleSort} />
                  <TableHead className="hidden md:table-cell">Kelas</TableHead>
                  <TableHead className="hidden lg:table-cell">Wali</TableHead>
                  <TableHead className="hidden xl:table-cell">Akun</TableHead>
                  <TableHead className="hidden xl:table-cell">Consent</TableHead>
                  <SortableHeader label="Status" column="status" sortBy={query.sortBy} sortOrder={query.sortOrder} onSort={handleSort} className="hidden sm:table-cell" />
                  {canEdit && <TableHead className="w-24">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 8 : 7} className="text-center h-24 text-muted-foreground">
                      {hasFilter ? 'Tidak ada siswa yang cocok dengan filter' : 'Belum ada data siswa'}
                    </TableCell>
                  </TableRow>
                ) : (
                  students.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-sm">{s.nis}</TableCell>
                      <TableCell className="font-medium">{s.user.fullName}</TableCell>
                      <TableCell className="hidden md:table-cell">{s.class?.name ?? '-'}</TableCell>
                      <TableCell className="hidden lg:table-cell">{s.parent?.fullName ?? '-'}</TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <Badge variant={s.user.isActive === false ? 'secondary' : 'outline'}>
                          {s.user.isActive === false ? 'Nonaktif' : 'Aktif'}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <Badge variant={s.user.consentAt ? 'default' : 'secondary'}>
                          {s.user.consentAt ? 'Sudah' : 'Belum'}
                        </Badge>
                      </TableCell>
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

          <TablePagination page={query.page} limit={query.limit} total={total} onPage={(p) => setParams({ page: p })} />
        </>
      )}

      {/* === TAB: TANPA WALI === */}
      {activeTab === 'tanpa-wali' && canEdit && (
        <>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>{withoutParentTotal} siswa belum memiliki orang tua/wali yang terhubung.</span>
          </div>

          <div className="rounded-xl border shadow-sm overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NIS</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead className="hidden md:table-cell">Kelas</TableHead>
                  <TableHead className="w-40">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withoutParentStudents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                      Semua siswa sudah memiliki orang tua/wali yang terhubung.
                    </TableCell>
                  </TableRow>
                ) : (
                  withoutParentStudents.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-sm">{s.nis}</TableCell>
                      <TableCell className="font-medium">{s.user.fullName}</TableCell>
                      <TableCell className="hidden md:table-cell">{s.class?.name ?? '-'}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-smk-blue border-smk-blue hover:bg-blue-50"
                          onClick={() => setAssignParentStudent(s)}
                        >
                          Lengkapi Wali
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Dialogs */}
      <SiswaFormDialog open={formOpen} onOpenChange={setFormOpen} student={editStudent} classes={classes} />
      <SiswaWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        classes={classes}
        initialLead={ppdbEnrollmentLead}
      />
      <StudentSingleEntrySheet open={singleEntryOpen} onOpenChange={setSingleEntryOpen} classes={classes} />
      <StudentImportDialog open={importOpen} onOpenChange={setImportOpen} classes={classes} />
      <SiswaDeleteDialog student={deleteStudent} onClose={() => setDeleteStudent(null)} />
      {assignParentStudent && (
        <AssignParentDialog
          open={true}
          onOpenChange={(o) => { if (!o) setAssignParentStudent(null); }}
          studentId={assignParentStudent.id}
          studentName={assignParentStudent.user.fullName}
        />
      )}
    </div>
  );
}
