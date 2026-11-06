export async function checkServerSession(
  accessToken: string,
): Promise<'active' | 'revoked' | 'unavailable' | 'unsupported'> {
  try {
    const response = await fetch(
      new URL('/api/v1/auth/session-status', process.env.API_URL ?? 'http://localhost:3001'),
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      },
    );
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      return 'revoked';
    }
    if (!response.ok) {
      await response.body?.cancel();
      return 'unavailable';
    }
    const data: unknown = await response.json();
    if (data === null || typeof data !== 'object' || !('active' in data) || data.active !== true)
      return 'unavailable';
    // Browser sessions must remain the same authority across access-token rotation.
    // Token-only clients may still use the API, but cannot establish a Web session.
    return 'binding' in data && data.binding === 'oidc' ? 'active' : 'unsupported';
  } catch {
    return 'unavailable';
  }
}
