'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';

interface HealthStatus {
  status: 'ok' | 'error' | 'shutting_down';
  info?: Record<string, { status: string }>;
  error?: Record<string, { status: string; message?: string }>;
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/backend/health', { cache: 'no-store' });
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth({ status: 'error' });
    } finally {
      setLoading(false);
      setLastChecked(new Date());
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const isOk = health?.status === 'ok';
  const checks = { ...(health?.info ?? {}), ...(health?.error ?? {}) };

  return (
    <div className="max-w-xl mx-auto pt-10 px-4">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">🩺 System Health</h1>
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="text-sm text-smk-blue hover:underline disabled:opacity-50"
          >
            {loading ? 'Memeriksa…' : 'Refresh'}
          </button>
        </div>

        {/* Overall status */}
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-lg mb-4 ${
            isOk ? 'bg-green-50' : 'bg-red-50'
          }`}
        >
          <span className={`w-3 h-3 rounded-full shrink-0 ${isOk ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className={`font-semibold ${isOk ? 'text-green-700' : 'text-red-700'}`}>
            {loading ? 'Memeriksa...' : isOk ? 'Semua sistem normal' : 'Ada masalah sistem'}
          </span>
        </div>

        {/* Individual checks */}
        {Object.entries(checks).map(([key, val]) => (
          <div key={key} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
            <span className="text-sm text-gray-600 capitalize">{key.replace(/_/g, ' ')}</span>
            <span
              className={`badge ${
                val.status === 'up' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}
            >
              {val.status}
            </span>
          </div>
        ))}

        {lastChecked && (
          <p className="text-xs text-gray-400 mt-4">
            Terakhir diperiksa: {lastChecked.toLocaleTimeString('id-ID')}
          </p>
        )}
      </Card>
    </div>
  );
}
