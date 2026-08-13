import { jpOptionLabel, normalizeRoomInput } from '@/app/dashboard/jadwal/_components/schedule-ui';

describe('schedule operational UI helpers', () => {
  it('normalizes room names before server conflict validation', () => {
    expect(normalizeRoomInput('  lab   komputer 1 ')).toBe('LAB KOMPUTER 1');
    expect(normalizeRoomInput('   ')).toBeNull();
  });

  it('shows the official JP number and time range', () => {
    expect(jpOptionLabel({ jp: 4, startMin: 585, endMin: 625 })).toBe('JP 4 · 09:45–10:25');
  });
});
