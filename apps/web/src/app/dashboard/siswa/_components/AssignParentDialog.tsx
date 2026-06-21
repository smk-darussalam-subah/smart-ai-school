'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { assignParentAction } from '../actions';

interface TempCredential {
  username: string;
  tempPassword: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
}

type Step = 1 | 2 | 3;

export default function AssignParentDialog({ open, onOpenChange, studentId, studentName }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [ortuName, setOrtuName] = useState('');
  const [ortuPhone, setOrtuPhone] = useState('');
  const [ortuEmail, setOrtuEmail] = useState('');
  const [reuseParent, setReuseParent] = useState(false);
  const [consent, setConsent] = useState(false);
  const [credentials, setCredentials] = useState<TempCredential[]>([]);

  const reset = () => {
    setStep(1);
    setOrtuName(''); setOrtuPhone(''); setOrtuEmail('');
    setReuseParent(false); setConsent(false);
    setCredentials([]); setError(''); setLoading(false);
  };

  const handleClose = () => { reset(); onOpenChange(false); };

  const canNext = (): boolean => {
    if (step === 1) return ortuName.trim().length >= 1 && ortuPhone.trim().length >= 1;
    if (step === 2) return consent;
    return true;
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    const body = {
      ortu: {
        name: ortuName,
        phone: ortuPhone,
        ...(ortuEmail ? { email: ortuEmail } : {}),
      },
      reuseParentByPhone: reuseParent,
      consent: true,
    };
    const result = await assignParentAction(studentId, body);
    setLoading(false);
    if (result.success) {
      const data = result.data as { tempCredentials?: TempCredential[] };
      setCredentials(data?.tempCredentials ?? []);
      setStep(3);
    } else {
      setError(result.error || 'Gagal menghubungkan orang tua');
    }
  };

  const stepLabels: Record<Step, string> = { 1: 'Data Orang Tua', 2: 'Persetujuan', 3: 'Hasil' };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Lengkapi Wali — {studentName}</DialogTitle>
          <DialogDescription>Langkah {step} dari 3 — {stepLabels[step]}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 mb-4">
          {([1, 2, 3] as Step[]).map((s) => (
            <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${s <= step ? 'bg-smk-blue' : 'bg-gray-200'}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="ap-ortu-name">Nama Orang Tua/Wali <span className="text-red-500">*</span></Label>
              <Input id="ap-ortu-name" value={ortuName} onChange={(e) => setOrtuName(e.target.value)} placeholder="Nama lengkap orang tua/wali" />
            </div>
            <div>
              <Label htmlFor="ap-ortu-phone">Nomor Telepon <span className="text-red-500">*</span></Label>
              <Input id="ap-ortu-phone" value={ortuPhone} onChange={(e) => setOrtuPhone(e.target.value)} placeholder="+6281234567890" />
              <p className="text-xs text-gray-400 mt-1">Format E.164 (diawali kode negara, mis. +628...)</p>
            </div>
            <div>
              <Label htmlFor="ap-ortu-email">Surel (opsional)</Label>
              <Input id="ap-ortu-email" type="email" value={ortuEmail} onChange={(e) => setOrtuEmail(e.target.value)} placeholder="ortu@contoh.com" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="ap-reuse" checked={reuseParent} onChange={(e) => setReuseParent(e.target.checked)} className="rounded border-gray-300" />
              <Label htmlFor="ap-reuse" className="text-sm font-normal">
                Gunakan akun orang tua yang sudah ada (berdasarkan nomor telepon)
              </Label>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="font-medium text-yellow-800 mb-2">Konfirmasi Persetujuan Data</h4>
              <p className="text-sm text-yellow-700">
                Dengan melanjutkan, Anda menyatakan bahwa persetujuan dari orang tua/wali untuk memproses
                data pribadi telah diperoleh sesuai kebijakan privasi sekolah.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <input type="checkbox" id="ap-consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 rounded border-gray-300" />
              <Label htmlFor="ap-consent" className="text-sm font-normal">
                Saya menyatakan bahwa persetujuan data telah diperoleh dari orang tua/wali siswa
              </Label>
            </div>
            <div className="bg-gray-50 border rounded-lg p-4 text-sm space-y-1">
              <h4 className="font-medium mb-2">Ringkasan</h4>
              <p><span className="text-gray-500">Siswa:</span> {studentName}</p>
              <p><span className="text-gray-500">Nama Orang Tua:</span> {ortuName}</p>
              <p><span className="text-gray-500">Telepon:</span> {ortuPhone}</p>
              {ortuEmail && <p><span className="text-gray-500">Surel:</span> {ortuEmail}</p>}
              {reuseParent && <p className="text-blue-600">Akun orang tua yang sudah ada akan digunakan</p>}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-medium text-green-800 mb-2">Berhasil Menghubungkan Wali</h4>
              <p className="text-sm text-green-700">Orang tua/wali siswa {studentName} berhasil dihubungkan.</p>
            </div>
            {credentials.length > 0 && (
              <>
                <p className="text-sm font-medium">Kredensial sementara (sekali tampil):</p>
                {credentials.map((cred, idx) => (
                  <div key={idx} className="bg-gray-50 border rounded-lg p-4 space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-500 block">Nama Pengguna:</span>
                        <p className="font-mono font-medium">{cred.username}</p>
                      </div>
                      <div>
                        <span className="text-gray-500 block">Kata Sandi Sementara:</span>
                        <p className="font-mono font-medium">{cred.tempPassword}</p>
                      </div>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-gray-500">Harap sampaikan kredensial ini kepada orang tua secara aman. Mereka akan diminta mengubah kata sandi saat pertama kali masuk.</p>
              </>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-between pt-2">
          <div>
            {step === 2 && (
              <Button type="button" variant="outline" onClick={() => setStep(1)}>Kembali</Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={handleClose}>Tutup</Button>
            {step === 1 && (
              <Button type="button" disabled={!canNext()} onClick={() => setStep(2)} className="bg-smk-blue hover:bg-primary-700">Lanjut</Button>
            )}
            {step === 2 && (
              <Button type="button" disabled={!canNext() || loading} onClick={handleSubmit} className="bg-smk-blue hover:bg-primary-700">
                {loading ? 'Memproses...' : 'Hubungkan Wali'}
              </Button>
            )}
            {step === 3 && (
              <Button type="button" onClick={handleClose} className="bg-smk-blue hover:bg-primary-700">Selesai</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
