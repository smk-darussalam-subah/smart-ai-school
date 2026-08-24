export const USER_IDENTITY_ROLE_OPTIONS = [
  'SUPER_ADMIN',
  'TATA_USAHA',
  'GURU',
  'SISWA',
  'ORANG_TUA',
  'INDUSTRI',
] as const;

export const USERS_SEARCH_DEBOUNCE_MS = 350;

export type UserIdentityRoleOption = (typeof USER_IDENTITY_ROLE_OPTIONS)[number];

export function isUserIdentityRoleOption(value: unknown): value is UserIdentityRoleOption {
  return USER_IDENTITY_ROLE_OPTIONS.includes(value as UserIdentityRoleOption);
}
