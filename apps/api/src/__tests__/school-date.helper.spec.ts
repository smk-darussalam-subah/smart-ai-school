import { getSchoolDate, SCHOOL_TIME_ZONE } from '../common/helpers/school-date.helper';

describe('getSchoolDate', () => {
  it.each([
    ['before Jakarta midnight', '2026-08-30T16:59:59.999Z', '2026-08-30T00:00:00.000Z'],
    ['at Jakarta midnight', '2026-08-30T17:00:00.000Z', '2026-08-31T00:00:00.000Z'],
    ['at the production scheduler time', '2026-08-30T17:15:00.000Z', '2026-08-31T00:00:00.000Z'],
    ['at 06:59 WIB', '2026-08-30T23:59:59.999Z', '2026-08-31T00:00:00.000Z'],
    ['later on the same school date', '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'],
    ['across a calendar month boundary', '2026-08-31T17:15:00.000Z', '2026-09-01T00:00:00.000Z'],
    ['across the calendar year boundary', '2026-12-31T17:15:00.000Z', '2027-01-01T00:00:00.000Z'],
    ['on a leap date', '2028-02-28T17:15:00.000Z', '2028-02-29T00:00:00.000Z'],
  ])('returns the Asia/Jakarta date %s', (_label, instant, expected) => {
    expect(getSchoolDate(new Date(instant)).toISOString()).toBe(expected);
  });

  it('is independent from the process timezone', () => {
    const previousTimezone = process.env.TZ;
    try {
      process.env.TZ = 'UTC';
      expect(SCHOOL_TIME_ZONE).toBe('Asia/Jakarta');
      expect(getSchoolDate(new Date('2026-08-30T17:15:00.000Z')).toISOString())
        .toBe('2026-08-31T00:00:00.000Z');
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    }
  });

  it('fails closed for an invalid instant', () => {
    expect(() => getSchoolDate(new Date(Number.NaN))).toThrow(RangeError);
  });
});
