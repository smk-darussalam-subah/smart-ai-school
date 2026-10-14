'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { sessionRecoveryAction } from '@/lib/auth-session-state';
import { SessionRecoveryNotice } from './SessionRecoveryNotice';
import { AuthRecoveryContext } from './AuthRecoveryContext';

/** Only definitive failure or identity change triggers automatic navigation.
 * An outage keeps the workspace mounted until an explicit recovery action.
 * All hooks run regardless of session state. */
export function AuthSessionBoundary({ children }: { children: React.ReactNode }) {
  const { data: session, status, update } = useSession();
  const [now, setNow] = useState(Date.now);
  const [recovering, setRecovering] = useState(false);
  const navigating = useRef(false);
  const probeAttempted = useRef(false);
  const probeInFlight = useRef(false);
  const originalIdentity = useRef(session?.keycloakId);
  const expired =
    typeof session?.accessTokenExpiresAt === 'number' && session.accessTokenExpiresAt * 1000 <= now;
  const temporary = session?.error === 'RefreshAccessTokenTemporaryError';
  const recovery = sessionRecoveryAction(status, session?.error, expired);
  const identityChanged = Boolean(
    originalIdentity.current &&
    session?.keycloakId &&
    originalIdentity.current !== session.keycloakId,
  );
  const blocked = Boolean(recovery || expired || (temporary && !session?.accessToken));
  const probe = useCallback(async () => {
    // NextAuth v4 update() is a no-op without a session. A nullable session uses
    // the explicit writable-boundary link instead; do not fake SDK internals.
    if (!session || probeInFlight.current) return;
    probeInFlight.current = true;
    setRecovering(true);
    try {
      await update();
    } catch {
      /* Preserve inputs; an outage is not revocation. */
    } finally {
      probeInFlight.current = false;
      setRecovering(false);
    }
  }, [update, session]);
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) setNow(Date.now());
    };
    const timer = window.setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  useEffect(() => {
    if (navigating.current) return;
    if (identityChanged || recovery === 'LOGIN') {
      navigating.current = true;
      const callback = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(
        identityChanged ? '/dashboard' : `/login?reason=session&callbackUrl=${callback}`,
      );
    } else if (recovery === 'REFRESH' && session && !probeAttempted.current) {
      probeAttempted.current = true;
      void probe(); // The session endpoint persists cookies without discarding form state.
    } else if (!blocked) probeAttempted.current = false;
  }, [recovery, identityChanged, blocked, probe, session]);
  if (identityChanged || recovery === 'LOGIN')
    return (
      <SessionRecoveryNotice message="Sesi sedang dialihkan ke halaman masuk. Jika halaman tidak berpindah, gunakan pilihan di bawah." />
    );
  const notice = {
    message: temporary
      ? 'Layanan akun sekolah sementara belum tersedia. Tunggu sekitar 30 detik, lalu coba lagi.'
      : session
        ? 'Sesi sedang dipulihkan. Jika halaman tidak berpindah, gunakan pilihan di bawah.'
        : 'Koneksi sesi belum dapat dipastikan. Isian tetap dipertahankan selama menunggu. Memuat ulang halaman dapat menghapus isian yang belum disimpan.',
    onRetry: session ? () => void probe() : undefined,
    busy: recovering,
  };
  return (
    <AuthRecoveryContext.Provider value={{ blocked, notice }}>
      <div hidden={blocked} inert={blocked || undefined}>
        {children}
      </div>
      {blocked && <SessionRecoveryNotice {...notice} />}
    </AuthRecoveryContext.Provider>
  );
}
