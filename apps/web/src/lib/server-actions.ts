'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const API_BASE = process.env.API_URL || 'http://api:3001';

export async function apiAction<T = unknown>(
  path: string,
  method: string,
  body?: unknown,
): Promise<{ data?: T; error?: string }> {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken ?? '';

  try {
    const res = await fetch(`${API_BASE}/api/v1${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
      return { error: err.message || `HTTP ${res.status}` };
    }

    const data = await res.json();
    return { data: data as T };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' };
  }
}
