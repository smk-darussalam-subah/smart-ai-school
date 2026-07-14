'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useRef } from 'react';
import { recordLoginEventAction } from '@/app/dashboard/actions';

/**
 * LoginEventRecorder — fires a login event once per authenticated session.
 * Placed in dashboard layout. Uses server action for full request context (IP, UA).
 */
export function LoginEventRecorder() {
  const { status } = useSession();
  const recorded = useRef(false);

  useEffect(() => {
    if (status === 'authenticated' && !recorded.current) {
      recorded.current = true;
      recordLoginEventAction(); // fire-and-forget
    }
  }, [status]);

  return null; // renders nothing
}
