import { isSppApprovable } from '@/app/dashboard/keuangan/_components/spp-ui';

describe('SPP approval UI state', () => {
  it('shows approval affordance for newly-created unpaid manual records', () => {
    expect(isSppApprovable({ status: 'unpaid', approvedAt: null })).toBe(true);
  });

  it('hides approval affordance after approval or for non-receipt statuses', () => {
    expect(isSppApprovable({ status: 'unpaid', approvedAt: '2026-07-16T00:00:00.000Z' })).toBe(false);
    expect(isSppApprovable({ status: 'paid', approvedAt: null })).toBe(false);
    expect(isSppApprovable({ status: 'waived', approvedAt: null })).toBe(false);
    expect(isSppApprovable({ status: 'late', approvedAt: null })).toBe(false);
  });
});
