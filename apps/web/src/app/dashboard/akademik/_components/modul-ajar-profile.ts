export const GRADUATE_PROFILE_DIMENSIONS = [
  'Keimanan dan ketakwaan terhadap Tuhan Yang Maha Esa',
  'Kewargaan',
  'Penalaran kritis',
  'Kreativitas',
  'Kolaborasi',
  'Kemandirian',
  'Kesehatan',
  'Komunikasi',
] as const;

export const LEGACY_PANCASILA_PROFILE_DIMENSIONS = [
  'Beriman & Berakhlak Mulia',
  'Berkebinekaan Global',
  'Bergotong Royong',
  'Mandiri',
  'Bernalar Kritis',
  'Kreatif',
] as const;

export type ProfileFramework = {
  label: string;
  activityLabel: string;
  options: readonly string[];
  historical: boolean;
};

export function isGraduateProfileYear(academicYear?: string | null): boolean {
  const startYear = Number(academicYear?.match(/^(\d{4})\/\d{4}$/)?.[1] ?? 0);
  return startYear >= 2025;
}

export function resolveProfileFramework(academicYear?: string | null): ProfileFramework {
  if (isGraduateProfileYear(academicYear)) {
    return {
      label: 'Dimensi Profil Lulusan',
      activityLabel: 'Uraian Aktivitas Profil Lulusan',
      options: GRADUATE_PROFILE_DIMENSIONS,
      historical: false,
    };
  }
  return {
    label: 'Profil Pelajar Pancasila',
    activityLabel: 'Uraian Aktivitas Profil Pelajar',
    options: LEGACY_PANCASILA_PROFILE_DIMENSIONS,
    historical: true,
  };
}

export function profileOptionsWithSavedValues(
  academicYear: string | null | undefined,
  savedValues: readonly string[] | null | undefined,
): readonly string[] {
  const framework = resolveProfileFramework(academicYear);
  const extra = (savedValues ?? []).filter((value) => value && !framework.options.includes(value));
  return [...framework.options, ...extra];
}
