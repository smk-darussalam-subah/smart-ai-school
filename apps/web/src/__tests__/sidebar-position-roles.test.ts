import { visiblePositionRoles } from '@/lib/sidebar-position-roles';

describe('visiblePositionRoles', () => {
  it('shows additional appointment roles in normal mode', () => {
    expect(visiblePositionRoles(null, ['GURU'], ['GURU', 'WAKA_KURIKULUM']))
      .toEqual(['WAKA_KURIKULUM']);
  });

  it('hides real appointment roles while viewing as another role', () => {
    expect(visiblePositionRoles('GURU', ['GURU'], ['WAKA_KURIKULUM', 'KEPALA_SEKOLAH']))
      .toEqual([]);
  });
});
