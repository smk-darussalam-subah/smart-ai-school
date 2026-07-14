// =============================================================================
// Consent Page — PDP LoA (Letter of Agreement)
// Displayed on first login (or after consent reset) before dashboard access.
// User must scroll through and accept the LoA to proceed.
// =============================================================================

import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getLoaClauses } from './loa-content';
import { recordConsentAction } from './actions';
import { CURRENT_CONSENT_VERSION } from '@/lib/constants';
import { Shield } from 'lucide-react';

export default async function ConsentPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const role = session.roles?.[0] ?? 'SISWA';
  const clauses = getLoaClauses(role);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-primary text-primary-foreground px-6 py-5">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8" />
            <div>
              <h1 className="text-xl font-bold">Persetujuan Pengolahan Data Pribadi</h1>
              <p className="text-sm opacity-90">
                UU No. 27 Tahun 2022 — Sistem DIIS v{CURRENT_CONSENT_VERSION}
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable LoA Content */}
        <div className="max-h-[50vh] overflow-y-auto px-6 py-5 space-y-4 text-sm leading-relaxed">
          <p className="text-muted-foreground">
            Sebelum menggunakan sistem DIIS, mohon baca dan setujui ketentuan berikut
            terkait pengolahan data pribadi Anda:
          </p>

          {clauses.map((clause, idx) => (
            <div key={idx} className="border-l-2 border-primary/30 pl-4">
              <h3 className="font-semibold text-foreground mb-1">{clause.title}</h3>
              <p className="text-muted-foreground">{clause.body}</p>
            </div>
          ))}

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
            <p className="text-amber-800 text-xs">
              <strong>Perhatian:</strong> Anda harus menyetujui ketentuan ini untuk
              dapat mengakses sistem DIIS. Jika tidak menyetujui, silakan hubungi
              administrator sekolah.
            </p>
          </div>
        </div>

        {/* Action */}
        <div className="border-t px-6 py-4 bg-slate-50">
          <form action={recordConsentAction}>
            <button
              type="submit"
              className="w-full bg-primary text-primary-foreground font-semibold py-3 px-4 rounded-lg hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Saya Menyetujui Pengolahan Data Pribadi
            </button>
          </form>
          <p className="text-xs text-center text-muted-foreground mt-2">
            Dengan menekan tombol di atas, Anda menyatakan setuju dengan seluruh
            ketentuan pengolahan data pribadi yang tercantum.
          </p>
        </div>
      </div>
    </div>
  );
}
