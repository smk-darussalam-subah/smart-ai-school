import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';
const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

async function authorize() {
  const session = await getServerSession(authOptions);
  return session?.accessToken ?? null;
}

async function upstreamError(response: Response) {
  const payload = await response.json().catch(() => ({ message: 'Media kegiatan gagal diproses' }));
  return NextResponse.json(payload, { status: response.status });
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const token = await authorize();
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const response = await fetch(`${API_BASE}/api/v1/class-activities/${encodeURIComponent(id)}/media`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', redirect: 'error',
  });
  if (!response.ok) return upstreamError(response);
  const bytes = await response.arrayBuffer();
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'application/octet-stream',
      'Cache-Control': 'private, no-store, max-age=0, no-transform',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const token = await authorize();
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > MAX_MEDIA_BYTES) return NextResponse.json({ message: 'Ukuran foto maksimal 5 MiB' }, { status: 413 });
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_MEDIA_BYTES) return NextResponse.json({ message: 'Ukuran foto maksimal 5 MiB' }, { status: 413 });
  const { id } = await context.params;
  const response = await fetch(`${API_BASE}/api/v1/class-activities/${encodeURIComponent(id)}/media`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': request.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Length': String(bytes.byteLength),
    },
    body: bytes,
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) return upstreamError(response);
  return NextResponse.json(await response.json());
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const token = await authorize();
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const response = await fetch(`${API_BASE}/api/v1/class-activities/${encodeURIComponent(id)}/media`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', redirect: 'error',
  });
  if (!response.ok) return upstreamError(response);
  return NextResponse.json(await response.json());
}
