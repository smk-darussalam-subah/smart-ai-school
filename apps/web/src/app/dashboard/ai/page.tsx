import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveDashboardAuthority } from '@/lib/dashboard-authority';
import { redirect } from 'next/navigation';
import AiClient from './_components/AiClient';
import { normalizeInitialQuestion } from './ai-chat-ui';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AiPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const authority = await resolveDashboardAuthority(session);
  if (!authority.can('ai.chat')) redirect('/dashboard');
  const sp = await searchParams;
  const initialQuestion = normalizeInitialQuestion(sp.q);

  return <AiClient initialQuestion={initialQuestion} />;
}
