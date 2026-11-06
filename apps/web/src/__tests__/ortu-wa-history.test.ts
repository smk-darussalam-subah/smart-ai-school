import {
  mapWaLog,
  type WaLogApiItem,
} from '../app/dashboard/akademik/_components/ortu/ortu-mappers';

const item = (eventType: string | null, index = 0): WaLogApiItem => ({
  id: `wa-${index}`,
  studentId: 'synthetic-student',
  recipient: 'synthetic-recipient',
  message: `Pesan sintetis ${index}; isi pesan tidak menentukan status alpha.`,
  eventType,
  createdAt: '2026-10-22T02:00:00.000Z',
});

describe('parent WA history notification status', () => {
  it.each([
    ['izin', 'izin'],
    ['attendance.izin', 'izin'],
    ['LEAVE', 'izin'],
    ['student_leave', 'izin'],
    ['sakit', 'sakit'],
    ['student_sakit', 'sakit'],
    ['SICK', 'sakit'],
    ['attendance.sick', 'sakit'],
    ['alpha', 'alpha'],
    [' ALPHA ', 'alpha'],
    ['attendance.alpha', 'alpha'],
    ['SESSION_ALPHA', 'alpha'],
    ['alpa', 'alpha'],
  ] as const)('preserves the explicit %s attendance decision as %s', (eventType, expected) => {
    expect(mapWaLog([item(eventType)])[0]?.status).toBe(expected);
  });

  it.each([
    null,
    '',
    '   ',
    'attendance.recorded',
    'student.enrolled',
    'payment.received',
    'grade.submitted',
    'notification.generic',
    'absence',
    'alphabet.lesson',
  ])(
    'keeps an unspecified notification type %p neutral rather than inventing Alpha',
    (eventType) => {
      const source = item(eventType);
      expect(() => mapWaLog([source])).not.toThrow();
      expect(mapWaLog([source])[0]).toMatchObject({
        status: 'info',
        note: source.message,
        sentTo: source.recipient,
        session: '—',
      });
    },
  );

  it('preserves every mixed notification in its original order without guessing from message text', () => {
    const messages = [null, 'izin', 'payment.received', 'sakit', '', 'attendance.alpha'].map(
      (eventType, index) => item(eventType, index),
    );
    const before = JSON.stringify(messages);
    const mapped = mapWaLog(messages);

    expect(mapped).toHaveLength(messages.length);
    expect(mapped.map((row) => row.status)).toEqual([
      'info',
      'izin',
      'info',
      'sakit',
      'info',
      'alpha',
    ]);
    expect(mapped.map((row) => row.note)).toEqual(messages.map((row) => row.message));
    expect(mapped.map((row) => row.sentTo)).toEqual(messages.map((row) => row.recipient));
    expect(JSON.stringify(messages)).toBe(before);
  });

  it('retains nullable notification batches and does not create false absence counts', () => {
    const messages = Array.from({ length: 100 }, (_, index) => item(null, index));
    const mapped = mapWaLog(messages);

    expect(mapped).toHaveLength(100);
    expect(mapped.every((row) => row.status === 'info')).toBe(true);
    expect(mapped.filter((row) => row.status === 'alpha')).toHaveLength(0);
    expect(mapped.map((row) => row.note)).toEqual(messages.map((row) => row.message));
  });

  it('keeps an actually empty history empty', () => {
    expect(mapWaLog([])).toEqual([]);
  });

  it.each([
    ['2026-10-22T07:35:00.000Z', '22 Okt 2026', '14:35'],
    ['2026-10-22T20:35:00.000Z', '23 Okt 2026', '03:35'],
    ['2026-10-23T03:35:00+07:00', '23 Okt 2026', '03:35'],
  ])('renders %s as a consistent WIB date and time', (createdAt, date, time) => {
    expect(mapWaLog([{ ...item(null), createdAt }])[0]).toMatchObject({ date, time });
  });

  it.each(['', 'not-an-iso-timestamp', '2026-13-22T07:35:00.000Z', '2026-10-22T07:35:00'])(
    'keeps an invalid or timezone-ambiguous timestamp %p neutral',
    (createdAt) => {
      expect(mapWaLog([{ ...item(null), createdAt }])[0]).toMatchObject({
        date: '—',
        time: '—',
        status: 'info',
      });
    },
  );
});
