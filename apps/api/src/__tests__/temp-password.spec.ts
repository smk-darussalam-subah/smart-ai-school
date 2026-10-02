import { generateTemporaryPassword } from '../common/helpers/temp-password';

describe('temporary password helper', () => {
  it('generates non-ambiguous one-time credentials with every required character class', () => {
    const values = new Set(Array.from({ length: 32 }, generateTemporaryPassword));
    expect(values.size).toBe(32);
    for (const value of values) {
      expect(value).toHaveLength(12);
      expect(value).toMatch(/[A-Z]/);
      expect(value).toMatch(/[a-z]/);
      expect(value).toMatch(/[0-9]/);
      expect(value).toMatch(/[!@#$%^&*?]/);
      expect(value).not.toMatch(/[01IOlo]/);
    }
  });
});
