import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AiClient from './_components/AiClient';

export default async function AiPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const roles: string[] = (session?.roles as string[]) ?? [];
  if (!roles.includes('SUPER_ADMIN')) redirect('/dashboard');

  return <AiClient />;
}
