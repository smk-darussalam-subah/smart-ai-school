import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveHelpAuthority } from '@/lib/help/help-authority';
import {
  findHelpArtifact,
  genericArtifactUnavailable,
  isHelpArtifactReady,
  streamHelpArtifact,
} from '@/lib/help/help-artifacts';
import { canAccessHelpArtifact } from '@/lib/help/help-projection';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return genericArtifactUnavailable();
  const { id } = await params;
  const artifact = findHelpArtifact(id);
  if (!artifact || !isHelpArtifactReady(artifact)) return genericArtifactUnavailable();

  const studentId = new URL(request.url).searchParams.get('studentId');
  const result = await resolveHelpAuthority(session, studentId);
  if (!canAccessHelpArtifact(artifact, result.authority)) {
    return genericArtifactUnavailable();
  }

  return await streamHelpArtifact(artifact, request.signal) ?? genericArtifactUnavailable();
}
