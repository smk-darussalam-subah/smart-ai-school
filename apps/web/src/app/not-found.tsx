// =============================================================================
// 404 Not Found — Custom App Router page
//
// Kenapa file ini ADA DI SINI:
// App Router membutuhkan not-found.tsx untuk halaman 404 yang konsisten
// dengan branding. Tanpa file ini, Next.js menggunakan default error page.
//
// PENTING: jangan import next-auth, session, atau hooks di sini.
// Halaman ini di-static-prerender saat build → tidak punya HTTP context.
// =============================================================================

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <div className="text-center px-4">
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-smk-blue rounded-2xl mb-4">
            <span className="text-white text-3xl font-bold">D</span>
          </div>
        </div>

        <h1 className="text-6xl font-bold text-gray-900 mb-2">404</h1>
        <h2 className="text-xl font-semibold text-gray-700 mb-3">
          Halaman Tidak Ditemukan
        </h2>
        <p className="text-gray-500 mb-8 max-w-sm mx-auto">
          Halaman yang Anda cari tidak ada atau telah dipindahkan.
        </p>

        <Link
          href="/dashboard"
          className="inline-block px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Kembali ke Dashboard
        </Link>
      </div>

      <p className="absolute bottom-6 text-xs text-gray-400">
        DIIS — SMK Darussalam Subah
      </p>
    </div>
  );
}
