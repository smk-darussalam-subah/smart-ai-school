'use client';

// =============================================================================
// PushNotificationToggle — T3-03: PWA push subscription UI.
// Shows "Aktifkan Notifikasi" button in student/parent account sheets.
// Uses browser Push API + service worker to subscribe, then sends to backend.
// Backend: POST /push/subscribe, POST /push/unsubscribe
// =============================================================================

import { useState, useEffect } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  getPushPermission,
  subscriptionToDto,
  ensureServiceWorker,
} from '@/lib/push';

interface PushNotificationToggleProps {
  /** Called when subscription succeeds — sends DTO to backend via server action */
  onSubscribe: (dto: { endpoint: string; keys: { p256dh: string; auth: string } }) => Promise<boolean>;
  /** Called when unsubscribe succeeds — sends endpoint to backend */
  onUnsubscribe: (endpoint: string) => Promise<boolean>;
}

type SubState = 'checking' | 'unsupported' | 'loading' | 'subscribed' | 'unsubscribed' | 'denied';

export default function PushNotificationToggle({ onSubscribe, onUnsubscribe }: PushNotificationToggleProps) {
  // Start with 'checking' — don't call isPushSupported() during render
  // to avoid SSR hydration mismatch (window undefined on server).
  const [state, setState] = useState<SubState>('checking');

  useEffect(() => {
    // Only run on client after mount
    if (!isPushSupported()) {
      setState('unsupported');
      return;
    }
    // Check existing subscription on mount
    const permission = getPushPermission();
    if (permission === 'denied') {
      setState('denied');
      return;
    }
    ensureServiceWorker().then((reg) => {
      if (!reg) {
        setState('unsubscribed');
        return;
      }
      reg.pushManager.getSubscription().then((sub) => {
        setState(sub ? 'subscribed' : 'unsubscribed');
      });
    });
  }, []);

  const handleToggle = async () => {
    if (state === 'subscribed') {
      // Unsubscribe
      setState('loading');
      const sub = await navigator.serviceWorker?.ready
        .then((r) => r.pushManager.getSubscription())
        .catch(() => null);
      const endpoint = sub?.endpoint ?? '';
      await unsubscribeFromPush();
      await onUnsubscribe(endpoint);
      setState('unsubscribed');
    } else if (state === 'unsubscribed') {
      // Subscribe
      setState('loading');
      const sub = await subscribeToPush();
      if (!sub) {
        const perm = getPushPermission();
        setState(perm === 'denied' ? 'denied' : 'unsubscribed');
        return;
      }
      const dto = subscriptionToDto(sub);
      const ok = await onSubscribe(dto);
      setState(ok ? 'subscribed' : 'unsubscribed');
    }
  };

  // During SSR / before client mount: render placeholder skeleton
  // This prevents hydration mismatch (server renders skeleton, client replaces)
  if (state === 'checking') {
    return (
      <div className="mb-2 flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 opacity-50">
        <span className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--muted)]" />
          <span className="text-sm font-medium text-[var(--muted)]">Notifikasi</span>
        </span>
      </div>
    );
  }

  if (state === 'unsupported') {
    return (
      <div className="mb-2 flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--muted)] opacity-60">
        <span className="flex items-center gap-2">
          <BellOff className="h-4 w-4" />
          Notifikasi Push
        </span>
        <span className="text-xs">Belum dikonfigurasi</span>
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="mb-2 flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--muted)]">
        <span className="flex items-center gap-2">
          <BellOff className="h-4 w-4" />
          Notifikasi Diblokir
        </span>
        <span className="text-xs">Aktifkan di pengaturan browser</span>
      </div>
    );
  }

  const isLoading = state === 'loading';

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className="mb-2 flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface2)] disabled:opacity-50"
    >
      <span className="flex items-center gap-2">
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : state === 'subscribed' ? <Bell className="h-4 w-4 text-emerald-500" /> : <Bell className="h-4 w-4" />}
        {state === 'subscribed' ? 'Notifikasi Aktif' : 'Aktifkan Notifikasi'}
      </span>
      <span className="text-xs text-[var(--muted)]">
        {state === 'subscribed' ? 'Ketuk untuk menonaktifkan' : 'Notifikasi absensi via PWA'}
      </span>
    </button>
  );
}
