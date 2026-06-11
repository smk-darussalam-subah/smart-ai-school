// =============================================================================
// Deteksi bentrok jadwal (murni — dapat di-unit-test tanpa React)
// Lapis kedua di atas constraint DB:
//  - GURU sama mengajar 2 slot overlap pada hari+TA+semester sama (beda kelas)
//  - KELAS sama punya 2 slot overlap (celah unique DB: hanya jpStart unik,
//    rentang 1–3 vs 2–4 tetap lolos unique)
// =============================================================================

export interface ConflictCheckItem {
  id: string;
  classId: string;
  dayOfWeek: number;
  jpStart: number;
  jpEnd: number;
  academicYear: string;
  semester: number;
  class: { name: string };
  teachingAssignment: {
    subject: string;
    teacher: { id: string; user: { fullName: string } };
  };
}

/** Dua rentang JP overlap (inklusif). */
export function overlaps(a: ConflictCheckItem, b: ConflictCheckItem): boolean {
  return a.jpStart <= b.jpEnd && b.jpStart <= a.jpEnd;
}

export function detectConflicts(items: ConflictCheckItem[]): Map<string, string[]> {
  const reasons = new Map<string, string[]>();
  const push = (id: string, msg: string) => {
    const arr = reasons.get(id) ?? [];
    if (!arr.includes(msg)) arr.push(msg);
    reasons.set(id, arr);
  };

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!;
      const b = items[j]!;
      if (
        a.dayOfWeek !== b.dayOfWeek ||
        a.academicYear !== b.academicYear ||
        a.semester !== b.semester ||
        !overlaps(a, b)
      ) continue;

      if (
        a.teachingAssignment.teacher.id === b.teachingAssignment.teacher.id &&
        a.classId !== b.classId
      ) {
        const t = a.teachingAssignment.teacher.user.fullName;
        push(a.id, `Guru ${t} bentrok dengan ${b.class.name} (JP ${b.jpStart}–${b.jpEnd})`);
        push(b.id, `Guru ${t} bentrok dengan ${a.class.name} (JP ${a.jpStart}–${a.jpEnd})`);
      }
      if (a.classId === b.classId) {
        push(a.id, `Kelas ${a.class.name} dobel slot dengan ${b.teachingAssignment.subject}`);
        push(b.id, `Kelas ${b.class.name} dobel slot dengan ${a.teachingAssignment.subject}`);
      }
    }
  }
  return reasons;
}
