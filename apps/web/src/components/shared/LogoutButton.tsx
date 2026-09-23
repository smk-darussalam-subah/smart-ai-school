'use client';

import React, { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { beginSharedDeviceLogout } from '@/lib/pwa-logout';

interface LogoutButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'> {
  children: ReactNode;
  busyLabel?: string;
  onLogoutStart?: () => void;
}

export default function LogoutButton({
  children,
  busyLabel = 'Sedang keluar',
  onLogoutStart,
  disabled,
  'aria-label': ariaLabel,
  ...buttonProps
}: LogoutButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const handleLogout = () => {
    if (busy || disabled) return;
    setBusy(true);
    setError(false);
    onLogoutStart?.();
    void beginSharedDeviceLogout((url) => window.location.assign(url)).catch(() => {
      setBusy(false);
      setError(true);
    });
  };

  return (
    <>
      <button
        {...buttonProps}
        type="button"
        onClick={handleLogout}
        disabled={busy || disabled}
        aria-busy={busy}
        aria-label={busy ? busyLabel : ariaLabel}
      >
        {children}
        {busy && <span className="sr-only">{busyLabel}</span>}
      </button>
      {error && (
        <span role="alert" className="block text-xs font-semibold text-red-700">
          Logout belum aman. Coba lagi.
        </span>
      )}
    </>
  );
}
