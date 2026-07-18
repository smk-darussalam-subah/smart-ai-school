export interface PpdbEnrollmentLead {
  id: string;
  fullName: string;
  phone: string;
  schoolOrigin: string | null;
  interestMajor: string | null;
  status: string;
}

export interface WizardInitialValues {
  siswaName: string;
  ortuPhone: string;
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

export function toWizardInitialValues(lead: PpdbEnrollmentLead): WizardInitialValues {
  return {
    siswaName: lead.fullName,
    ortuPhone: normalizeLeadPhoneForWizard(lead.phone),
  };
}
