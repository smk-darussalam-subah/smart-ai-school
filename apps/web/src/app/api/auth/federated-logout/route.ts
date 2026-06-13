// =============================================================================
// GET /api/auth/federated-logout — Logout yang JUGA mengakhiri sesi SSO Keycloak.
//
// Masalah: signOut() NextAuth hanya menghapus cookie aplikasi; sesi SSO Keycloak
// (cookie di domain auth.*) tetap hidup → klik "login" berikutnya langsung masuk
// TANPA password (memakai sesi lama) & tak bisa ganti akun.
//
// Solusi: navigasi penuh ke route ini (saat masih login) → baca id_token dari
// JWT → redirect ke endpoint end-session Keycloak (id_token_hint) → Keycloak
// hapus sesi SSO lalu redirect balik ke /login. Cookie sesi aplikasi dibersihkan
// di response ini.
//
// PRASYARAT KEYCLOAK: client `diis-web` harus punya "Valid post logout redirect
// URIs" mencakup origin app (mis. https://smkdarussalamsubah.sch.id/login atau `+`).
// =============================================================================

import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const issuer = process.env.KEYCLOAK_ISSUER;
  const base = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
  const postLogoutRedirect = `${base}/login`;

  // Tanpa issuer terkonfigurasi → fallback ke /login (tetap bersihkan cookie).
  let redirectTo = postLogoutRedirect;
  if (issuer) {
    const token = await getToken({ req });
    const url = new URL(`${issuer}/protocol/openid-connect/logout`);
    url.searchParams.set('post_logout_redirect_uri', postLogoutRedirect);
    if (process.env.KEYCLOAK_CLIENT_ID) url.searchParams.set('client_id', process.env.KEYCLOAK_CLIENT_ID);
    if (token?.idToken) url.searchParams.set('id_token_hint', token.idToken as string);
    redirectTo = url.toString();
  }

  const res = NextResponse.redirect(redirectTo);
  // Hapus cookie sesi NextAuth (nama dev + prod secure-prefix).
  for (const name of ['next-auth.session-token', '__Secure-next-auth.session-token']) {
    res.cookies.set(name, '', { maxAge: 0, path: '/' });
  }
  return res;
}
