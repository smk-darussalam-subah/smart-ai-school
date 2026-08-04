import {
  GRADUATE_PROFILE_DIMENSIONS,
  LEGACY_PANCASILA_PROFILE_DIMENSIONS,
  profileOptionsWithSavedValues,
  resolveProfileFramework,
} from '../app/dashboard/akademik/_components/modul-ajar-profile';

describe('Modul Ajar profile framework', () => {
  it('uses eight graduate profile dimensions for 2025/2026 and newer', () => {
    const framework = resolveProfileFramework('2025/2026');

    expect(framework.label).toBe('Dimensi Profil Lulusan');
    expect(framework.options).toEqual(GRADUATE_PROFILE_DIMENSIONS);
    expect(framework.options).toHaveLength(8);
    expect(framework.options).toContain('Keimanan dan ketakwaan terhadap Tuhan Yang Maha Esa');
    expect(framework.options).toContain('Komunikasi');
  });

  it('keeps historical Pancasila profile choices readable before 2025/2026', () => {
    const framework = resolveProfileFramework('2024/2025');

    expect(framework.label).toBe('Profil Pelajar Pancasila');
    expect(framework.options).toEqual(LEGACY_PANCASILA_PROFILE_DIMENSIONS);
  });

  it('keeps saved legacy values visible without rewriting current-year options', () => {
    const options = profileOptionsWithSavedValues('2026/2027', ['Bernalar Kritis']);

    expect(options).toContain('Penalaran kritis');
    expect(options).toContain('Bernalar Kritis');
  });
});
