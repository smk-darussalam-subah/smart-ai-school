import { NextRequest, NextResponse } from 'next/server';
import {
  DISPLAY_COOKIE_OPTIONS,
  DISPLAY_CREDENTIAL_COOKIE,
  displayProxyError,
  isSameOriginMutation,
} from '@/lib/display-proxy';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

function safeActivationBody(value: unknown): { deviceId: string; pairingCode: string } | null {
  if (!value || typeof value !== 'object') return null;
  const pairingCode = 'pairingCode' in value ? String(value.pairingCode ?? '').trim() : '';
  const deviceId = 'deviceId' in value ? String(value.deviceId ?? '').trim() : '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deviceId)
    && /^[A-Za-z0-9_-]{10,32}$/.test(pairingCode) ? { deviceId, pairingCode } : null;
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: 'Permintaan pairing tidak valid.' }, { status: 403 });
  }
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 1_024) {
    return NextResponse.json({ message: 'Kode pairing tidak valid.' }, { status: 413 });
  }
  const body = safeActivationBody(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ message: 'Kode pairing tidak valid.' }, { status: 400 });

  try {
    const upstream = await fetch(`${API_BASE}/api/v1/display/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', origin: request.headers.get('origin') ?? '' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const payload = await upstream.json().catch(() => null) as { credential?: unknown; profile?: unknown; device?: { profile?: unknown } } | null;
    const profile = payload?.profile ?? payload?.device?.profile;
    if (!upstream.ok || !payload || typeof payload.credential !== 'string'
      || (profile !== 'RUANG_GURU' && profile !== 'RUANG_TU')) {
      const error = displayProxyError(upstream.status);
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    const response = NextResponse.json({ profile }, { status: 200 });
    response.cookies.set(DISPLAY_CREDENTIAL_COOKIE, payload.credential, DISPLAY_COOKIE_OPTIONS);
    return response;
  } catch {
    return NextResponse.json({ message: 'Layanan pairing belum tersedia.' }, { status: 503 });
  }
}
