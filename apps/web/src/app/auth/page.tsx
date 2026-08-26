import { redirect } from 'next/navigation';
import { buildLegacyAuthRedirect, type LegacyAuthParams } from './auth-redirect';

export default async function AuthPage({ searchParams }: { searchParams: Promise<LegacyAuthParams> }) {
  redirect(buildLegacyAuthRedirect(await searchParams));
}
