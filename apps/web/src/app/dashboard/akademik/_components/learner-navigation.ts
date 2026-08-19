export type KktpProvenance = 'module' | 'config' | 'system_default' | string | null | undefined;

function withStudentId(path: string, studentId?: string): string {
  const normalizedStudentId = studentId?.trim();
  if (!normalizedStudentId) return path;
  return `${path}${path.includes('?') ? '&' : '?'}studentId=${encodeURIComponent(normalizedStudentId)}`;
}

export function learnerDashboardHref(studentId?: string): string {
  return withStudentId('/dashboard/akademik', studentId);
}

export function learnerNotificationCenterHref(studentId?: string): string {
  return withStudentId('/dashboard/akademik?panel=notifications', studentId);
}

export function learnerReportHref(studentId?: string): string {
  return withStudentId('/dashboard/rapor', studentId);
}

export function kktpProvenanceLabel(value: KktpProvenance): string {
  if (value === 'module') return 'Ketentuan modul';
  if (value === 'config') return 'Konfigurasi kelas';
  if (value === 'system_default') return 'Standar sekolah';
  return 'Snapshot resmi';
}

export function initialChildIndex<T extends { studentId?: string }>(children: T[], studentId?: string): number {
  if (!studentId) return 0;
  const index = children.findIndex((child) => child.studentId === studentId);
  return index >= 0 ? index : 0;
}

export function restoreDialogTriggerFocus(target: { focus: () => void } | null | undefined): void {
  target?.focus();
}

function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(value)) throw new Error('Warna harus menggunakan format #RRGGBB');
  const channels = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
}

export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

export const RAPOR_LEARNER_COLORS = {
  ctaBackground: '#34d399',
  ctaForeground: '#020617',
  darkNavBackground: '#0a0f1a',
  darkNavInactive: '#8896a8',
  darkParentNavInactive: '#7a8ba0',
  lightNavBackground: '#ffffff',
  lightNavInactive: '#64748b',
} as const;
