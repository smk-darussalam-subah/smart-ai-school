import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function PpdbLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Card><CardHeader><Skeleton className="h-5 w-64" /></CardHeader>
      <CardContent className="space-y-3">{Array.from({ length: 5 }).map((_, i) => (<Skeleton key={i} className="h-12 w-full" />))}</CardContent></Card>
    </div>
  );
}
