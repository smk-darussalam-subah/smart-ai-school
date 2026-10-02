import {
  NEEDS_REPLACEMENT_VALUE,
  NO_WALI_KELAS_VALUE,
  waliKelasPayloadValue,
  waliKelasSelectValue,
} from '@/app/dashboard/kelas/kelas-ui';

describe('Manajemen Kelas wali kelas select helpers', () => {
  it('uses a non-empty sentinel for the optional empty wali kelas choice', () => {
    expect(NO_WALI_KELAS_VALUE).not.toBe('');
    expect(waliKelasSelectValue(null)).toBe(NO_WALI_KELAS_VALUE);
    expect(waliKelasSelectValue(undefined)).toBe(NO_WALI_KELAS_VALUE);
  });

  it('maps the sentinel back to null for the API payload', () => {
    expect(waliKelasPayloadValue(NO_WALI_KELAS_VALUE)).toBeNull();
    expect(waliKelasPayloadValue('teacher-uuid-001')).toBe('teacher-uuid-001');
  });

  it('shows an explicit replacement state for an archived homeroom teacher', () => {
    expect(waliKelasSelectValue('archived-teacher', 'needs_replacement')).toBe(
      NEEDS_REPLACEMENT_VALUE,
    );
    expect(waliKelasPayloadValue(NEEDS_REPLACEMENT_VALUE)).toBeNull();
  });
});
