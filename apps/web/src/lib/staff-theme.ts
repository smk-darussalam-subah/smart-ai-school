export const STAFF_THEME_COOKIE = 'diis-staff-theme';

export function isStaffTheme(value: string | undefined): value is StaffTheme {
  return value === 'system' || value === 'light' || value === 'dark';
}

export type StaffTheme = 'system' | 'light' | 'dark';
