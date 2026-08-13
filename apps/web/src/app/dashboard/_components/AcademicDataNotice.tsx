import React from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  href: string;
  message?: string;
}

export default function AcademicDataNotice({
  href,
  message = 'Data akademik belum dapat dimuat. Periksa koneksi atau hak akses, lalu coba lagi.',
}: Props) {
  return (
    <div className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-amber-950" role="alert">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p className="text-sm font-medium">{message}</p>
        </div>
        <Button asChild size="sm" variant="outline" className="self-start border-amber-300 bg-white sm:self-auto">
          <Link href={href}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Muat ulang
          </Link>
        </Button>
      </div>
    </div>
  );
}
