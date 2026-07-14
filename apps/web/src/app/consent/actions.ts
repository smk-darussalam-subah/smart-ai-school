'use server';

import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { apiMutate } from '@/lib/api';
import { CURRENT_CONSENT_VERSION } from '@/lib/constants';

/**
 * Record user's acceptance of the LoA (Letter of Agreement).
 * Called from the consent page when user clicks "Saya Menyetujui".
 * On success, redirects to /dashboard.
 */
export async function recordConsentAction() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    throw new Error('Unauthorized — session expired');
  }

  const result = await apiMutate<{ id: string; consentVersion: string }>(
    '/auth/consent',
    session.accessToken,
    { method: 'POST', body: { version: CURRENT_CONSENT_VERSION } },
  );

  if (!result) {
    throw new Error('Failed to record consent');
  }

  redirect('/dashboard');
}
