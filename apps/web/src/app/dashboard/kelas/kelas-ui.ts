export const NO_WALI_KELAS_VALUE = '__none__';
export const NEEDS_REPLACEMENT_VALUE = '__needs_replacement__';

export function waliKelasSelectValue(
  teacherId: string | null | undefined,
  status: 'assigned' | 'unassigned' | 'needs_replacement' = teacherId ? 'assigned' : 'unassigned',
): string {
  if (status === 'needs_replacement') return NEEDS_REPLACEMENT_VALUE;
  return teacherId || NO_WALI_KELAS_VALUE;
}

export function waliKelasPayloadValue(value: string): string | null {
  return value === NO_WALI_KELAS_VALUE || value === NEEDS_REPLACEMENT_VALUE ? null : value;
}
