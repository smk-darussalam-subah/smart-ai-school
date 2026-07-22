import {
  getRecommendedClassId,
  isAcceptedPpdbEnrollmentLead,
  normalizeLeadPhoneForWizard,
  toAcceptedPpdbEnrollmentLead,
  toWizardInitialValues,
  type PpdbEnrollmentLead,
  type PpdbEnrollmentLeadApi,
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

  it('prefills wizard values without inventing NIS or consent', () => {
    expect(toWizardInitialValues(acceptedLead)).toEqual({
      siswaName: 'Ahmad Rizki Maulana',
      siswaGender: '',
      ortuName: '',
      ortuPhone: '+6281234567890',
      ortuEmail: '',
    });
  });

  it('extracts safe SPMB metadata from PPDB detail notes for enrollment prefill', () => {
    const apiLead: PpdbEnrollmentLeadApi = {
      ...acceptedLead,
      notes: JSON.stringify({
        kind: 'spmb_2027_2028_intake',
        gender: 'L',
        guardianName: 'Bapak Ahmad',
        guardianRelation: 'Ayah',
        email: 'wali@example.sch.id',
        nisn: '1234567890',
      }),
    };

    const lead = toAcceptedPpdbEnrollmentLead(apiLead);

    expect(lead).toMatchObject({
      gender: 'L',
      guardianName: 'Bapak Ahmad',
      guardianRelation: 'Ayah',
      guardianEmail: 'wali@example.sch.id',
    });
    expect(toWizardInitialValues(lead!)).toEqual({
      siswaName: 'Ahmad Rizki Maulana',
      siswaGender: 'L',
      ortuName: 'Bapak Ahmad',
      ortuPhone: '+6281234567890',
      ortuEmail: 'wali@example.sch.id',
    });
  });

  it('does not reopen enrollment wizard for a lead already linked to a student', () => {
    const apiLead: PpdbEnrollmentLeadApi = {
      ...acceptedLead,
      notes: JSON.stringify({
        kind: 'spmb_2027_2028_intake',
        enrollment: { studentId: 'student-1' },
      }),
    };

    expect(toAcceptedPpdbEnrollmentLead(apiLead)).toBeNull();
  });

  it('recommends a single grade 10 class matching PPDB major aliases', () => {
    expect(
      getRecommendedClassId(
        acceptedLead,
        [
          { id: 'akl', name: 'X AKL 1', grade: 10, majorCode: 'AKL' },
          { id: 'tkj', name: 'X TJKT 1', grade: 10, majorCode: 'TJKT' },
        ],
      ),
    ).toBe('tkj');
  });

  it('recommends a class when PPDB major is stored as the public label', () => {
    expect(
      getRecommendedClassId(
        { ...acceptedLead, interestMajor: 'Teknik Komputer dan Jaringan' },
        [
          { id: 'akl', name: 'X AKL 1', grade: 10, majorCode: 'AKL' },
          { id: 'tkj', name: 'X TJKT 1', grade: 10, majorCode: 'TJKT' },
        ],
      ),
    ).toBe('tkj');
  });

  it('does not auto-pick a class when more than one matching class exists', () => {
    expect(
      getRecommendedClassId(
        acceptedLead,
        [
          { id: 'tkj-1', name: 'X TKJ 1', grade: 10, majorCode: 'TKJ' },
          { id: 'tkj-2', name: 'X TKJ 2', grade: 10, majorCode: 'TKJ' },
        ],
      ),
    ).toBe('');
  });
});
