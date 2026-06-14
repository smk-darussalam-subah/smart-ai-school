'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  provisionUserAction,
  provisionUsersBulkAction,
  type ProvisionUserResult,
  type BulkResult,
} from '../actions';

const STAFF_ROLES = ['GURU', 'TATA_USAHA', 'KEPALA_SEKOLAH'];

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'GURU', label: 'Guru' },
  { value: 'TATA_USAHA', label: 'Tata Usaha' },
  { value: 'KEPALA_SEKOLAH', label: 'Kepala Sekolah' },
  { value: 'INDUSTRI', label: 'Industri' },
];

const EMPLOYMENT_OPTIONS: { value: string; label: string }[] = [
  { value: 'GTY', label: 'GTY — Guru Tetap Yayasan' },
  { value: 'GTT', label: 'GTT — Guru Tidak Tetap' },
  { value: 'PTY', label: 'PTY — Pegawai Tetap Yayasan' },
  { value: 'PTT', label: 'PTT — Pegawai Tidak Tetap' },
];

const CSV_COLUMNS = ['role', 'fullName', 'gender', 'email', 'phone', 'birthDate', 'niy', 'employmentStatus', 'address'] as const;

const TEMPLATE_HEADER = 'role,fullName,gender,birthDate,niy,employmentStatus,phone,address';
const TEMPLATE_BODY = [
  'GURU,Ahmad Fauzi,L,1985-01-01,Y0012,GTY,081234567890,"Jl. Merdeka No. 1, Subah"',
  'TATA_USAHA,Budi Santoso,L,1988-07-20,Y0101,PTY,081211112222,"Jl. Raya Subah No. 9"',
].join('\n');

interface Props {
  /** true = Super Admin (boleh buat semua peran), false = TU (hanya GURU/INDUSTRI) */
  isSuperAdmin: boolean;
}

// ── CSV parser ringan (mendukung field ber-kutip dengan koma) ─────────────────
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuote = false;
      } else cur += c;
    } else if (c === ',') { out.push(cur); cur = ''; }
    else if (c === '"') inQuote = true;
    else cur += c;
  }
  out.push(cur);
  return out;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]!).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
}

function toProvisionRow(r: Record<string, string>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k of CSV_COLUMNS) {
    const v = r[k]?.trim();
    if (v) o[k] = v;
  }
  return o;
}

export default function AddUserDialog({ isSuperAdmin }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'satuan' | 'import'>('satuan');

  // ── Form satuan ──
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

  // ── Import ──
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  const roleOptions = isSuperAdmin
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((r) => r.value === 'GURU' || r.value === 'INDUSTRI');
  const isStaff = STAFF_ROLES.includes(role);

  const resetForm = () => {
    setFullName(''); setEmail(''); setPhone(''); setNiy(''); setBirthDate(''); setAddress('');
    setGender('L'); setEmploymentStatus('GTY');
  };

  const handleSubmitSingle = async () => {
    setError('');
    setCredential(null);
    setSubmitting(true);
    const body: Record<string, unknown> = { role, fullName, gender };
    if (email) body.email = email;
    if (phone) body.phone = phone;
    if (birthDate) body.birthDate = birthDate;
    if (address) body.address = address;
    if (isStaff) { body.niy = niy; body.employmentStatus = employmentStatus; }

    const res = await provisionUserAction(body);
    setSubmitting(false);
    if (res.error) { setError(res.error); return; }
    if (res.data) { setCredential(res.data); resetForm(); router.refresh(); }
  };

  const handleFile = (file: File) => {
    setBulkResult(null);
    const reader = new FileReader();
    reader.onload = () => setCsvRows(parseCsv(String(reader.result ?? '')));
    reader.readAsText(file);
  };

  const handleSubmitBulk = async () => {
    setError('');
    setSubmitting(true);
    const rows = csvRows.map(toProvisionRow);
    const res = await provisionUsersBulkAction(rows);
    setSubmitting(false);
    if (res.error) { setError(res.error); return; }
    if (res.data) { setBulkResult(res.data); router.refresh(); }
  };

  const downloadTemplate = () => {
    const blob = new Blob([`${TEMPLATE_HEADER}\n${TEMPLATE_BODY}\n`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template-import-pengguna.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { setOpen(o); if (!o) { setCredential(null); setBulkResult(null); setError(''); setCsvRows([]); } }}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">+ Tambah Pengguna</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tambah Pengguna</DialogTitle>
        </DialogHeader>

        {/* Tab switch */}
        <div className="inline-flex gap-1 rounded-lg border bg-gray-50 p-1 text-sm">
          <button
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${mode === 'satuan' ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-emerald-700'}`}
            onClick={() => setMode('satuan')}
          >Input Satuan</button>
          <button
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${mode === 'import' ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-emerald-700'}`}
            onClick={() => setMode('import')}
          >Import Massal</button>
        </div>

        {error && <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

        {/* ── INPUT SATUAN ── */}
        {mode === 'satuan' && (
          credential ? (
            <div className="space-y-3 rounded-xl border border-dashed border-emerald-300 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-700">Akun berhasil dibuat — serahkan kredensial ini ke ybs (tampil sekali).</p>
              <div className="space-y-2">
                {credential.tempCredentials.map((c) => (
                  <div key={c.username} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm">
                    <div>Pengguna: <b>{credential.user.fullName}</b></div>
                    <div>Username: <code className="rounded bg-emerald-50 px-1.5 text-emerald-700">{c.username}</code></div>
                    <div>Password sementara: <code className="rounded bg-emerald-50 px-1.5 text-emerald-700">{c.tempPassword}</code></div>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={() => setCredential(null)}>Tambah lagi</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>Peran *</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Jenis Kelamin *</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="L">Laki-laki</SelectItem>
                      <SelectItem value="P">Perempuan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label>Nama Lengkap *</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="cth: Ahmad Fauzi, S.Pd" />
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@smkdarussalamsubah.sch.id" />
                </div>
                <div>
                  <Label>No. HP</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0812xxxxxxxx" />
                </div>
                {isStaff && (
                  <>
                    <div>
                      <Label>NIY</Label>
                      <Input value={niy} onChange={(e) => setNiy(e.target.value)} placeholder="cth: Y0012" />
                    </div>
                    <div>
                      <Label>Status Kepegawaian *</Label>
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
                  <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Alamat</Label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Jl. ... RT/RW, Desa, Kecamatan" />
                </div>
              </div>
              <p className="text-xs text-gray-400">Jabatan (Wakasek/Kaprog/BK/Bendahara dll) diatur terpisah di menu Struktur Organisasi sesuai periode.</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Batal</Button>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={submitting || !fullName} onClick={handleSubmitSingle}>
                  {submitting ? 'Memproses…' : 'Buat Akun'}
                </Button>
              </div>
            </div>
          )
        )}

        {/* ── IMPORT MASSAL ── */}
        {mode === 'import' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={downloadTemplate}>Unduh Template (.csv)</Button>
              <label className="cursor-pointer rounded-md border bg-white px-3 py-1.5 text-sm font-medium hover:bg-emerald-50">
                Pilih file CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </label>
              {csvRows.length > 0 && <span className="text-sm text-gray-500">{csvRows.length} baris terbaca</span>}
            </div>

            {csvRows.length > 0 && !bulkResult && (
              <>
                <div className="max-h-64 overflow-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                      <tr><th className="p-2">Peran</th><th className="p-2">Nama</th><th className="p-2">JK</th><th className="p-2">Email</th><th className="p-2">NIY</th><th className="p-2">Status</th></tr>
                    </thead>
                    <tbody>
                      {csvRows.map((r, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">{r.role}</td><td className="p-2">{r.fullName}</td><td className="p-2">{r.gender}</td>
                          <td className="p-2">{r.email || '—'}</td><td className="p-2">{r.niy || '—'}</td><td className="p-2">{r.employmentStatus || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCsvRows([])}>Ganti File</Button>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={submitting} onClick={handleSubmitBulk}>
                    {submitting ? 'Mengimpor…' : `Impor ${csvRows.length} Baris`}
                  </Button>
                </div>
              </>
            )}

            {bulkResult && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 text-sm">
                  <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">{bulkResult.summary.ok} berhasil</span>
                  {bulkResult.summary.fail > 0 && <span className="rounded-full bg-red-50 px-3 py-1 font-medium text-red-700">{bulkResult.summary.fail} gagal</span>}
                </div>
                <div className="max-h-72 overflow-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                      <tr><th className="p-2">Baris</th><th className="p-2">Status</th><th className="p-2">Detail</th></tr>
                    </thead>
                    <tbody>
                      {bulkResult.results.map((r) => (
                        <tr key={r.index} className={`border-t ${r.status === 'error' ? 'bg-red-50' : ''}`}>
                          <td className="p-2">{r.index + 2}</td>
                          <td className={`p-2 font-medium ${r.status === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>{r.status === 'ok' ? 'Berhasil' : 'Gagal'}</td>
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
                <p className="text-xs text-gray-400">Kredensial sementara tampil sekali — salin sebelum menutup. Baris gagal bisa diperbaiki lalu diimpor ulang.</p>
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => { setBulkResult(null); setCsvRows([]); }}>Impor lagi</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
