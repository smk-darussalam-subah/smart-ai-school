'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  UserPlus, UploadCloud, FileSpreadsheet, ShieldAlert, Briefcase, Lock,
  Mail, Phone, MapPin, Calendar, IdCard, Tag, Cake, Download, FileUp,
  Check, X, Info, Copy, CheckCircle2, AlertCircle, RotateCcw, Loader2,
  PartyPopper, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  provisionUserAction, provisionUsersBulkAction,
  type ProvisionUserResult, type BulkResult,
} from '../actions';
import {
  CSV_COLUMNS,
  STAFF_ROLES,
  TEMPLATE_BODY,
  TEMPLATE_HEADER,
  TEMPLATE_ROWS,
  parseCsv,
  toProvisionRow,
  validateRaw,
} from './add-user-csv';

const SA_ONLY_ROLES = ['TATA_USAHA', 'KEPALA_SEKOLAH'];

const ROLE_OPTIONS = [
  { value: 'GURU', label: 'Guru' },
  { value: 'TATA_USAHA', label: 'Tata Usaha' },
  { value: 'KEPALA_SEKOLAH', label: 'Kepala Sekolah' },
  { value: 'INDUSTRI', label: 'Industri' },
];

const EMPLOYMENT_OPTIONS = [
  { value: 'GTY', label: 'GTY — Guru Tetap Yayasan' },
  { value: 'GTT', label: 'GTT — Guru Tidak Tetap' },
  { value: 'PTY', label: 'PTY — Pegawai Tetap Yayasan' },
  { value: 'PTT', label: 'PTT — Pegawai Tidak Tetap' },
];

const AUTH_NOTE: Record<string, string> = {
  GURU: 'Dapat dibuat oleh Super Admin & Tata Usaha.',
  TATA_USAHA: 'Hanya dapat dibuat oleh Super Admin.',
  KEPALA_SEKOLAH: 'Hanya dapat dibuat oleh Super Admin.',
  INDUSTRI: 'Dapat dibuat oleh Super Admin & Tata Usaha.',
};

const LEGEND: { icon: typeof Tag; name: string; desc: string }[] = [
  { icon: Tag, name: 'role', desc: 'Wajib. GURU, TATA_USAHA, KEPALA_SEKOLAH, INDUSTRI. Siswa tidak di sini.' },
  { icon: Users, name: 'fullName', desc: 'Wajib. Nama lengkap + gelar bila ada.' },
  { icon: IdCard, name: 'gender', desc: 'Wajib. L = laki-laki, P = perempuan.' },
  { icon: Mail, name: 'email', desc: 'Wajib dan unik. Dipakai sebagai username login.' },
  { icon: Phone, name: 'phone', desc: '08xx atau +62, dinormalkan otomatis.' },
  { icon: Cake, name: 'birthDate', desc: 'Format YYYY-MM-DD.' },
  { icon: IdCard, name: 'niy', desc: 'Nomor Induk Yayasan — pegawai, unik. Kosongkan untuk Industri.' },
  { icon: Briefcase, name: 'employmentStatus', desc: 'Pegawai wajib: GTY/GTT (guru), PTY/PTT (tendik). Kosong utk Industri.' },
  { icon: MapPin, name: 'address', desc: 'Alamat domisili. Pakai tanda kutip bila ada koma.' },
];

interface ParsedRow { raw: Record<string, string>; error: string | null }
interface Props { isSuperAdmin: boolean }
type Mode = 'satuan' | 'import' | 'template';

export default function AddUserDialog({ isSuperAdmin }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('satuan');

  // form satuan
  const [role, setRole] = useState('GURU');
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState('L');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [niy, setNiy] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [employmentStatus, setEmploymentStatus] = useState('GTY');
  const [address, setAddress] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [credential, setCredential] = useState<ProvisionUserResult | null>(null);

  // import
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  const roleOptions = isSuperAdmin
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((r) => r.value === 'GURU' || r.value === 'INDUSTRI');
  const isStaff = STAFF_ROLES.includes(role);
  const saOnly = SA_ONLY_ROLES.includes(role);
  const validCount = parsed.filter((p) => !p.error).length;

  const resetAll = () => {
    setCredential(null); setBulkResult(null); setError(''); setParsed([]); setFileName('');
  };
  const resetForm = () => {
    setFullName(''); setEmail(''); setPhone(''); setNiy(''); setBirthDate(''); setAddress('');
    setGender('L'); setEmploymentStatus('GTY');
  };

  const handleSelectRole = (r: string) => { setRole(r); setCredential(null); setError(''); };

  const handleSubmitSingle = async () => {
    setError(''); setCredential(null); setSubmitting(true);
    const body: Record<string, unknown> = { role, fullName, gender };
    if (email) body.email = email;
    if (phone) body.phone = phone;
    if (birthDate) body.birthDate = birthDate;
    if (address) body.address = address;
    if (isStaff) { if (niy) body.niy = niy; body.employmentStatus = employmentStatus; }
    const res = await provisionUserAction(body);
    setSubmitting(false);
    if (res.error) { setError(res.error); return; }
    if (res.data) { setCredential(res.data); resetForm(); router.refresh(); }
  };

  const handleFile = (file: File) => {
    setBulkResult(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCsv(String(reader.result ?? ''));
      setParsed(rows.map((raw) => ({ raw, error: validateRaw(raw) })));
    };
    reader.readAsText(file);
  };

  const handleSubmitBulk = async () => {
    setError(''); setSubmitting(true);
    const rows = parsed.filter((p) => !p.error).map((p) => toProvisionRow(p.raw));
    const res = await provisionUsersBulkAction(rows);
    setSubmitting(false);
    if (res.error) { setError(res.error); return; }
    if (res.data) { setBulkResult(res.data); router.refresh(); }
  };

  const downloadTemplate = () => {
    const blob = new Blob([`${TEMPLATE_HEADER}\n${TEMPLATE_BODY}\n`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'template-import-pengguna.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const copy = (text: string) => { void navigator.clipboard?.writeText(text); };

  const roleChip = (r: string) => clsx('rounded px-1.5 py-0.5 text-[11px] font-semibold', {
    'bg-orange-100 text-orange-700': r === 'GURU',
    'bg-emerald-100 text-emerald-700': r === 'TATA_USAHA',
    'bg-violet-100 text-violet-700': r === 'KEPALA_SEKOLAH',
    'bg-sky-100 text-sky-700': r === 'INDUSTRI',
  });

  const TABS: { key: Mode; label: string; icon: typeof UserPlus }[] = [
    { key: 'satuan', label: 'Input Satuan', icon: UserPlus },
    { key: 'import', label: 'Import Massal', icon: UploadCloud },
    { key: 'template', label: 'Template File', icon: FileSpreadsheet },
  ];

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { setOpen(o); if (!o) resetAll(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
          <UserPlus className="h-4 w-4" /> Tambah Pengguna
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><UserPlus className="h-5 w-5" /></span>
            Tambah Pengguna
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Buat akun guru, tata usaha, kepala sekolah, atau mitra industri. Siswa dibuat di menu Data Siswa.
            Jabatan diatur terpisah di menu Struktur Organisasi.
          </p>
        </DialogHeader>

        {/* Tabs */}
        <div className="inline-flex flex-wrap gap-1 self-start rounded-xl border bg-gray-50 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setMode(t.key)}
              className={clsx('flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors',
                mode === t.key ? 'bg-emerald-600 text-white shadow' : 'text-gray-500 hover:bg-emerald-50 hover:text-emerald-700')}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {/* ───────── INPUT SATUAN ───────── */}
        {mode === 'satuan' && (credential ? (
          <div className="space-y-3 rounded-2xl border border-dashed border-emerald-300 bg-emerald-50 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <PartyPopper className="h-5 w-5" /> Akun berhasil dibuat — serahkan kredensial ini (tampil sekali).
            </p>
            {credential.tempCredentials.map((c) => (
              <div key={c.username} className="space-y-1 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm">
                <div><span className="text-muted-foreground">Pengguna:</span> <b>{credential.user.fullName}</b></div>
                <div className="flex items-center gap-2">Username: <code className="rounded bg-emerald-50 px-1.5 text-emerald-700">{c.username}</code>
                  <button onClick={() => copy(c.username)} className="text-emerald-600 hover:text-emerald-800"><Copy className="h-3.5 w-3.5" /></button>
                </div>
                <div className="flex items-center gap-2">Password sementara: <code className="rounded bg-emerald-50 px-1.5 text-emerald-700">{c.tempPassword}</code>
                  <button onClick={() => copy(c.tempPassword)} className="text-emerald-600 hover:text-emerald-800"><Copy className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCredential(null)}>
              <UserPlus className="h-4 w-4" /> Tambah lagi
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Role pills */}
            <div>
              <Label className="mb-2 block">Peran <span className="text-red-600">*</span></Label>
              <div className="flex flex-wrap gap-2">
                {roleOptions.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => handleSelectRole(r.value)}
                    className={clsx('flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors',
                      role === r.value
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-700 shadow-[inset_0_0_0_1px_theme(colors.emerald.200)]'
                        : 'border-gray-200 bg-white text-gray-500 hover:bg-emerald-50/50')}
                  >
                    <span className="h-2 w-2 rounded-full bg-current opacity-60" /> {r.label}
                  </button>
                ))}
              </div>
              <div className={clsx('mt-2 flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm',
                saOnly ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800')}>
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {AUTH_NOTE[role]}
              </div>
            </div>

            {/* Fields */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Nama Lengkap <span className="text-red-600">*</span></Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="cth: Ahmad Fauzi, S.Pd" />
              </div>
              <div>
                <Label>Jenis Kelamin <span className="text-red-600">*</span></Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="L">Laki-laki</SelectItem>
                    <SelectItem value="P">Perempuan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Email <span className="text-red-600">*</span></Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@smkdarussalamsubah.sch.id" />
                <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><Mail className="h-3 w-3" /> Wajib & unik. Dipakai sebagai username login.</p>
              </div>
              <div>
                <Label>No. HP</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0812xxxxxxxx" />
                <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><Phone className="h-3 w-3" /> Dinormalkan ke +62 otomatis.</p>
              </div>
              {isStaff && (
                <>
                  <div>
                    <Label>NIY</Label>
                    <Input value={niy} onChange={(e) => setNiy(e.target.value)} placeholder="cth: Y0012" />
                    <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><IdCard className="h-3 w-3" /> Nomor Induk Yayasan (boleh dikosongkan).</p>
                  </div>
                  <div>
                    <Label>Status Kepegawaian <span className="text-red-600">*</span></Label>
                    <Select value={employmentStatus} onValueChange={setEmploymentStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EMPLOYMENT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <div>
                <Label>Tanggal Lahir</Label>
                <div className="relative">
                  <Calendar className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input type="date" className="pl-9" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label>Alamat</Label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-9" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Jl. ... RT/RW, Desa, Kecamatan" />
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
              <Briefcase className="mt-0.5 h-4 w-4 shrink-0" />
              <span><b>Jabatan</b> (Wakasek, Kaprog, BK, Bendahara, dll) diatur di menu Struktur Organisasi sesuai periode.</span>
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Password sementara dibuat otomatis & wajib diganti saat login pertama.</span>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Batal</Button>
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" disabled={submitting || !fullName} onClick={handleSubmitSingle}>
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Memproses…</> : <><Check className="h-4 w-4" /> Buat Akun</>}
              </Button>
            </div>
          </div>
        ))}

        {/* ───────── IMPORT MASSAL ───────── */}
        {mode === 'import' && (
          <div className="space-y-4">
            {/* langkah */}
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ['1', 'Unduh template', 'Isi sesuai kolom.'],
                ['2', 'Unggah file', 'CSV, maks 500 baris.'],
                ['3', 'Periksa & impor', 'Baris error ditandai.'],
              ].map(([n, h, s]) => (
                <div key={n} className="flex items-start gap-2.5 rounded-xl border bg-white px-3.5 py-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-600 text-xs font-bold text-white">{n}</span>
                  <div><p className="text-sm font-semibold">{h}</p><p className="text-xs text-muted-foreground">{s}</p></div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={downloadTemplate}><Download className="h-4 w-4" /> Unduh Template (.csv)</Button>
              <label className="flex cursor-pointer items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm font-medium hover:bg-emerald-50">
                <FileUp className="h-4 w-4" /> Pilih file CSV
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </label>
              {fileName && <span className="text-sm text-muted-foreground">{fileName} · {parsed.length} baris</span>}
            </div>

            {parsed.length > 0 && !bulkResult && (
              <>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {validCount} siap diimpor</span>
                  {parsed.length - validCount > 0 && <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-sm font-medium text-red-700"><AlertCircle className="h-4 w-4" /> {parsed.length - validCount} perlu perbaikan</span>}
                </div>
                <div className="max-h-64 overflow-auto rounded-xl border">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-[11px] uppercase text-muted-foreground">
                      <tr><th className="p-2">#</th><th className="p-2">Status</th><th className="p-2">Peran</th><th className="p-2">Nama</th><th className="p-2">JK</th><th className="p-2">Email</th><th className="p-2">NIY</th></tr>
                    </thead>
                    <tbody>
                      {parsed.map((p, i) => (
                        <tr key={i} className={clsx('border-t', p.error && 'bg-red-50')}>
                          <td className="p-2">{i + 2}</td>
                          <td className="p-2">
                            {p.error
                              ? <span className="inline-flex items-center gap-1 font-medium text-red-700"><X className="h-3.5 w-3.5" /> {p.error}</span>
                              : <span className="inline-flex items-center gap-1 font-medium text-emerald-700"><Check className="h-3.5 w-3.5" /> Valid</span>}
                          </td>
                          <td className="p-2"><span className={roleChip(p.raw.role || '')}>{p.raw.role || '—'}</span></td>
                          <td className="p-2">{p.raw.fullName || '—'}</td>
                          <td className="p-2">{p.raw.gender || '—'}</td>
                          <td className="p-2">{p.raw.email || '—'}</td>
                          <td className="p-2">{p.raw.niy || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" /> Baris error dilewati; baris valid tetap diproses.
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setParsed([]); setFileName(''); }}><RotateCcw className="h-4 w-4" /> Ganti File</Button>
                  <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" disabled={submitting || validCount === 0} onClick={handleSubmitBulk}>
                    {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Mengimpor…</> : <><Users className="h-4 w-4" /> Impor {validCount} Baris Valid</>}
                  </Button>
                </div>
              </>
            )}

            {bulkResult && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {bulkResult.summary.ok} berhasil</span>
                  {bulkResult.summary.fail > 0 && <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-sm font-medium text-red-700"><AlertCircle className="h-4 w-4" /> {bulkResult.summary.fail} gagal</span>}
                </div>
                <div className="max-h-72 overflow-auto rounded-xl border">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-[11px] uppercase text-muted-foreground">
                      <tr><th className="p-2">Status</th><th className="p-2">Detail</th></tr>
                    </thead>
                    <tbody>
                      {bulkResult.results.map((r) => (
                        <tr key={r.index} className={clsx('border-t', r.status === 'error' && 'bg-red-50')}>
                          <td className={clsx('p-2 font-medium', r.status === 'ok' ? 'text-emerald-700' : 'text-red-700')}>{r.status === 'ok' ? 'Berhasil' : 'Gagal'}</td>
                          <td className="p-2 text-xs">
                            {r.status === 'ok'
                              ? <span>{r.user?.fullName} · {r.tempCredentials?.[0]?.username} / <code className="rounded bg-emerald-50 px-1 text-emerald-700">{r.tempCredentials?.[0]?.tempPassword}</code></span>
                              : <span className="text-red-700">{r.error}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">Kredensial sementara tampil sekali — salin sebelum menutup.</p>
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setBulkResult(null); setParsed([]); setFileName(''); }}><RotateCcw className="h-4 w-4" /> Impor lagi</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ───────── TEMPLATE FILE ───────── */}
        {mode === 'template' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Struktur kolom (baris 1 = header, jangan diubah). Unduh, isi di Excel, lalu impor.</p>
            <div className="overflow-auto rounded-xl border shadow-sm">
              <table className="w-full whitespace-nowrap text-[12.5px]">
                <tbody>
                  <tr>
                    <td className="w-9 border bg-gray-100 px-2 py-1 text-center font-semibold text-muted-foreground"> </td>
                    {CSV_COLUMNS.map((_c, i) => <td key={i} className="border bg-emerald-700 px-3 py-1 text-center font-bold text-white">{String.fromCharCode(65 + i)}</td>)}
                  </tr>
                  <tr>
                    <td className="border bg-gray-100 px-2 py-1 text-center font-semibold text-muted-foreground">1</td>
                    {TEMPLATE_HEADER.split(',').map((h) => <td key={h} className="border bg-emerald-50 px-3 py-1 font-bold text-emerald-800">{h}</td>)}
                  </tr>
                  {TEMPLATE_ROWS.map((row, i) => (
                    <tr key={i}>
                      <td className="border bg-gray-100 px-2 py-1 text-center font-semibold text-muted-foreground">{i + 2}</td>
                      {row.map((cell, j) => <td key={j} className="border px-3 py-1">{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {LEGEND.map((l) => (
                <div key={l.name} className="rounded-xl border bg-white px-3.5 py-2.5">
                  <p className="flex items-center gap-1.5 text-[12.5px] font-semibold"><l.icon className="h-3.5 w-3.5 text-emerald-600" /> {l.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{l.desc}</p>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> Baris TATA_USAHA & KEPALA_SEKOLAH hanya dapat diproses oleh Super Admin.
            </div>
            <div className="flex justify-end">
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={downloadTemplate}><Download className="h-4 w-4" /> Unduh Template (.csv)</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
