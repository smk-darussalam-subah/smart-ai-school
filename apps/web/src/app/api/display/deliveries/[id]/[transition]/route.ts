import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  DISPLAY_CREDENTIAL_COOKIE,
  displayProxyError,
  isSameOriginMutation,
  safeDisplayResourceId,
} from '@/lib/display-proxy';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; transition: string }> },
) {
  if (!isSameOriginMutation(request))
    return NextResponse.json({ message: 'Permintaan tidak valid.' }, { status: 403 });
  const params = await context.params;
  const id = safeDisplayResourceId(params.id);
  const transition = params.transition;
  if (!id || !['delivered', 'claim', 'played', 'release'].includes(transition)) {
    return NextResponse.json({ message: 'Transisi delivery tidak valid.' }, { status: 400 });
  }
  const credential = (await cookies()).get(DISPLAY_CREDENTIAL_COOKIE)?.value;
  if (!credential)
    return NextResponse.json({ message: 'Perangkat belum dipasangkan.' }, { status: 401 });
  try {
    let claimToken: string | null = null;
    if (transition === 'played' || transition === 'release') {
      const body = (await request.json().catch(() => null)) as { claimToken?: unknown } | null;
      claimToken =
        typeof body?.claimToken === 'string' ? safeDisplayResourceId(body.claimToken) : null;
      if (!claimToken) {
        return NextResponse.json({ message: 'Klaim audio tidak valid.' }, { status: 400 });
      }
    }
    const upstream = await fetch(`${API_BASE}/api/v1/display/deliveries/${id}/${transition}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'x-diis-display-credential': credential,
        ...(claimToken ? { 'content-type': 'application/json' } : {}),
      },
      ...(claimToken ? { body: JSON.stringify({ claimToken }) } : {}),
      cache: 'no-store',
    });
    if (!upstream.ok) {
      const error = displayProxyError(upstream.status);
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    const payload = (await upstream.json().catch(() => null)) as {
      status?: unknown;
      transitioned?: unknown;
      claimed?: unknown;
      claimToken?: unknown;
      expiresAt?: unknown;
      released?: unknown;
    } | null;
    return NextResponse.json({
      status: typeof payload?.status === 'string' ? payload.status : transition.toUpperCase(),
      transitioned: payload?.transitioned === true,
      claimed: payload?.claimed === true,
      claimToken:
        typeof payload?.claimToken === 'string'
          ? safeDisplayResourceId(payload.claimToken)
          : undefined,
      expiresAt: typeof payload?.expiresAt === 'string' ? payload.expiresAt : undefined,
      released: payload?.released === true,
    });
  } catch {
    return NextResponse.json({ message: 'Status delivery belum dapat disimpan.' }, { status: 503 });
  }
}
