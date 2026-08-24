export default function MonitoringLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Memuat monitoring operasional">
      <div className="h-16 animate-pulse rounded-lg bg-slate-200 motion-reduce:animate-none" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="h-96 animate-pulse rounded-lg bg-slate-200 motion-reduce:animate-none" />
        <div className="h-96 animate-pulse rounded-lg bg-slate-200 motion-reduce:animate-none" />
      </div>
    </div>
  );
}
