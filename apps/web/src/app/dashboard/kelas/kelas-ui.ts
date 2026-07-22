export const NO_WALI_KELAS_VALUE = '__none__';

export function waliKelasSelectValue(teacherId: string | null | undefined): string {
  return teacherId || NO_WALI_KELAS_VALUE;
}

export function waliKelasPayloadValue(value: string): string | null {
  return value === NO_WALI_KELAS_VALUE ? null : value;
}
