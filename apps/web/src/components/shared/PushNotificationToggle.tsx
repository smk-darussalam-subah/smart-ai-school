'use client';

// =============================================================================
// PushNotificationToggle — T3-03: PWA push subscription UI.
// Shows "Aktifkan Notifikasi" button in student/parent account sheets.
// Uses browser Push API + service worker to subscribe, then sends to backend.
// Backend: POST /push/subscribe, POST /push/unsubscribe
//
// RESOLVED R-22: GET /push/my-notifications is consumed when subscribed.
// Shows recent notification history (absence alerts, grade notifications, etc.).
// =============================================================================

import { useState, useEffect } from 'react';
import { Bell, BellOff, Loader2, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import {
  isPushSupported,
  subscribeToPush,
  getPushPermission,
  ensureServiceWorker,
  initializePushSubscription,
  reconcilePushSubscription,
  suppressPushSubscription,
  type PushRegistrationResult,
} from '@/lib/push';
import { isInstalledExperience } from '@/lib/pwa-preferences';

interface NotificationEntry {
  id: string;
  channel: string;
  subject: string | null;
  body: string;
  status: string;
  sentAt: string | null;
  refType: string | null;
  createdAt: string;
}

interface PushNotificationToggleProps {
  /** Called when subscription succeeds — sends DTO to backend via server action */
  onSubscribe: (dto: { endpoint: string; keys: { p256dh: string; auth: string } }) => Promise<PushRegistrationResult>;
  /** Called when unsubscribe succeeds — sends endpoint to backend */
  onUnsubscribe: (endpoint: string) => Promise<boolean>;
  /** Fetch notification history (GET /push/my-notifications via server action) */
  onFetchNotifications?: () => Promise<NotificationEntry[] | null>;
}

type SubState =
  | 'checking'
  | 'browser'
  | 'unsupported'
  | 'loading'
  | 'subscribed'
  | 'unsubscribed'
  | 'denied'
  | 'reconcile-failed'
  | 'disable-failed';

export default function PushNotificationToggle({ onSubscribe, onUnsubscribe, onFetchNotifications }: PushNotificationToggleProps) {
  // Start with 'checking' — don't call isPushSupported() during render
  // to avoid SSR hydration mismatch (window undefined on server).
  const [state, setState] = useState<SubState>('checking');
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let active = true;
    void initializePushSubscription({
      installed: isInstalledExperience(),
      supported: isPushSupported(),
      permission: getPushPermission(),
      ensureRegistration: ensureServiceWorker,
      registerOnServer: onSubscribe,
    }).then((nextState) => {
      if (active) setState(nextState);
    });
    return () => {
      active = false;
    };
  }, [onSubscribe]);

  const handleToggle = async () => {
    if (state === 'subscribed' || state === 'disable-failed') {
      // Unsubscribe
      setState('loading');
      const sub = await navigator.serviceWorker?.ready
        .then((r) => r.pushManager.getSubscription())
        .catch(() => null);
      if (!sub) {
        setState('unsubscribed');
        setNotifications([]);
        return;
      }
      const suppressed = await suppressPushSubscription(sub, onUnsubscribe);
      setState(suppressed ? 'unsubscribed' : 'disable-failed');
      if (suppressed) setNotifications([]);
    } else if (state === 'unsubscribed' || state === 'reconcile-failed') {
      // Subscribe
      setState('loading');
      const sub = await subscribeToPush();
      if (!sub) {
        const perm = getPushPermission();
        setState(perm === 'denied' ? 'denied' : 'unsubscribed');
        return;
      }
      const result = await reconcilePushSubscription({ subscription: sub, registerOnServer: onSubscribe });
      setState(result);
      // R-22: Fetch notification history on successful subscribe
      if (result === 'subscribed' && onFetchNotifications) {
        const hist = await onFetchNotifications();
        if (hist) setNotifications(hist);
      }
    }
  };

  // R-22: Fetch notification history when showHistory is toggled
  useEffect(() => {
    if (showHistory && state === 'subscribed' && notifications.length === 0 && onFetchNotifications) {
      onFetchNotifications().then((h) => { if (h) setNotifications(h); });
    }
  }, [showHistory, state, notifications.length, onFetchNotifications]);

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

  if (state === 'browser') {
    return (
      <div className="mb-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
        <span className="flex items-center gap-2 font-bold text-[var(--text)]">
          <ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden="true" />
          Mode browser perangkat bersama
        </span>
        <p className="mt-1 text-xs leading-5">
          Notifikasi hanya tersedia pada DIIS yang dipasang sebagai aplikasi di perangkat pribadi.
        </p>
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

  if (state === 'reconcile-failed' || state === 'disable-failed') {
    const disabling = state === 'disable-failed';
    return (
      <div
        role="alert"
        className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-[var(--text)]"
      >
        <span className="flex items-center gap-2 font-bold">
          <BellOff className="h-4 w-4 text-amber-600" aria-hidden="true" />
          {disabling ? 'Notifikasi belum dinonaktifkan' : 'Notifikasi belum terhubung'}
        </span>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
          {disabling
            ? 'Server dan browser belum mengonfirmasi penghentian notifikasi. Coba lagi.'
            : 'Sambungan akun belum berhasil. Coba lagi agar notifikasi terikat ke akun ini.'}
        </p>
        <button
          type="button"
          onClick={handleToggle}
          className="mt-2 min-h-11 rounded-md border border-amber-600/40 px-3 py-2 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  const isLoading = state === 'loading';

  return (
    <div className="mb-2">
      <button
        onClick={handleToggle}
        disabled={isLoading}
        className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface2)] disabled:opacity-50"
      >
        <span className="flex items-center gap-2">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : state === 'subscribed' ? <Bell className="h-4 w-4 text-emerald-500" /> : <Bell className="h-4 w-4" />}
          {state === 'subscribed' ? 'Notifikasi Aktif' : 'Aktifkan Notifikasi'}
        </span>
        <span className="text-xs text-[var(--muted)]">
          {state === 'subscribed' ? 'Ketuk untuk menonaktifkan' : 'Notifikasi absensi via PWA'}
        </span>
      </button>
      {state === 'subscribed' && onFetchNotifications && (
        <div className="mt-1">
          <button
            onClick={() => setShowHistory((s) => !s)}
            className="flex w-full items-center justify-between rounded-lg px-4 py-2 text-xs font-bold text-[var(--muted)] transition-colors hover:bg-[var(--surface2)]"
          >
            <span>Riwayat Notifikasi ({notifications.length})</span>
            {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {showHistory && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
              {notifications.length === 0 ? (
                <p className="py-3 text-center text-xs text-[var(--muted)]">Belum ada notifikasi.</p>
              ) : (
                <div className="space-y-2">
                  {notifications.slice(0, 10).map((n) => (
                    <div key={n.id} className="border-b border-[var(--border)] pb-2 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-[var(--text)]">{n.subject ?? n.refType ?? 'Notifikasi'}</span>
                        <span className="text-[10px] text-[var(--muted)]">{new Date(n.createdAt).toLocaleDateString('id', { day: 'numeric', month: 'short' })}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-[var(--muted)] line-clamp-2">{n.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
