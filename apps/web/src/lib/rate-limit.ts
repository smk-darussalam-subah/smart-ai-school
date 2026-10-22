export function rateLimitMessage(headers: Headers): string {
  const raw =
    headers.get('retry-after') ??
    headers.get('retry-after-aichat') ??
    headers.get('retry-after-preauth');
  const seconds = raw && /^\d+$/.test(raw) ? Math.min(3600, Math.max(1, Number(raw))) : null;
  return seconds
    ? `Permintaan terlalu sering. Tunggu ${seconds} detik sebelum mencoba lagi.`
    : 'Permintaan terlalu sering. Tunggu sebentar sebelum mencoba lagi.';
}
