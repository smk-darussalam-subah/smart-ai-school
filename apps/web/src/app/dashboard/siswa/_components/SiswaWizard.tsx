'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { provisionStudentAction } from '../actions';

interface ClassItem { id: string; name: string; }

interface TempCredential {
  username: string;
  tempPassword: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classes: ClassItem[];
}

type Step = 1 | 2 | 3 | 4;

export default function SiswaWizard({ open, onOpenChange, classes }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Langkah 1: Data siswa
  const [nis, setNis] = useState('');
  const [siswaName, setSiswaName] = useState('');
  const [classId, setClassId] = useState('');

  // Langkah 2: Data orang tua
  const [ortuName, setOrtuName] = useState('');
  const [ortuPhone, setOrtuPhone] = useState('');
  const [ortuEmail, setOrtuEmail] = useState('');
  const [reuseParent, setReuseParent] = useState(false);

  // Langkah 3: Persetujuan
  const [consent, setConsent] = useState(false);

  // Langkah 4: Hasil
  const [credentials, setCredentials] = useState<TempCredential[]>([]);

  const resetForm = () => {
    setStep(1);
    setNis(''); setSiswaName(''); setClassId('');
    setOrtuName(''); setOrtuPhone(''); setOrtuEmail('');
    setReuseParent(false);
    setConsent(false);
    setCredentials([]);
    setError('');
    setLoading(false);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const canNext = (): boolean => {
    switch (step) {
      case 1: return nis.trim().length >= 1 && siswaName.trim().length >= 1;
      case 2: return ortuName.trim().length >= 1 && ortuPhone.trim().length >= 1;
      case 3: return consent === true;
      case 4: return true;
      default: return false;
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    const body = {
      siswa: {
        nis,
        fullName: siswaName,
        ...(classId && classId !== 'none' && { classId }),
      },
      ortu: {
        name: ortuName,
        phone: ortuPhone,
        ...(ortuEmail && { email: ortuEmail }),
      },
      reuseParentByPhone: reuseParent,
      consent: true,
    };

    const result = await provisionStudentAction(body);
    setLoading(false);

    if (result.success) {
      const data = result.data as { tempCredentials?: TempCredential[] };
      setCredentials(data?.tempCredentials ?? []);
      setStep(4);
    } else {
      setError(result.error || 'Gagal membuat akun siswa');
    }
  };

  const stepLabels: Record<Step, string> = {
    1: 'Data Siswa',
    2: 'Data Orang Tua',
    3: 'Persetujuan',
    4: 'Hasil',
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Tambah Siswa Baru</DialogTitle>
          <DialogDescription>
            Langkah {step} dari 4 — {stepLabels[step]}
          </DialogDescription>
        </DialogHeader>

        {/* Indikator langkah */}
        <div className="flex gap-1 mb-4">
          {([1, 2, 3, 4] as Step[]).map((s) => (
            <div
              key={s}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                s <= step ? 'bg-smk-blue' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Langkah 1: Data Siswa */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="wizard-nis">NIS <span className="text-red-500">*</span></Label>
              <Input id="wizard-nis" value={nis} onChange={(e) => setNis(e.target.value)} required minLength={1} maxLength={20} placeholder="Nomor Induk Siswa" />
            </div>
            <div>
              <Label htmlFor="wizard-siswa-name">Nama Lengkap <span className="text-red-500">*</span></Label>
              <Input id="wizard-siswa-name" value={siswaName} onChange={(e) => setSiswaName(e.target.value)} required placeholder="Nama lengkap siswa" />
            </div>
            <div>
              <Label>Kelas</Label>
              <Select value={classId || 'none'} onValueChange={(v: string) => setClassId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Pilih kelas (opsional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- Tanpa Kelas --</SelectItem>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Langkah 2: Data Orang Tua */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="wizard-ortu-name">Nama Orang Tua <span className="text-red-500">*</span></Label>
              <Input id="wizard-ortu-name" value={ortuName} onChange={(e) => setOrtuName(e.target.value)} required placeholder="Nama lengkap orang tua/wali" />
            </div>
            <div>
              <Label htmlFor="wizard-ortu-phone">Nomor Telepon <span className="text-red-500">*</span></Label>
              <Input id="wizard-ortu-phone" value={ortuPhone} onChange={(e) => setOrtuPhone(e.target.value)} required placeholder="+6281234567890" />
              <p className="text-xs text-gray-400 mt-1">Format E.164 (diawali kode negara)</p>
            </div>
            <div>
              <Label htmlFor="wizard-ortu-email">Surel (opsional)</Label>
              <Input id="wizard-ortu-email" type="email" value={ortuEmail} onChange={(e) => setOrtuEmail(e.target.value)} placeholder="ortu@contoh.com" />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="wizard-reuse"
                checked={reuseParent}
                onChange={(e) => setReuseParent(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Label htmlFor="wizard-reuse" className="text-sm font-normal">
                Gunakan akun orang tua yang sudah ada (berdasarkan nomor telepon)
              </Label>
            </div>
          </div>
        )}

        {/* Langkah 3: Persetujuan */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="font-medium text-yellow-800 mb-2">Konfirmasi Persetujuan Data</h4>
              <p className="text-sm text-yellow-700">
                Dengan melanjutkan, Anda menyatakan bahwa persetujuan dari siswa dan orang tua/wali
                untuk memproses data pribadi telah diperoleh sesuai kebijakan privasi sekolah.
                Akun akan dibuat di sistem Keycloak dan database sekolah.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="wizard-consent"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 rounded border-gray-300"
              />
              <Label htmlFor="wizard-consent" className="text-sm font-normal">
                Saya menyatakan bahwa persetujuan data telah diperoleh dari siswa dan/atau orang tua/wali
              </Label>
            </div>

            {/* Ringkasan data */}
            <div className="bg-gray-50 border rounded-lg p-4 text-sm space-y-1">
              <h4 className="font-medium mb-2">Ringkasan Data</h4>
              <p><span className="text-gray-500">NIS:</span> {nis}</p>
              <p><span className="text-gray-500">Nama Siswa:</span> {siswaName}</p>
              <p><span className="text-gray-500">Nama Orang Tua:</span> {ortuName}</p>
              <p><span className="text-gray-500">Telepon Orang Tua:</span> {ortuPhone}</p>
              {ortuEmail && <p><span className="text-gray-500">Surel Orang Tua:</span> {ortuEmail}</p>}
              {reuseParent && <p className="text-blue-600">Akun orang tua yang sudah ada akan digunakan</p>}
            </div>
          </div>
        )}

        {/* Langkah 4: Hasil */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-medium text-green-800 mb-2">Akun Berhasil Dibuat</h4>
              <p className="text-sm text-green-700">
                Akun siswa dan orang tua/wali telah berhasil dibuat di sistem.
                Berikut kredensial sementara yang harus disampaikan kepada pengguna:
              </p>
            </div>

            {credentials.map((cred, idx) => (
              <div key={idx} className="bg-gray-50 border rounded-lg p-4 space-y-2">
                <h5 className="text-sm font-medium">{idx === 0 && credentials.length > 1 ? 'Orang Tua/Wali' : 'Siswa'}</h5>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">Nama Pengguna:</span>
                    <p className="font-mono font-medium">{cred.username}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Kata Sandi Sementara:</span>
                    <p className="font-mono font-medium">{cred.tempPassword}</p>
                  </div>
                </div>
              </div>
            ))}

            <p className="text-xs text-gray-500">
              Harap sampaikan kredensial ini secara aman kepada pengguna. Mereka akan diminta mengubah kata sandi saat masuk pertama kali.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Tombol navigasi */}
        <div className="flex justify-between pt-2">
          <div>
            {step > 1 && step < 4 && (
              <Button type="button" variant="outline" onClick={() => setStep((step - 1) as Step)}>
                Kembali
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step < 3 && (
              <Button
                type="button"
                disabled={!canNext()}
                onClick={() => setStep((step + 1) as Step)}
                className="bg-smk-blue hover:bg-primary-700"
              >
                Lanjut
              </Button>
            )}
            {step === 3 && (
              <Button
                type="button"
                disabled={!canNext() || loading}
                onClick={handleSubmit}
                className="bg-smk-blue hover:bg-primary-700"
              >
                {loading ? 'Memproses...' : 'Buat Akun'}
              </Button>
            )}
            {step === 4 && (
              <Button type="button" onClick={handleClose} className="bg-smk-blue hover:bg-primary-700">
                Selesai
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}