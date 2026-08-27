import Link from 'next/link';
import { BookX } from 'lucide-react';

export default function HelpNotFound() {
  return (
    <div className="mx-auto max-w-3xl border-y border-slate-200 py-12 text-center">
      <BookX className="mx-auto h-8 w-8 text-slate-500" aria-hidden="true" />
      <h1 className="mt-3 text-xl font-bold text-slate-950">Panduan tidak tersedia</h1>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Topik tidak ditemukan atau tidak sesuai dengan kewenangan dan konteks aktif Anda.</p>
      <Link href="/dashboard/panduan" className="mt-5 inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700">Kembali ke Pusat Panduan</Link>
    </div>
  );
}
