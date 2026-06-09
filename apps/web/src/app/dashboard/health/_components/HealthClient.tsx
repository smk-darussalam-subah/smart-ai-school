'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ServiceStatus { name: string; status: 'up' | 'down' | 'checking' | 'unverified'; description: string; }

export default function HealthClient() {
  const [services, setServices] = useState<ServiceStatus[]>([]);

  useEffect(() => {
    const checkServices = async () => {
      setServices([
        { name: 'API Backend', status: 'checking', description: 'NestJS Fastify' },
        { name: 'Database', status: 'checking', description: 'PostgreSQL 16' },
        { name: 'Keycloak SSO', status: 'checking', description: 'Auth Server' },
        { name: 'Ollama AI', status: 'checking', description: 'LLM Lokal' },
        { name: 'Redis Cache', status: 'checking', description: 'Cache & Queue' },
      ]);

      try {
        const res = await fetch('/api/backend/health');
        if (res.ok) {
          updateService('API Backend', 'up');
          const data = await res.json().catch(() => null);
          if (data) {
            if (data.status === 'ok' || data.database === 'connected') updateService('Database', 'up');
            else updateService('Database', 'unverified');
          }
        } else {
          updateService('API Backend', 'down');
        }
      } catch { updateService('API Backend', 'down'); }

      // Services without direct health endpoints marked as unverified
      updateService('Keycloak SSO', 'unverified');
      updateService('Ollama AI', 'unverified');
      updateService('Redis Cache', 'unverified');
    };

    checkServices();
  }, []);

  const updateService = (name: string, status: 'up' | 'down' | 'unverified') => {
    setServices(prev => prev.map(s => s.name === name ? { ...s, status } : s));
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">🩺 System Health</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {services.map(s => (
          <Card key={s.name}>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{s.name}</CardTitle></CardHeader>
            <CardContent>
              <Badge variant={s.status === 'up' ? 'default' : s.status === 'down' ? 'destructive' : 'secondary'}
                className={s.status === 'up' ? 'bg-green-600 hover:bg-green-700' : s.status === 'unverified' ? 'bg-yellow-100 text-yellow-700' : ''}>
                {s.status === 'up' ? '✅ UP' : s.status === 'down' ? '❌ DOWN' : s.status === 'unverified' ? '❓ Unverified' : '⏳ Checking...'}
              </Badge>
              <p className="text-xs text-muted-foreground mt-2">{s.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Quick Links</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {[
            { label: 'Grafana', url: 'https://monitor.smkdarussalamsubah.sch.id' },
            { label: 'Metabase', url: 'https://analytics.smkdarussalamsubah.sch.id' },
            { label: 'n8n', url: 'https://n8n.smkdarussalamsubah.sch.id' },
            { label: 'Keycloak Admin', url: 'https://auth.smkdarussalamsubah.sch.id' },
            { label: 'Uptime Kuma', url: 'https://status.smkdarussalamsubah.sch.id' },
            { label: 'API Health', url: '/api/backend/health' },
            { label: 'API Metrics', url: '/api/backend/metrics' },
            { label: 'Audit Log', url: '/api/backend/audit-logs' },
          ].map(link => (
            <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer"
              className="text-slate-700 hover:text-smk-blue underline underline-offset-2">
              {link.label}
            </a>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
