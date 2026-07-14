'use client';

/**
 * useOnlineStatus — Shared hook for online/offline detection.
 *
 * Used by GlassLoginCard and SystemStatus to avoid duplicating
 * the online/offline event listener logic.
 */
import { useState, useEffect } from 'react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Initialize from current navigator state
    setIsOnline(navigator.onLine);

    function handleOffline() {
      setIsOnline(false);
    }
    function handleOnline() {
      setIsOnline(true);
    }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return isOnline;
}
