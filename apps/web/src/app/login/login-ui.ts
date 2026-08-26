const DEFAULT_CALLBACK = '/dashboard';

const OAUTH_ERRORS: Record<string, string> = {
  AccessDenied: 'Akses masuk ditolak. Pastikan akun Anda masih aktif.',
  Configuration: 'Layanan masuk belum siap. Hubungi administrator sekolah.',
  OAuthCallback: 'Balasan dari layanan akun tidak dapat diverifikasi. Silakan coba lagi.',
  OAuthSignin: 'Layanan akun sekolah belum dapat dihubungi. Silakan coba lagi.',
  RefreshAccessTokenError: 'Sesi tidak dapat diperbarui. Silakan masuk kembali.',
};

/** Accept only an in-app path. Absolute, protocol-relative, malformed and control-char URLs fail closed. */
export function safeLoginCallback(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return DEFAULT_CALLBACK;
  }
  try {
    const decoded = decodeURIComponent(value);
    if ([...decoded].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 || character === '\\';
    })) return DEFAULT_CALLBACK;
    const parsed = new URL(value, 'https://diis.invalid');
    if (parsed.origin !== 'https://diis.invalid') return DEFAULT_CALLBACK;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_CALLBACK;
  }
}

export interface LoginNotice {
  tone: 'warning' | 'error';
  message: string;
}

export function resolveLoginNotice(reason: string | null, error: string | null): LoginNotice | null {
  if (reason === 'session') {
    return { tone: 'warning', message: 'Sesi Anda telah berakhir. Silakan masuk kembali.' };
  }
  if (reason === 'credential') {
    return { tone: 'warning', message: 'Kredensial perangkat tidak lagi berlaku. Pasangkan perangkat kembali.' };
  }
  if (error) {
    return {
      tone: 'error',
      message: OAUTH_ERRORS[error] ?? 'Proses masuk belum berhasil. Silakan coba lagi atau hubungi Tata Usaha.',
    };
  }
  return null;
}
