'use client';

/**
 * GlassLoginCard — Honest SSO gateway for DIIS auth experience.
 *
 * Auth flow: Keycloak OAuth redirect (same as /login page).
 * Single action button triggers signIn('keycloak') → redirect to Keycloak.
 *
 * Design rationale:
 * - No form fields = no deception. User knows exactly what happens.
 * - No autoComplete = password managers won't save to a void.
 * - Premium glassmorphism container preserves visual quality.
 * - Helper text sets expectations before the redirect.
 *
 * Features:
 * - Glassmorphism styling (backdrop-blur, semi-transparent bg, border glow)
 * - Compact DIIS logo (distinct from AuthBranding's hero logo)
 * - Single "Masuk dengan Akun Sekolah" button → Keycloak OAuth redirect
 * - Offline detection via shared useOnlineStatus hook
 * - Keyboard accessible (Enter to submit)
 * - ARIA labels, focus ring
 */
import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { ArrowRight, WifiOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useOnlineStatus } from './useOnlineStatus';

type FormState = 'idle' | 'loading' | 'offline';

export function GlassLoginCard() {
  const isOnline = useOnlineStatus();
  const [formState, setFormState] = useState<FormState>('idle');

  // Sync offline state from shared hook
  useEffect(() => {
    if (!isOnline && formState === 'idle') setFormState('offline');
    if (isOnline && formState === 'offline') setFormState('idle');
  }, [isOnline, formState]);

  const handleLogin = async () => {
    if (!isOnline) {
      setFormState('offline');
      return;
    }

    setFormState('loading');

    // Keycloak OAuth redirect — same flow as /login page.
    // NextAuth redirects to Keycloak login, then back to /dashboard on success.
    await signIn('keycloak', { callbackUrl: '/dashboard' });
  };

  return (
    <div className="glass-card w-full max-w-[400px] p-8">
      {/* Compact DIIS Logo (distinct role from AuthBranding hero) */}
      <div className="mb-6 flex justify-center">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-600 to-smk-blue shadow-lg animate-breathe"
          style={{ boxShadow: '0 0 24px var(--auth-glow-blue)' }}
        >
          <span className="font-fraunces text-xl font-bold text-white">D</span>
        </div>
      </div>

      {/* Heading */}
      <div className="mb-6 text-center">
        <h2 className="font-fraunces text-xl font-bold text-[var(--auth-text)]">
          Welcome Back
        </h2>
        <p className="mt-1 text-xs text-[var(--auth-muted)]">
          Digital Integrated Information System
        </p>
        <p className="text-[11px] text-[var(--auth-dim)]">
          SMK Darussalam Subah &middot; Smart AI School
        </p>
      </div>

      {/* Offline banner */}
      {formState === 'offline' && (
        <div
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400"
        >
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>Anda sedang offline. Periksa koneksi internet Anda.</span>
        </div>
      )}

      {/* SSO Login Button — honest, single action */}
      <Button
        onClick={handleLogin}
        disabled={formState === 'loading' || formState === 'offline'}
        className={cn(
          'h-12 w-full rounded-xl text-sm font-semibold tracking-wide transition-all duration-200',
          'bg-gradient-to-r from-primary-700 to-smk-blue text-white',
          'hover:from-primary-600 hover:to-primary-700 hover:shadow-lg',
          'focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
          'active:scale-[0.98]',
        )}
        style={{ boxShadow: '0 0 20px var(--auth-glow-blue)' }}
      >
        {formState === 'loading' ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Mengarahkan ke SSO…
          </span>
        ) : (
          <span className="flex items-center gap-2">
            Masuk dengan Akun Sekolah
            <ArrowRight className="h-4 w-4" />
          </span>
        )}
      </Button>

      {/* Helper text — sets expectations */}
      <p className="mt-3 text-center text-[11px] text-[var(--auth-dim)]">
        Anda akan diarahkan ke halaman login SSO sekolah
      </p>

      {/* Divider */}
      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-[var(--auth-border)]" />
        <span className="text-[11px] uppercase tracking-widest text-[var(--auth-dim)]">
          Keycloak SSO
        </span>
        <div className="h-px flex-1 bg-[var(--auth-border)]" />
      </div>

      {/* Footer note */}
      <p className="text-center text-[11px] text-[var(--auth-dim)]">
        Gunakan akun yang telah didaftarkan oleh administrator sekolah.
        <br />
        Butuh bantuan? Hubungi TU sekolah.
      </p>
    </div>
  );
}
