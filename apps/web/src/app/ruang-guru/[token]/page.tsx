import PublicKioskBoard, { type KioskBundle } from './_components/PublicKioskBoard';

const API_BASE = process.env.API_URL || 'http://api:3001';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ruang Guru — DIIS' };

export default async function RuangGuruPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let data: KioskBundle | null = null;
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/kiosk?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
    if (res.ok) data = (await res.json()) as KioskBundle;
  } catch {
    data = null;
  }

  if (!data) {
    return (
      <div className="min-h-screen grid place-items-center bg-gray-50 p-6 text-center">
        <div>
          <p className="text-lg font-bold text-gray-800">Tautan tidak valid</p>
          <p className="mt-1 text-sm text-gray-500">Link Ruang Guru kedaluwarsa atau salah. Minta tautan baru ke admin.</p>
        </div>
      </div>
    );
  }
  return <PublicKioskBoard data={data} />;
}
