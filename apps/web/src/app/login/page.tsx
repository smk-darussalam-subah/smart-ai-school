'use client';

// Login page — tidak pakai useSession() karena SessionProvider hanya
// di-mount di bawah /dashboard/* (lihat DashboardProviders.tsx).
// Redirect authenticated users ditangani middleware.ts.
// signIn() dari next-auth/react bisa dipanggil tanpa SessionProvider scope.

import { signIn } from 'next-auth/react';
import { useState } from 'react';

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    setIsLoading(true);
    await signIn('keycloak', { callbackUrl: '/dashboard' });
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-900 via-primary-700 to-smk-green">
      <div className="w-full max-w-md mx-4">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl px-8 py-10 text-center">
          {/* Logo / branding */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-smk-blue rounded-2xl flex items-center justify-center">
              <span className="text-white text-2xl font-bold">D</span>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-1">DIIS</h1>
          <p className="text-sm text-gray-500 mb-2">Digital Integrated Information System</p>
          <p className="text-xs text-gray-400 mb-8">SMK Darussalam Subah · Smart AI School 5.0</p>

          {/* Login button */}
          <button onClick={handleLogin} disabled={isLoading} className="btn-primary w-full py-3 text-base">
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Mengarahkan ke SSO…
              </span>
            ) : (
              'Masuk dengan Akun Sekolah'
            )}
          </button>

          <p className="mt-6 text-xs text-gray-400">
            Gunakan akun yang telah didaftarkan oleh administrator sekolah.
            <br />
            Butuh bantuan? Hubungi TU sekolah.
          </p>
        </div>

        <p className="text-center text-xs text-white/50 mt-6">
          © {new Date().getFullYear()} SMK Darussalam Subah · DIIS v1.0
        </p>
      </div>
    </main>
  );
}
