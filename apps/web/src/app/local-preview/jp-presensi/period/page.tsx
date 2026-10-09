import { notFound } from 'next/navigation';
import PeriodPreview from './PeriodPreview';
export const dynamic = 'force-dynamic';
export default function Page() {
  if (process.env.NODE_ENV !== 'development' || process.env.DIIS_LOCAL_PREVIEW !== 'true') notFound();
  return <PeriodPreview />;
}
