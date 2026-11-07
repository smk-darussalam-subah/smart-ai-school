'use server';

import { getActionSession as getServerSession } from '@/lib/action-session';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { apiMutate } from '@/lib/api';
import { CURRENT_CONSENT_VERSION } from '@/lib/constants';

/**
 * Record user's acceptance of the LoA (Letter of Agreement).
 * Called from the consent page when user clicks "Saya Menyetujui".
 * On success, redirects to /dashboard.
 */
export async function recordConsentAction(
  _previous: { error: string | null } = { error: null },
): Promise<{ error: string | null }> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    redirect('/login?reason=session');
  }

  const result = await apiMutate<{ id: string; consentVersion: string }>(
    '/auth/consent',
    session.accessToken,
    { method: 'POST', body: { version: CURRENT_CONSENT_VERSION } },
  );

  if (!result) {
    return { error: 'Persetujuan belum tersimpan. Periksa koneksi lalu coba lagi.' };
  }

  redirect('/dashboard');
}
