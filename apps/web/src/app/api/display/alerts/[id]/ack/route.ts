import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  DISPLAY_CREDENTIAL_COOKIE,
  displayProxyError,
  isSameOriginMutation,
  safeDisplayResourceId,
} from '@/lib/display-proxy';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: 'Permintaan acknowledgement tidak valid.' }, { status: 403 });
  }
  const id = safeDisplayResourceId((await context.params).id);
  if (!id) return NextResponse.json({ message: 'Alert tidak valid.' }, { status: 400 });
  const credential = (await cookies()).get(DISPLAY_CREDENTIAL_COOKIE)?.value;
  if (!credential) return NextResponse.json({ message: 'Perangkat belum dipasangkan.' }, { status: 401 });

  try {
    const upstream = await fetch(`${API_BASE}/api/v1/display/deliveries/${id}/acknowledge`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-diis-display-credential': credential,
      },
      body: JSON.stringify({}),
      cache: 'no-store',
    });
    if (!upstream.ok) {
      const error = displayProxyError(upstream.status);
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json({ acknowledged: true });
  } catch {
    return NextResponse.json({ message: 'Acknowledgement belum dapat disimpan.' }, { status: 503 });
  }
}
