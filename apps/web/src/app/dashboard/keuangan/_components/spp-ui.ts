export interface SppApprovalState {
  status: string;
  approvedAt: string | null;
}

export function isSppApprovable(payment: SppApprovalState): boolean {
  if (payment.approvedAt) return false;
  return payment.status === 'unpaid';
}
