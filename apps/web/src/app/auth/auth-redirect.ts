import { safeLoginCallback } from '../login/login-ui';

export interface LegacyAuthParams {
  callbackUrl?: string | string[];
  reason?: string | string[];
  error?: string | string[];
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function buildLegacyAuthRedirect(params: LegacyAuthParams): string {
  const query = new URLSearchParams();
  const callbackUrl = first(params.callbackUrl);
  const reason = first(params.reason);
  const error = first(params.error);
  if (callbackUrl) query.set('callbackUrl', safeLoginCallback(callbackUrl));
  if (reason === 'session') query.set('reason', reason);
  if (error) query.set('error', error.slice(0, 80));
  const suffix = query.toString();
  return suffix ? `/login?${suffix}` : '/login';
}
