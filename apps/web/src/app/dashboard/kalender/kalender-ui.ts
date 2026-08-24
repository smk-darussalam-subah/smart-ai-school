export function canMutateCalendar(
  academicYear: { id: string; code: string } | null,
  periodWarning?: string | null,
): boolean {
  return Boolean(academicYear) && !periodWarning;
}

export function calendarEmptyStateMessage(canMutate: boolean): string {
  return canMutate
    ? 'Belum ada agenda. Klik Tambah Agenda.'
    : 'Belum ada agenda yang dapat ditampilkan karena tahun ajaran aktif belum tersedia.';
}

type CalendarAcademicYear = { id: string; code: string };
type ActiveYearResult =
  | { status: 'success'; data: CalendarAcademicYear | null }
  | { status: 'forbidden' | 'notFound' | 'unavailable' | 'requestError'; message?: string };

export function resolveCalendarScope(activeYearResult: ActiveYearResult): {
  academicYear: CalendarAcademicYear | null;
  query: { academicYearId: string } | null;
  periodWarning: string | null;
} {
  if (activeYearResult.status === 'success' && activeYearResult.data?.id) {
    return {
      academicYear: activeYearResult.data,
      query: { academicYearId: activeYearResult.data.id },
      periodWarning: null,
    };
  }

  return {
    academicYear: null,
    query: null,
    periodWarning: activeYearResult.status === 'notFound'
      ? 'Tahun ajaran aktif belum disiapkan. Kalender dikunci sampai periode aktif tersedia.'
      : 'Status tahun ajaran aktif belum dapat dimuat. Kalender dikunci agar agenda lintas tahun tidak tercampur.',
  };
}
