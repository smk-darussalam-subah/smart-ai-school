export interface FinanceAuthority {
  can(permission: string): boolean;
  hasRole(...roles: string[]): boolean;
}

const SPP_STATUS = new Set(['paid', 'unpaid', 'late', 'waived']);

export function canRecordSpp(authority: FinanceAuthority): boolean {
  return authority.can('finance.create') && authority.hasRole('SUPER_ADMIN', 'TATA_USAHA');
}

export function canApproveSpp(authority: FinanceAuthority): boolean {
  return authority.can('finance.approve') && authority.hasRole('SUPER_ADMIN', 'KEPALA_SEKOLAH');
}

export interface FinanceSppQueryInput {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  month?: string;
  year?: string;
  classId?: string;
}

export function buildFinanceSppQuery(input: FinanceSppQueryInput): URLSearchParams {
  const qs = new URLSearchParams({
    page: String(input.page),
    limit: String(input.limit),
  });

  const search = input.search?.trim().slice(0, 100) ?? '';
  if (search) qs.set('search', search);
  if (input.status && SPP_STATUS.has(input.status)) qs.set('status', input.status);
  if (input.month) qs.set('month', input.month);
  if (input.year) qs.set('year', input.year);
  if (input.classId) qs.set('classId', input.classId);

  return qs;
}

export function defaultSppPeriod(now = new Date()): { month: number; year: number } {
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}
