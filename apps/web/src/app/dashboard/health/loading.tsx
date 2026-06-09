import { Skeleton } from '@/components/ui/skeleton';

export default function HealthLoading() {
  return <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({ length: 5 }).map((_, i) => (<Skeleton key={i} className="h-32 rounded-xl" />))}</div>;
}
