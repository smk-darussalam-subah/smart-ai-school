'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { provisionStudentAction } from '../actions';
import {
  getRecommendedClassId,
  isRecommendedClassForLead,
  sortClassesForEnrollmentLead,
  type PpdbEnrollmentLead,
  toWizardInitialValues,
} from './ppdb-enrollment-handoff';

interface ClassItem { id: string; name: string; grade?: number; majorCode?: string | null; }

interface TempCredential {
  username: string;
  tempPassword: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classes: ClassItem[];
  initialLead?: PpdbEnrollmentLead | null;
}

type Step = 1 | 2 | 3 | 4;

export default function SiswaWizard({ open, onOpenChange, classes, initialLead }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [nis, setNis] = useState('');
  const [siswaName, setSiswaName] = useState('');
  const [siswaGender, setSiswaGender] = useState<'L' | 'P' | ''>('');
  const [classId, setClassId] = useState('');

  const [ortuName, setOrtuName] = useState('');
  const [ortuPhone, setOrtuPhone] = useState('');
  const [ortuEmail, setOrtuEmail] = useState('');
  const [reuseParent, setReuseParent] = useState(false);

  const [consent, setConsent] = useState(false);
  const [credentials, setCredentials] = useState<TempCredential[]>([]);

  const classOptions = useMemo(
    () => sortClassesForEnrollmentLead(initialLead, classes),
    [classes, initialLead],
  );

  useEffect(() => {
    if (!open || !initialLead) return;
    const initial = toWizardInitialValues(initialLead);
    setStep(1);
    setNis('');
    setSiswaName(initial.siswaName);
    setSiswaGender(initial.siswaGender);
    setClassId(getRecommendedClassId(initialLead, classes));
    setOrtuName(initial.ortuName);
    setOrtuPhone(initial.ortuPhone);
    setOrtuEmail(initial.ortuEmail);
    setReuseParent(false);
    setConsent(false);
    setCredentials([]);
    setError('');
    setLoading(false);
  }, [open, initialLead, classes]);

  const resetForm = () => {
    setStep(1);
    setNis('');
    setSiswaName('');
    setSiswaGender('');
    setClassId('');
    setOrtuName('');
    setOrtuPhone('');
    setOrtuEmail('');
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
      case 1: return nis.trim().length >= 1 && siswaName.trim().length >= 1 && classId.trim().length >= 1;
      case 2: return ortuName.trim().length >= 1 && ortuPhone.trim().length >= 1;
      case 3: return consent === true;
      case 4: return true;
      default: return false;
    }
  };

  const handleSubmit = async () => {
    if (!classId) {
      setError('Kelas wajib dipilih sebelum akun siswa dibuat.');
      return;
    }
    setLoading(true);
    setError('');

    const body = {
      siswa: {
        nis,
        fullName: siswaName,
        ...(siswaGender && { gender: siswaGender }),
        classId,
      },
      ...(initialLead?.id ? { ppdbLeadId: initialLead.id } : {}),
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

  const selectedClass = classes.find((item) => item.id === classId);
  const selectedClassName = selectedClass?.name;
  const hasClassRecommendation = !!selectedClass && isRecommendedClassForLead(initialLead, selectedClass);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-2xl"
        aria-describedby={undefined}
      >
        <DialogHeader className="border-b px-6 pb-4 pt-6 pr-12">
          <DialogTitle>Tambah Siswa Baru</DialogTitle>
          <DialogDescription>
            Langkah {step} dari 4 - {stepLabels[step]}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-6 py-5">
          {initialLead && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              Enrollment PPDB untuk {initialLead.fullName}. Nama, kontak wali, email wali, dan gender diprefill dari lead bila tersedia; NIS, kelas, dan consent tetap diverifikasi operator.
            </div>
          )}

          <div className="mb-4 flex gap-1">
            {([1, 2, 3, 4] as Step[]).map((s) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  s <= step ? 'bg-smk-blue' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>

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
              {siswaGender && (
                <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  Jenis kelamin dari lead PPDB: <span className="font-medium">{siswaGender === 'L' ? 'Laki-laki' : 'Perempuan'}</span>
                </div>
              )}
              <div>
                <Label>Kelas <span className="text-red-500">*</span></Label>
                <Select value={classId || 'none'} onValueChange={(v: string) => setClassId(v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" disabled>-- Pilih Kelas --</SelectItem>
                    {classOptions.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}{isRecommendedClassForLead(initialLead, item) ? ' - sesuai jurusan PPDB' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {initialLead?.interestMajor && (
                  <p className="mt-1 text-xs text-gray-500">
                    Jurusan minat PPDB: {initialLead.interestMajor}. {hasClassRecommendation ? 'Kelas direkomendasikan sudah dipilih otomatis.' : 'Pilih kelas akhir sesuai keputusan panitia.'}
                  </p>
                )}
                {!classId && (
                  <p className="mt-1 text-xs text-red-600">Kelas wajib dipilih agar jadwal, aktivitas kelas, dan kalender siswa langsung aktif.</p>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="wizard-ortu-name">Nama Orang Tua <span className="text-red-500">*</span></Label>
                <Input id="wizard-ortu-name" value={ortuName} onChange={(e) => setOrtuName(e.target.value)} required placeholder="Nama lengkap orang tua/wali" />
              </div>
              <div>
                <Label htmlFor="wizard-ortu-phone">Nomor Telepon <span className="text-red-500">*</span></Label>
                <Input id="wizard-ortu-phone" value={ortuPhone} onChange={(e) => setOrtuPhone(e.target.value)} required placeholder="+6281234567890" />
                <p className="mt-1 text-xs text-gray-400">Format E.164 (diawali kode negara)</p>
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

          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                <h4 className="mb-2 font-medium text-yellow-800">Konfirmasi Persetujuan Data</h4>
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

              <div className="space-y-1 rounded-lg border bg-gray-50 p-4 text-sm">
                <h4 className="mb-2 font-medium">Ringkasan Data</h4>
                <p><span className="text-gray-500">NIS:</span> {nis}</p>
                <p><span className="text-gray-500">Nama Siswa:</span> {siswaName}</p>
                {siswaGender && <p><span className="text-gray-500">Jenis Kelamin:</span> {siswaGender === 'L' ? 'Laki-laki' : 'Perempuan'}</p>}
                <p><span className="text-gray-500">Kelas:</span> {selectedClassName ?? 'Wajib dipilih'}</p>
                <p><span className="text-gray-500">Nama Orang Tua:</span> {ortuName}</p>
                <p><span className="text-gray-500">Telepon Orang Tua:</span> {ortuPhone}</p>
                {ortuEmail && <p><span className="text-gray-500">Surel Orang Tua:</span> {ortuEmail}</p>}
                {reuseParent && <p className="text-blue-600">Akun orang tua yang sudah ada akan digunakan</p>}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <h4 className="mb-2 font-medium text-green-800">Akun Berhasil Dibuat</h4>
                <p className="text-sm text-green-700">
                  Akun siswa dan orang tua/wali telah berhasil dibuat di sistem.
                  Berikut kredensial sementara yang harus disampaikan kepada pengguna:
                </p>
              </div>

              {credentials.map((cred, idx) => (
                <div key={idx} className="space-y-2 rounded-lg border bg-gray-50 p-4">
                  <h5 className="text-sm font-medium">{idx === 0 && credentials.length > 1 ? 'Orang Tua/Wali' : 'Siswa'}</h5>
                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <span className="text-gray-500">Nama Pengguna:</span>
                      <p className="break-all font-mono font-medium">{cred.username}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Kata Sandi Sementara:</span>
                      <p className="break-all font-mono font-medium">{cred.tempPassword}</p>
                    </div>
                  </div>
                </div>
              ))}

              <p className="text-xs text-gray-500">
                Harap sampaikan kredensial ini secara aman kepada pengguna. Mereka akan diminta mengubah kata sandi saat masuk pertama kali.
              </p>
            </div>
          )}

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-between border-t bg-white px-6 py-4">
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
