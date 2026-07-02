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

type SubState = 'unsupported' | 'loading' | 'subscribed' | 'unsubscribed' | 'denied';

export default function PushNotificationToggle({ onSubscribe, onUnsubscribe }: PushNotificationToggleProps) {
  const [state, setState] = useState<SubState>('loading');
  const supported = isPushSupported();

  useEffect(() => {
    if (!supported) {
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
  }, [supported]);

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
        // User denied or error
        const perm = getPushPermission();
        setState(perm === 'denied' ? 'denied' : 'unsubscribed');
        return;
      }
      const dto = subscriptionToDto(sub);
      const ok = await onSubscribe(dto);
      setState(ok ? 'subscribed' : 'unsubscribed');
    }
  };

  if (state === 'unsupported') {
    return (
      <div className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--muted)] opacity-60">
        <span className="flex items-center gap-2">
          <BellOff className="h-4 w-4" />
          Notifikasi Push
        </span>
        <span className="text-xs">Browser tidak mendukung</span>
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--muted)]">
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
