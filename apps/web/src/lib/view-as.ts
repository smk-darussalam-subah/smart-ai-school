// =============================================================================
// view-as.ts — Mode "Masuk sebagai" untuk akun multi-role (akun inspektur).
//
// Cookie `diis_view_as` (non-httpOnly agar bisa di-set switcher klien) berisi
// SATU role. getEffectiveRoles() menyempitkan roles sesi ke role tsb HANYA bila
// role memang dimiliki user — user tidak bisa meng-impersonate role yang tak
// dimilikinya (cookie dipalsukan = diabaikan).
//
// KEAMANAN: ini murni lapisan TAMPILAN (sidebar/halaman). Token API tidak
// berubah — RBAC backend tetap menilai roles asli dari Keycloak.
// =============================================================================

import { cookies } from 'next/headers';
import type { Session } from 'next-auth';

export const VIEW_AS_COOKIE = 'diis_view_as';

export async function getEffectiveRoles(session: Session | null): Promise<string[]> {
  const realRoles: string[] = (session?.roles as string[]) ?? [];
  try {
    const store = await cookies();
    const viewAs = store.get(VIEW_AS_COOKIE)?.value;
    if (viewAs && realRoles.includes(viewAs)) return [viewAs];
  } catch {
    // cookies() di luar request scope → fallback roles asli
  }
  return realRoles;
}

/** Role tinjau aktif (null bila tidak sedang meninjau / cookie tidak sah). */
export async function getActiveViewAs(session: Session | null): Promise<string | null> {
  const realRoles: string[] = (session?.roles as string[]) ?? [];
  try {
    const store = await cookies();
    const viewAs = store.get(VIEW_AS_COOKIE)?.value;
    if (viewAs && realRoles.includes(viewAs)) return viewAs;
  } catch { /* noop */ }
  return null;
}
