import {
  isAcceptedPpdbEnrollmentLead,
  normalizeLeadPhoneForWizard,
  toWizardInitialValues,
  type PpdbEnrollmentLead,
} from '@/app/dashboard/siswa/_components/ppdb-enrollment-handoff';

const acceptedLead: PpdbEnrollmentLead = {
  id: '11111111-1111-4111-8111-111111111111',
  fullName: 'Ahmad Rizki Maulana',
  phone: '6281234567890',
  schoolOrigin: 'SMP Negeri 1 Subah',
  interestMajor: 'TKJ',
  status: 'accepted',
};

describe('PPDB enrollment handoff', () => {
  it('only accepted leads are valid enrollment handoff inputs', () => {
    expect(isAcceptedPpdbEnrollmentLead(acceptedLead)).toBe(true);
    expect(isAcceptedPpdbEnrollmentLead({ ...acceptedLead, status: 'paid' })).toBe(false);
    expect(isAcceptedPpdbEnrollmentLead(null)).toBe(false);
  });

  it('normalizes PPDB phone into wizard-friendly E.164 input', () => {
    expect(normalizeLeadPhoneForWizard('6281234567890')).toBe('+6281234567890');
    expect(normalizeLeadPhoneForWizard('+6281234567890')).toBe('+6281234567890');
  });

  it('prefills wizard values without inventing NIS, class, wali, or consent', () => {
    expect(toWizardInitialValues(acceptedLead)).toEqual({
      siswaName: 'Ahmad Rizki Maulana',
      ortuPhone: '+6281234567890',
    });
  });
});
