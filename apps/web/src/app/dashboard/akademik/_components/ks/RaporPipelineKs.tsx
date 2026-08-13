'use client';

import Link from 'next/link';
import { ArrowRight, FileText, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RaporPipelineKsProps {
  academicYear: string;
  semester: number;
}

export default function RaporPipelineKs({ academicYear, semester }: RaporPipelineKsProps) {
  return (
    <section className="space-y-5" aria-labelledby="ks-report-heading">
      <header className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-2 text-emerald-700">
          <FileText className="h-5 w-5" aria-hidden="true" />
          <p className="text-sm font-medium">Rapor Semester</p>
        </div>
        <h2 id="ks-report-heading" className="mt-1 text-xl font-semibold text-slate-950">
          Persetujuan Rapor
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Tahun ajaran {academicYear}, semester {semester}. Seluruh daftar, riwayat, dan keputusan tersedia pada hub Rapor.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.45fr)]">
        <div className="space-y-3">
          <h3 className="font-semibold text-slate-950">Alur kewenangan</h3>
          <ol className="space-y-2 text-sm text-slate-700">
            <li>1. Wali kelas menyiapkan dan memperbarui draft.</li>
            <li>2. Waka Kurikulum memeriksa atau mengembalikan dengan alasan.</li>
            <li>3. Kepala Sekolah menerbitkan rapor yang sudah diperiksa.</li>
            <li>4. TU atau Kepala Sekolah mendistribusikan rapor kepada keluarga.</li>
          </ol>
        </div>
        <aside className="border-l-4 border-emerald-600 bg-emerald-50 p-4">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
            <div>
              <p className="font-semibold text-emerald-950">Mode Kepala Sekolah</p>
              <p className="mt-1 text-sm text-emerald-900">Persetujuan final hanya dilakukan setelah pemeriksaan Waka Kurikulum.</p>
            </div>
          </div>
        </aside>
      </div>

      <Button asChild>
        <Link href="/dashboard/rapor">
          Buka hub Rapor
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
    </section>
  );
}
