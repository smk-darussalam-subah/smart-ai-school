import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { DISPLAY_CREDENTIAL_COOKIE, displayProxyError } from '@/lib/display-proxy';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

export const dynamic = 'force-dynamic';

export async function GET() {
  const credential = (await cookies()).get(DISPLAY_CREDENTIAL_COOKIE)?.value;
  if (!credential) return NextResponse.json({ message: 'Perangkat belum dipasangkan.' }, { status: 401 });
  try {
    const upstream = await fetch(`${API_BASE}/api/v1/display/stream`, {
      headers: {
        accept: 'text/event-stream',
        'x-diis-display-credential': credential,
      },
      cache: 'no-store',
    });
    if (!upstream.ok || !upstream.body) {
      const error = displayProxyError(upstream.status);
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      },
    });
  } catch {
    return NextResponse.json({ message: 'Stream display belum tersedia.' }, { status: 503 });
  }
}
