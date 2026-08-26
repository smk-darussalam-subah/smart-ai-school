export function displayCookiePolicy(production: boolean) {
  return {
    name: production ? '__Host-diis-display' : 'diis-display-local',
    secure: production,
  };
}

const cookiePolicy = displayCookiePolicy(process.env.NODE_ENV === 'production');

export const DISPLAY_CREDENTIAL_COOKIE = cookiePolicy.name;

export const DISPLAY_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: cookiePolicy.secure,
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
};

export function isSameOriginMutation(
  request: Request,
  canonicalOrigin = process.env.NEXTAUTH_URL,
): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const allowedOrigins = new Set([new URL(request.url).origin]);
    if (canonicalOrigin) allowedOrigins.add(new URL(canonicalOrigin).origin);
    return allowedOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

export function safeDisplayResourceId(value: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export function displayCredentialHeaders(credential: string): HeadersInit {
  return {
    accept: 'application/json',
    'x-diis-display-credential': credential,
  };
}

export function displayProxyError(status: number): { status: number; message: string } {
  if (status === 401 || status === 403)
    return { status: 401, message: 'Perangkat perlu dipasangkan kembali.' };
  if (status === 429)
    return { status: 429, message: 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.' };
  if (status >= 500) return { status: 503, message: 'Layanan display belum tersedia.' };
  return { status: 400, message: 'Permintaan display tidak dapat diproses.' };
}
