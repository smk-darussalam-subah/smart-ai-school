import { toSiswaFormState } from '@/app/dashboard/siswa/_components/siswa-form-state';

describe('Siswa form state', () => {
  it('builds filled edit form state from the selected student row', () => {
    expect(
      toSiswaFormState({
        id: 'student-1',
        nis: '12345',
        status: 'active',
        joinedAt: '2026-07-19T00:00:00.000Z',
        user: {
          id: 'user-1',
          fullName: 'Kang Abdul',
          email: 'kang.abdul@example.sch.id',
        },
        parent: { id: 'parent-1', fullName: 'King Abdul Fatah' },
        class: { id: 'class-1', name: 'X TKJ 1' },
      }),
    ).toEqual({
      nis: '12345',
      classId: 'class-1',
      status: 'active',
      joinedAt: '2026-07-19',
    });
  });

  it('does not expose raw Keycloak UUID in the edit form state', () => {
    const state = toSiswaFormState({
      id: 'student-1',
      nis: '12345',
      status: 'active',
      joinedAt: null,
      user: { id: 'kc-user-1', fullName: 'Siswa Aman' },
      parent: null,
      class: null,
    });

    expect(state).toEqual({
      nis: '12345',
      classId: '',
      status: 'active',
      joinedAt: '',
    });
    expect(state).not.toHaveProperty('userId');
  });
});
