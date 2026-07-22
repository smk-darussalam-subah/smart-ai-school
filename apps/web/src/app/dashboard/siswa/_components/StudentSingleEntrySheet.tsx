'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { provisionStudentAction } from '../actions';

interface ClassOption {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classes: ClassOption[];
}

const STATUSES = [
  { value: 'active', label: 'Aktif' },
  { value: 'inactive', label: 'Nonaktif' },
  { value: 'graduated', label: 'Lulus' },
  { value: 'dropped', label: 'Keluar' },
];

type Credential = { username: string; tempPassword: string };

export default function StudentSingleEntrySheet({ open, onOpenChange, classes }: Props) {
  const router = useRouter();
  const [nis, setNis] = useState('');
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<'L' | 'P'>('L');
  const [classId, setClassId] = useState('');
  const [joinedAt, setJoinedAt] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState('active');
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [reuseParent, setReuseParent] = useState(true);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [credentials, setCredentials] = useState<Credential[]>([]);

  const reset = () => {
    setNis('');
    setFullName('');
    setGender('L');
    setClassId('');
    setJoinedAt(new Date().toISOString().slice(0, 10));
    setStatus('active');
    setParentName('');
    setParentPhone('');
    setParentEmail('');
    setReuseParent(true);
    setConsent(false);
    setError('');
    setCredentials([]);
  };

  const submit = async () => {
    setError('');
    setCredentials([]);
    if (!consent) {
      setError('Konfirmasi persetujuan data wajib dicentang.');
      return;
    }
    if (!classId) {
      setError('Kelas wajib dipilih sebelum akun siswa dibuat.');
      return;
    }
    setSubmitting(true);
    const siswa: Record<string, unknown> = { nis, fullName, gender, classId, joinedAt, status };
    const body: Record<string, unknown> = {
      siswa,
      ortu: { name: parentName, phone: parentPhone, ...(parentEmail ? { email: parentEmail } : {}) },
      reuseParentByPhone: reuseParent,
      consent: true,
    };
    const result = await provisionStudentAction(body);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const creds = result.data?.tempCredentials as Credential[] | undefined;
    setCredentials(creds ?? []);
    router.refresh();
  };

  return (
    <Sheet open={open} onOpenChange={(next: boolean) => { onOpenChange(next); if (!next) reset(); }}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-3xl">
        <SheetHeader className="pr-8">
          <SheetTitle className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-blue-50 text-smk-blue">
              <UserPlus className="h-5 w-5" />
            </span>
            Input Siswa Satuan
          </SheetTitle>
          <SheetDescription>
            Buat akun siswa dan wali dalam satu langkah dengan NIS, kelas, status, dan consent eksplisit.
          </SheetDescription>
        </SheetHeader>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {credentials.length > 0 ? (
          <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-800">Siswa berhasil dibuat. Kredensial tampil sekali.</p>
            {credentials.map((credential) => (
              <div key={credential.username} className="rounded-md border bg-white p-3 text-sm">
                <div>Username: <code className="rounded bg-slate-100 px-1">{credential.username}</code></div>
                <div>Password sementara: <code className="rounded bg-slate-100 px-1">{credential.tempPassword}</code></div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={reset}>Input siswa lain</Button>
          </div>
        ) : (
          <div className="grid gap-5">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">Identitas Siswa</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="student-nis">NIS</Label>
                  <Input id="student-nis" value={nis} onChange={(e) => setNis(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="student-name">Nama siswa</Label>
                  <Input id="student-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Jenis kelamin</Label>
                  <Select value={gender} onValueChange={(value: 'L' | 'P') => setGender(value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="L">Laki-laki</SelectItem>
                      <SelectItem value="P">Perempuan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Kelas <span className="text-red-600">*</span></Label>
                  <Select value={classId || 'none'} onValueChange={(value: string) => setClassId(value === 'none' ? '' : value)}>
                    <SelectTrigger><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" disabled>Pilih kelas</SelectItem>
                      {classes.map((kelas) => (
                        <SelectItem key={kelas.id} value={kelas.id}>{kelas.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="joined-at">Tanggal masuk</Label>
                  <Input id="joined-at" type="date" value={joinedAt} onChange={(e) => setJoinedAt(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((item) => (
                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">Wali dan Persetujuan</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="parent-name">Nama wali</Label>
                  <Input id="parent-name" value={parentName} onChange={(e) => setParentName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="parent-phone">Telepon wali</Label>
                  <Input id="parent-phone" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="parent-email">Email wali opsional</Label>
                  <Input id="parent-email" type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} />
                </div>
              </div>
              <label className="flex items-start gap-2 rounded-md border bg-slate-50 p-3 text-sm">
                <input type="checkbox" checked={reuseParent} onChange={(e) => setReuseParent(e.target.checked)} className="mt-1" />
                Gunakan akun wali yang sudah ada bila nomor telepon sama.
              </label>
              <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
                Operator telah menerima konfirmasi persetujuan pemrosesan data siswa dan wali.
              </label>
            </section>
          </div>
        )}

        <SheetFooter className="mt-auto gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Tutup</Button>
          {credentials.length === 0 && (
            <Button onClick={submit} disabled={submitting || !nis || !fullName || !classId || !parentName || !parentPhone || !consent} className="bg-smk-blue hover:bg-primary-700">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Simpan Siswa
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
