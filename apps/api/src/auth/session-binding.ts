import { createHash } from 'node:crypto';
import type { KeycloakTokenPayload } from '@smk/auth';

/** Input is a verified JWT only. Never accept the binding from a request body. */
export function verifiedSessionBinding(payload: KeycloakTokenPayload, accessToken: string) {
  const sessionId = payload.sid ?? payload.session_state;
  const kind = sessionId ? 'oidc' : 'token';
  const value = sessionId ?? accessToken;
  return {
    kind,
    id: createHash('sha256')
      .update(JSON.stringify(['diis-session-v1', payload.iss, payload.sub, kind, value]))
      .digest('hex'),
  } as const;
}

/** Stable opaque audit ID makes repeated logout idempotent across instances. */
export function logoutAuditId(binding: string): string {
  return `session-logout-${binding}`;
}
