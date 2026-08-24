import { NextRequest, NextResponse } from 'next/server';
import { DISPLAY_CREDENTIAL_COOKIE, isSameOriginMutation } from '@/lib/display-proxy';

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: 'Permintaan tidak valid.' }, { status: 403 });
  }
  const response = NextResponse.json({ disconnected: true });
  response.cookies.delete(DISPLAY_CREDENTIAL_COOKIE);
  return response;
}
