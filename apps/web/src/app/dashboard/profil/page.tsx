import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveRoles } from '@/lib/view-as';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import type { Metadata } from 'next';
import ProfilClient from './_components/ProfilClient';

export const metadata: Metadata = { title: 'Profil Sekolah' };

export interface SchoolProfile {
  id: string;
  name: string;
  npsn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  headmasterName: string | null;
  headmasterNip: string | null;
  logoUrl: string | null;
  accreditation: string | null;
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusM: number | null;
}

export interface MajorRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export default async function ProfilPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const roles: string[] = await getEffectiveRoles(session);
  const isSuperAdmin = roles.includes('SUPER_ADMIN');

  const token = session.accessToken ?? '';

  const [profileRes, majorsRes] = await Promise.all([
    apiFetch<SchoolProfile>('/school/profile', token),
    apiFetch<MajorRow[]>('/school/majors', token),
  ]);

  const profile = profileRes;
  const majors = Array.isArray(majorsRes) ? majorsRes : [];

  return (
    <ProfilClient
      profile={profile}
      majors={majors}
      isSuperAdmin={isSuperAdmin}
    />
  );
}
