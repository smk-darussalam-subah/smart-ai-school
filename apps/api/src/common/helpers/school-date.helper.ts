export const SCHOOL_TIME_ZONE = 'Asia/Jakarta';

const SCHOOL_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: SCHOOL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function getSchoolDate(now: Date = new Date()): Date {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new RangeError('School date requires a valid Date.');
  }

  const values = new Map(
    SCHOOL_DATE_FORMATTER.formatToParts(now)
      .filter((part) => part.type === 'year' || part.type === 'month' || part.type === 'day')
      .map((part) => [part.type, Number(part.value)]),
  );
  const year = values.get('year');
  const month = values.get('month');
  const day = values.get('day');

  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    throw new RangeError('School date formatter returned an invalid calendar date.');
  }

  const schoolDate = new Date(Date.UTC(year, month - 1, day));
  if (
    schoolDate.getUTCFullYear() !== year ||
    schoolDate.getUTCMonth() !== month - 1 ||
    schoolDate.getUTCDate() !== day
  ) {
    throw new RangeError('School date formatter returned an out-of-range calendar date.');
  }

  return schoolDate;
}
