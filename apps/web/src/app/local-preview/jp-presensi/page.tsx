import { notFound } from 'next/navigation';
import LocalPreview from './LocalPreview';
export const dynamic = 'force-dynamic';
export default function PreviewPage() {
  if (process.env.NODE_ENV !== 'development' || process.env.DIIS_LOCAL_PREVIEW !== 'true')
    notFound();
  return <LocalPreview />;
}
