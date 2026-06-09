import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import UsersClient from './_components/UsersClient';

export default async function UsersPage() {
  const session = await getServerSession(authOptions);
  const roles: string[] = (session?.roles as string[]) ?? [];
  if (!roles.includes('SUPER_ADMIN')) redirect('/dashboard');

  return <UsersClient />;
}
