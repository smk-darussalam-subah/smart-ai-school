import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  DISPLAY_CREDENTIAL_COOKIE,
  displayCredentialHeaders,
  displayProxyError,
} from '@/lib/display-proxy';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

export async function GET() {
  const credential = (await cookies()).get(DISPLAY_CREDENTIAL_COOKIE)?.value;
  if (!credential) return NextResponse.json({ message: 'Perangkat belum dipasangkan.' }, { status: 401 });
  try {
    const upstream = await fetch(`${API_BASE}/api/v1/display/snapshot`, {
      headers: displayCredentialHeaders(credential),
      cache: 'no-store',
    });
    if (!upstream.ok) {
      const error = displayProxyError(upstream.status);
      const response = NextResponse.json({ message: error.message }, { status: error.status });
      if (error.status === 401) response.cookies.delete(DISPLAY_CREDENTIAL_COOKIE);
      return response;
    }
    const payload = await upstream.json().catch(() => null);
    if (!payload) return NextResponse.json({ message: 'Respons display tidak valid.' }, { status: 503 });
    return NextResponse.json(payload, {
      status: 200,
      headers: { 'cache-control': 'no-store, max-age=0' },
    });
  } catch {
    return NextResponse.json({ message: 'Layanan display belum tersedia.' }, { status: 503 });
  }
}
