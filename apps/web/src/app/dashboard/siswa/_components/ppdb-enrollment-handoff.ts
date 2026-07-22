export interface PpdbEnrollmentLead {
  id: string;
  fullName: string;
  phone: string;
  schoolOrigin: string | null;
  interestMajor: string | null;
  status: string;
  gender?: 'L' | 'P' | null;
  guardianName?: string | null;
  guardianEmail?: string | null;
  guardianRelation?: string | null;
}

export interface PpdbEnrollmentLeadApi extends PpdbEnrollmentLead {
  notes?: string | Record<string, unknown> | null;
}

export interface WizardInitialValues {
  siswaName: string;
  siswaGender: 'L' | 'P' | '';
  ortuName: string;
  ortuPhone: string;
  ortuEmail: string;
}

export interface EnrollmentClassItem {
  id: string;
  name: string;
  grade?: number;
  majorCode?: string | null;
}

export function isAcceptedPpdbEnrollmentLead(
  lead: PpdbEnrollmentLead | null | undefined,
): lead is PpdbEnrollmentLead {
  return !!lead && lead.status === 'accepted';
}

export function normalizeLeadPhoneForWizard(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith('+')) return trimmed;
  if (trimmed.startsWith('62')) return `+${trimmed}`;
  return trimmed;
}

function parseNotes(notes: PpdbEnrollmentLeadApi['notes']): Record<string, unknown> | null {
  if (!notes) return null;
  if (typeof notes === 'object' && !Array.isArray(notes)) return notes;
  if (typeof notes !== 'string') return null;

  try {
    const parsed: unknown = JSON.parse(notes);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readGender(value: unknown): 'L' | 'P' | null {
  return value === 'L' || value === 'P' ? value : null;
}

function readEnrolledStudentId(notes: Record<string, unknown> | null): string | null {
  const enrollment = notes?.enrollment;
  if (typeof enrollment !== 'object' || enrollment === null || Array.isArray(enrollment)) return null;
  const studentId = (enrollment as Record<string, unknown>).studentId;
  return typeof studentId === 'string' && studentId.trim() ? studentId : null;
}

export function toAcceptedPpdbEnrollmentLead(
  lead: PpdbEnrollmentLeadApi | null | undefined,
): PpdbEnrollmentLead | null {
  if (!isAcceptedPpdbEnrollmentLead(lead)) return null;

  const notes = parseNotes(lead.notes);
  if (readEnrolledStudentId(notes)) return null;
  return {
    id: lead.id,
    fullName: lead.fullName,
    phone: lead.phone,
    schoolOrigin: lead.schoolOrigin,
    interestMajor: lead.interestMajor,
    status: lead.status,
    gender: lead.gender ?? readGender(notes?.gender),
    guardianName: readString(lead.guardianName) ?? readString(notes?.guardianName),
    guardianEmail: readString(lead.guardianEmail) ?? readString(notes?.email),
    guardianRelation: readString(lead.guardianRelation) ?? readString(notes?.guardianRelation),
  };
}

function majorAliases(major: string | null | undefined): string[] {
  const code = (major ?? '').trim().toUpperCase();
  if (!code) return [];
  if (code === 'TKJ' || code === 'TJKT' || code.includes('KOMPUTER') || code.includes('JARINGAN')) {
    return ['TKJ', 'TJKT'];
  }
  if (code === 'AKL' || code.includes('AKUNTANSI')) return ['AKL'];
  if (code === 'TKRO' || code.includes('KENDARAAN RINGAN')) return ['TKRO'];
  if (code === 'TBSM' || code.includes('SEPEDA MOTOR')) return ['TBSM'];
  return [code];
}

export function isRecommendedClassForLead(lead: PpdbEnrollmentLead | null | undefined, item: EnrollmentClassItem): boolean {
  const aliases = majorAliases(lead?.interestMajor);
  if (aliases.length === 0) return false;
  const majorCode = item.majorCode?.trim().toUpperCase();
  const className = item.name.toUpperCase();
  return aliases.some((alias) => majorCode === alias || className.includes(alias));
}

export function getRecommendedClassId(
  lead: PpdbEnrollmentLead | null | undefined,
  classes: EnrollmentClassItem[],
): string {
  const matches = classes.filter((item) => isRecommendedClassForLead(lead, item));
  if (matches.length === 0) return '';

  const gradeTenMatches = matches.filter((item) => item.grade === 10 || /^X(?:\s|-)/i.test(item.name));
  const candidates = gradeTenMatches.length > 0 ? gradeTenMatches : matches;
  return candidates.length === 1 ? candidates[0]!.id : '';
}

export function sortClassesForEnrollmentLead(
  lead: PpdbEnrollmentLead | null | undefined,
  classes: EnrollmentClassItem[],
): EnrollmentClassItem[] {
  return [...classes].sort((a, b) => {
    const aRecommended = isRecommendedClassForLead(lead, a);
    const bRecommended = isRecommendedClassForLead(lead, b);
    if (aRecommended !== bRecommended) return aRecommended ? -1 : 1;
    return a.name.localeCompare(b.name, 'id');
  });
}

export function toWizardInitialValues(lead: PpdbEnrollmentLead): WizardInitialValues {
  return {
    siswaName: lead.fullName,
    siswaGender: lead.gender ?? '',
    ortuName: lead.guardianName ?? '',
    ortuPhone: normalizeLeadPhoneForWizard(lead.phone),
    ortuEmail: lead.guardianEmail ?? '',
  };
}
