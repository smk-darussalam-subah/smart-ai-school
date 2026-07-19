import {
  filterByStudentId,
  mapSppToPembayaran,
  normalizeAssignmentGroups,
  normalizeSppGroups,
  type SppDashboardGroup,
  type StudentDashboardAssignmentGroup,
} from '@/app/dashboard/akademik/_components/ortu/ortu-mappers';

describe('ortu dashboard mappers', () => {
  it('normalizes grouped SPP response into child-tagged flat payments', () => {
    const groups: SppDashboardGroup[] = [
      {
        studentId: 'student-a',
        studentName: 'Anak A',
        payments: [
          {
            id: 'pay-a-1',
            month: 7,
            year: 2026,
            amount: '350000',
            status: 'paid',
            paidAt: '2026-07-10T02:00:00.000Z',
            receiptNo: 'R-001',
          },
        ],
      },
      {
        studentId: 'student-b',
        studentName: 'Anak B',
        payments: [
          {
            id: 'pay-b-1',
            month: 8,
            year: 2026,
            amount: 400000,
            status: 'unpaid',
          },
        ],
      },
    ];

    const flat = normalizeSppGroups(groups);

    expect(flat).toEqual([
      expect.objectContaining({
        id: 'pay-a-1',
        studentId: 'student-a',
        month: '7/2026',
        amount: 350000,
        status: 'paid',
        paidAt: '2026-07-10T02:00:00.000Z',
        receiptNo: 'R-001',
      }),
      expect.objectContaining({
        id: 'pay-b-1',
        studentId: 'student-b',
        month: '8/2026',
        amount: 400000,
        status: 'unpaid',
      }),
    ]);
    expect(mapSppToPembayaran(filterByStudentId(flat, 'student-b'))).toEqual([
      expect.objectContaining({
        id: 'pay-b-1',
        jenis: 'SPP 8/2026',
        amount: 400000,
        status: 'unpaid',
      }),
    ]);
  });

  it('filters child-tagged datasets to the active student only', () => {
    const rows = [
      { id: 'grade-a', studentId: 'student-a', score: 90 },
      { id: 'grade-b', studentId: 'student-b', score: 75 },
    ];

    expect(filterByStudentId(rows, 'student-b')).toEqual([
      { id: 'grade-b', studentId: 'student-b', score: 75 },
    ]);
  });

  it('normalizes grouped assignments into child-tagged items', () => {
    const groups: StudentDashboardAssignmentGroup[] = [
      {
        studentId: 'student-a',
        studentName: 'Anak A',
        assignments: [
          {
            id: 'mod-1',
            type: 'lms',
            title: 'Modul 1',
            subject: 'Matematika',
            guru: 'Bu Guru',
            status: 'pending',
            progress: 0,
            kktp: 75,
          },
        ],
      },
    ];

    expect(normalizeAssignmentGroups(groups)).toEqual([
      expect.objectContaining({
        id: 'mod-1',
        studentId: 'student-a',
        subject: 'Matematika',
      }),
    ]);
  });
});
