import { Skeleton } from '@/components/ui/skeleton';

export default function UsersLoading() {
  return <div className="space-y-4"><Skeleton className="h-8 w-48" /><div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => (<Skeleton key={i} className="h-14 w-full" />))}</div></div>;
}
