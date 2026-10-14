'use client';

import React, {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { SessionRecoveryNotice } from './SessionRecoveryNotice';

export const AuthRecoveryContext = createContext<{
  blocked: boolean;
  notice: ComponentProps<typeof SessionRecoveryNotice>;
} | null>(null);

export function useAuthRecovery() {
  return useContext(AuthRecoveryContext);
}

/** Portal content does not inherit DOM hidden/inert from the workspace.
 * Keep its form mounted and put recovery INSIDE the existing modal focus scope.
 * Do not remove the modal, its draft, or its pointer/focus protections. */
export function AuthRecoverySurface({ children }: { children: ReactNode }) {
  const recovery = useAuthRecovery();
  const recoveryRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const blocked = recovery?.blocked ?? false;
  useLayoutEffect(() => {
    if (blocked) {
      previousFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      recoveryRef.current?.querySelector<HTMLElement>('button:not(:disabled), a[href]')?.focus();
    } else if (previousFocus.current?.isConnected) {
      previousFocus.current.focus();
      previousFocus.current = null;
    }
  }, [blocked]);
  return (
    <>
      <div
        hidden={blocked}
        inert={blocked || undefined}
        className={blocked ? 'hidden' : 'contents'}
      >
        {children}
      </div>
      {blocked && recovery && (
        <div ref={recoveryRef}>
          <SessionRecoveryNotice {...recovery.notice} embedded />
        </div>
      )}
    </>
  );
}
