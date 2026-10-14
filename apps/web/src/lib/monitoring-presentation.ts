/** Presentation only: technical contracts and denominators remain unchanged. */
export const monitoringCount = (value: number | null) =>
  value === null ? 'Belum tersedia' : String(value);
export function monitoringRatio(done: number | null, total: number | null) {
  return done === null || total === null
    ? 'Belum tersedia'
    : total === 0
      ? 'Belum ada catatan'
      : `${done} dari ${total}`;
}
export function monitoringDate(value?: string | null) {
  if (!value) return 'Belum tersedia';
  const date = new Date(value.length === 10 ? value + 'T12:00:00Z' : value);
  return Number.isNaN(date.getTime())
    ? 'Belum tersedia'
    : date.toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
}
export const monitoringSemester = (semester: number) =>
  semester === 1
    ? 'Semester Ganjil'
    : semester === 2
      ? 'Semester Genap'
      : 'Semester belum tersedia';
export function thresholdSource(value: string) {
  return (
    (
      {
        config: 'Aturan mapel',
        module: 'Aturan modul',
        system_default: 'Nilai bawaan',
        unconfigured: 'Belum ditetapkan',
      } as Record<string, string>
    )[value] ?? 'Sumber belum diketahui'
  );
}
export function monitoringReadMessage(error: string | null | undefined, denied = false) {
  if (
    denied ||
    /forbidden|\b403\b|belum memiliki izin|permission.*(?:denied|missing)|(?:izin|akses).*(?:dicabut|tidak tersedia|tidak diizinkan|ditolak)/i.test(
      error ?? '',
    )
  )
    return 'Anda belum memiliki izin untuk melihat ringkasan ini. Hubungi admin sekolah.';
  return 'Ringkasan belum dapat dimuat. Pilih Muat ulang untuk mencoba kembali.';
}
