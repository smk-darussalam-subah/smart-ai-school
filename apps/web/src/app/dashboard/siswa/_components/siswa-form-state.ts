export interface SiswaFormStudent {
  id: string;
  nis: string;
  status: string;
  user: { id?: string; fullName: string; email?: string };
  parent?: { id: string; fullName: string } | null;
  class?: { id: string; name: string } | null;
  joinedAt?: string | null;
}

export interface SiswaFormState {
  nis: string;
  classId: string;
  status: string;
  joinedAt: string;
}

export function toSiswaFormState(student: SiswaFormStudent): SiswaFormState {
  return {
    nis: student.nis,
    classId: student.class?.id ?? '',
    status: student.status,
    joinedAt: student.joinedAt ? student.joinedAt.split('T')[0] ?? '' : '',
  };
}
