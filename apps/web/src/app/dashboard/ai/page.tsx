import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import AiClient from './_components/AiClient';

export default async function AiPage() {
  const session = await getServerSession(authOptions);
  const isAuthenticated = !!session;
  return <AiClient isAuthenticated={isAuthenticated} />;
}
