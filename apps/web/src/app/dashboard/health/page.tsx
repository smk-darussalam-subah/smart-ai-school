import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import HealthClient from './_components/HealthClient';

export default async function HealthPage() {
  const session = await getServerSession(authOptions);
  const roles: string[] = (session?.roles as string[]) ?? [];
  if (!roles.includes('SUPER_ADMIN')) redirect('/dashboard');

  return <HealthClient />;
}
