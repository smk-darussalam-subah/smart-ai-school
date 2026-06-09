'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function UsersClient() {
  const [permissions, setPermissions] = useState<Array<{ code: string; description: string; module: string }>>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/backend/permissions').then(r => r.json()).then(setPermissions).catch(() => {
      setError('Gagal memuat data permission');
    });
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">👥 Manajemen User</h1>

      <Card>
        <CardHeader><CardTitle>Permission System</CardTitle></CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                Permission saat ini dikelola via API. Gunakan endpoint di bawah untuk mengelola RBAC.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {permissions.map(p => (
                  <div key={p.code} className="text-xs bg-gray-50 rounded-lg p-2 border">
                    <code className="text-slate-700 font-mono">{p.code}</code>
                    <p className="text-muted-foreground mt-0.5">{p.module}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>API Endpoints</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {[
            { method: 'GET', path: '/api/v1/permissions', desc: 'List permission' },
            { method: 'POST', path: '/api/v1/permissions', desc: 'Buat permission baru' },
            { method: 'GET', path: '/api/v1/permissions/roles/:role', desc: 'Permission per role' },
            { method: 'PUT', path: '/api/v1/permissions/roles/:role', desc: 'Set permission role' },
            { method: 'GET', path: '/api/v1/permissions/users/:userId', desc: 'Override per-user' },
            { method: 'POST', path: '/api/v1/permissions/users/:userId/grant', desc: 'Grant override' },
            { method: 'DELETE', path: '/api/v1/permissions/users/:userId/revoke', desc: 'Revoke override' },
          ].map(ep => (
            <div key={ep.path} className="flex gap-3 items-start">
              <Badge variant={ep.method === 'GET' ? 'default' : ep.method === 'DELETE' ? 'destructive' : 'secondary'} className="font-mono text-xs shrink-0">{ep.method}</Badge>
              <code className="text-xs text-slate-700 shrink-0">{ep.path}</code>
              <span className="text-muted-foreground">{ep.desc}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
