import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function KalenderLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <Card>
        <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
