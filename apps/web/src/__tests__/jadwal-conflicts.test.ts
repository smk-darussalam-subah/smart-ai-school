import { detectConflicts, overlaps, ConflictCheckItem } from '../app/dashboard/jadwal/_components/conflicts';

function slot(p: Partial<ConflictCheckItem> & { id: string }): ConflictCheckItem {
  return {
    classId: 'c1',
    dayOfWeek: 1,
    jpStart: 1,
    jpEnd: 2,
    academicYear: '2026/2027',
    semester: 1,
    class: { name: 'X RPL 1' },
    teachingAssignment: { subject: 'Matematika', teacher: { id: 't1', user: { fullName: 'Bu Sari' } } },
    ...p,
  };
}

describe('overlaps', () => {
  it('rentang inklusif: 1–3 vs 3–4 overlap; 1–2 vs 3–4 tidak', () => {
    expect(overlaps(slot({ id: 'a', jpStart: 1, jpEnd: 3 }), slot({ id: 'b', jpStart: 3, jpEnd: 4 }))).toBe(true);
    expect(overlaps(slot({ id: 'a', jpStart: 1, jpEnd: 2 }), slot({ id: 'b', jpStart: 3, jpEnd: 4 }))).toBe(false);
  });
});

describe('detectConflicts', () => {
  it('guru sama, hari sama, kelas beda, JP overlap → kedua slot ditandai', () => {
    const items = [
      slot({ id: 'a', classId: 'c1', jpStart: 1, jpEnd: 3 }),
      slot({ id: 'b', classId: 'c2', jpStart: 2, jpEnd: 4, class: { name: 'X RPL 2' } }),
    ];
    const r = detectConflicts(items);
    expect(r.get('a')?.[0]).toContain('Guru Bu Sari bentrok');
    expect(r.get('b')?.[0]).toContain('Guru Bu Sari bentrok');
  });

  it('kelas sama overlap rentang (celah unique jpStart DB) → terdeteksi', () => {
    const items = [
      slot({ id: 'a', jpStart: 1, jpEnd: 3 }),
      slot({ id: 'b', jpStart: 2, jpEnd: 4, teachingAssignment: { subject: 'Fisika', teacher: { id: 't2', user: { fullName: 'Pak Joko' } } } }),
    ];
    const r = detectConflicts(items);
    expect(r.get('a')?.some((m) => m.includes('dobel slot'))).toBe(true);
  });

  it('hari/TA/semester beda → BUKAN bentrok; guru sama kelas sama (slot multi tercatat sekali) tidak false-positive lintas hari', () => {
    const items = [
      slot({ id: 'a', dayOfWeek: 1 }),
      slot({ id: 'b', dayOfWeek: 2 }),
      slot({ id: 'c', academicYear: '2025/2026' }),
      slot({ id: 'd', semester: 2 }),
    ];
    expect(detectConflicts(items).size).toBe(0);
  });

  it('guru beda, kelas beda → aman walau JP sama', () => {
    const items = [
      slot({ id: 'a', classId: 'c1' }),
      slot({ id: 'b', classId: 'c2', teachingAssignment: { subject: 'Kimia', teacher: { id: 't9', user: { fullName: 'Pak Eko' } } } }),
    ];
    expect(detectConflicts(items).size).toBe(0);
  });
});
