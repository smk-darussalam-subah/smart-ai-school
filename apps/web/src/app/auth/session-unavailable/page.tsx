import { safeLoginCallback } from '@/app/login/login-ui';
import { SessionRecoveryNotice } from '@/components/auth/SessionRecoveryNotice';

export default async function SessionUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const callback = safeLoginCallback(
    typeof params.callbackUrl === 'string' ? params.callbackUrl : null,
  );
  return (
    <SessionRecoveryNotice
      message="Layanan akun sekolah sementara belum tersedia. Tunggu sekitar 30 detik, lalu coba lagi."
      retryHref={'/api/auth/refresh?callbackUrl=' + encodeURIComponent(callback)}
    />
  );
}
