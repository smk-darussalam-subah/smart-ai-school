import type { Metadata } from 'next';
import { SpmbIntakeWizard } from './_components/SpmbIntakeWizard';

export const metadata: Metadata = {
  title: 'Daftar Awal SPMB 2027/2028',
  description:
    'Form daftar awal SPMB 2027/2028 SMK Darussalam Subah melalui DIIS.',
};

export default function SpmbPage() {
  return <SpmbIntakeWizard />;
}
