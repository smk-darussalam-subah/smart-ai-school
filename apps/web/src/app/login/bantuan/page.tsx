import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, CircleAlert, LockKeyhole, WifiOff } from 'lucide-react';
import { apiFetchResult } from '@/lib/api';

export const metadata: Metadata = { title: 'Bantuan Masuk DIIS' };

interface PublicSchoolProfile {
  name: string;
  phone: string | null;
  email: string | null;
}
export default async function LoginHelpPage() {
  const profileResult = await apiFetchResult<PublicSchoolProfile>('/school/profile', '');
  const profile = profileResult.status === 'success' ? profileResult.data : null;
  const hasOfficialContact = Boolean(profile?.phone || profile?.email);

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/login" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-slate-700 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Kembali ke masuk</Link>
        <header className="mt-5 border-b border-slate-200 pb-6">
          <p className="text-xs font-semibold uppercase text-emerald-800">Bantuan publik yang aman</p>
          <h1 className="mt-2 text-3xl font-bold">Bantuan masuk DIIS</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Halaman ini tidak menampilkan data akun, role, Appointment, atau informasi internal sekolah.</p>
        </header>

        <div className="divide-y divide-slate-200 border-b border-slate-200">
          <section className="grid gap-3 py-6 sm:grid-cols-[2rem_minmax(0,1fr)]"><WifiOff className="h-5 w-5 text-slate-700" aria-hidden="true" /><div><h2 className="font-bold">Tidak dapat membuka layanan masuk</h2><p className="mt-1 text-sm leading-6 text-slate-600">Periksa koneksi, pastikan alamat situs resmi, lalu coba kembali. Jangan memakai tautan login yang dikirim pihak tidak dikenal.</p></div></section>
          <section className="grid gap-3 py-6 sm:grid-cols-[2rem_minmax(0,1fr)]"><LockKeyhole className="h-5 w-5 text-slate-700" aria-hidden="true" /><div><h2 className="font-bold">Kata sandi atau akun bermasalah</h2><p className="mt-1 text-sm leading-6 text-slate-600">Gunakan pemulihan pada layanan akun sekolah bila tersedia. Administrator tidak akan meminta kata sandi, kode masuk, atau secret melalui chat.</p></div></section>
          <section className="grid gap-3 py-6 sm:grid-cols-[2rem_minmax(0,1fr)]"><CircleAlert className="h-5 w-5 text-slate-700" aria-hidden="true" /><div><h2 className="font-bold">Hubungi bantuan resmi</h2>{hasOfficialContact ? <div className="mt-2 space-y-1 text-sm text-slate-700">{profile?.phone && <p>Telepon sekolah: <span className="font-semibold">{profile.phone}</span></p>}{profile?.email && <p>Email sekolah: <span className="font-semibold">{profile.email}</span></p>}</div> : <p className="mt-1 text-sm leading-6 text-slate-600">Kontak resmi belum tersedia pada profil sistem. Gunakan kanal sekolah yang sebelumnya telah diumumkan; jangan menghubungi nomor pribadi yang tidak terverifikasi.</p>}</div></section>
        </div>
        <p className="mt-6 text-xs leading-5 text-slate-500">{profile?.name ?? 'SMK Darussalam Subah'} · Bantuan ini tidak dapat mengubah akun atau izin.</p>
      </div>
    </main>
  );
}
