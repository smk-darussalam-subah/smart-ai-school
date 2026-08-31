import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveHelpAuthority } from '@/lib/help/help-authority';
import { canAccessHelpScreenshot } from '@/lib/help/help-projection';
import {
  findHelpScreenshot,
  genericScreenshotUnavailable,
  isHelpScreenshotReady,
  streamHelpScreenshot,
} from '@/lib/help/help-screenshots';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return genericScreenshotUnavailable();

  const { id } = await params;
  const screenshot = findHelpScreenshot(id);
  if (!screenshot || !isHelpScreenshotReady(screenshot)) return genericScreenshotUnavailable();

  const studentId = new URL(request.url).searchParams.get('studentId');
  const result = await resolveHelpAuthority(session, studentId);
  if (!canAccessHelpScreenshot(screenshot, result.authority)) return genericScreenshotUnavailable();

  return await streamHelpScreenshot(screenshot, request.signal) ?? genericScreenshotUnavailable();
}
