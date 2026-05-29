// =============================================================================
// Providers — legacy passthrough yang dipertahankan untuk backward compatibility.
//
// Arsitektur saat ini: SessionProvider TIDAK di-mount global, tetapi per-segment
// di DashboardProviders.tsx (hanya di bawah /dashboard/*). Halaman publik
// (/, /login, /404) tidak butuh SessionProvider.
//
// Lihat: apps/web/src/components/providers/DashboardProviders.tsx
// =============================================================================

export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
