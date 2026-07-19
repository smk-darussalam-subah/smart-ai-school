export interface SiswaFormStudent {
  id: string;
  userId?: string;
  nis: string;
  status: string;
  user: { id?: string; fullName: string; email?: string };
  parent?: { id: string; fullName: string } | null;
  class?: { id: string; name: string } | null;
  joinedAt?: string | null;
}

export interface SiswaFormState {
  nis: string;
  userId: string;
  classId: string;
  status: string;
  joinedAt: string;
}

export function toSiswaFormState(student: SiswaFormStudent | null): SiswaFormState {
  return {
    nis: student?.nis ?? '',
    userId: student?.user.id ?? student?.userId ?? '',
    classId: student?.class?.id ?? '',
    status: student?.status ?? 'active',
    joinedAt: student?.joinedAt ? student.joinedAt.split('T')[0] ?? '' : '',
  };
}
