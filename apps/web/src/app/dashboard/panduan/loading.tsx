export default function HelpLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Memuat panduan DIIS</span>
      <div className="h-8 w-64 animate-pulse rounded bg-slate-200 motion-reduce:animate-none" />
      <div className="h-5 w-full max-w-2xl animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
      <div className="h-12 w-full max-w-3xl animate-pulse rounded-lg bg-slate-200 motion-reduce:animate-none" />
      <div className="space-y-3 border-y border-slate-200 py-5">
        {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />)}
      </div>
    </div>
  );
}
