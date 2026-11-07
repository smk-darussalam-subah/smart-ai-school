'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useRef } from 'react';
import { postSessionActivity } from '@/lib/session-activity-client';

/**
 * LoginEventRecorder — fires a login event once per authenticated session.
 * The JSON endpoint captures request context (IP, UA) without an RSC update.
 */
export function LoginEventRecorder() {
  const { status } = useSession();
  const recorded = useRef(false);

  useEffect(() => {
    if (status === 'authenticated' && !recorded.current) {
      recorded.current = true;
      void postSessionActivity('login'); // fire-and-forget
    }
  }, [status]);

  return null; // renders nothing
}
