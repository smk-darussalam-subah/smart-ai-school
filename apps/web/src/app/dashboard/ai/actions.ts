'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { apiErrorMessage } from '@/lib/api';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

async function aiApi<T>(path: string, method: string, body?: unknown): Promise<ActionResult<T>> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return { success: false, error: 'Sesi berakhir. Silakan masuk ulang.' };

  try {
    const res = await fetch(`${API_BASE}/api/v1${path}`, {
      method,
      headers: body
        ? { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` }
        : { Authorization: `Bearer ${session.accessToken}` },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      return { success: false, error: apiErrorMessage(err) };
    }
    const text = await res.text();
    const data = text.trim() ? JSON.parse(text) as T : null as T;
    return { success: true, data };
  } catch {
    return { success: false, error: 'Koneksi ke server gagal. Coba lagi.' };
  }
}

export interface AiChatSessionSummary {
  id: string;
  title: string | null;
  updatedAt: string;
}

export interface AiChatMessage {
  role: string;
  content: string;
}

export interface AiChatResponse {
  answer?: string;
  sources?: { title: string }[];
  sessionId?: string;
}

export async function fetchAiChatSessions(limit = 20): Promise<ActionResult<{ data?: AiChatSessionSummary[] }>> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);
  return aiApi<{ data?: AiChatSessionSummary[] }>(`/ai/chat/sessions?limit=${safeLimit}`, 'GET');
}

export async function fetchAiChatHistory(id: string): Promise<ActionResult<{ messages?: AiChatMessage[] }>> {
  return aiApi<{ messages?: AiChatMessage[] }>(`/ai/chat/${encodeURIComponent(id)}/history`, 'GET');
}

export async function deleteAiChatSession(id: string): Promise<ActionResult<unknown>> {
  return aiApi<unknown>(`/ai/chat/${encodeURIComponent(id)}`, 'DELETE');
}

export async function sendAiChatMessage(data: { message: string; sessionId?: string | null }): Promise<ActionResult<AiChatResponse>> {
  return aiApi<AiChatResponse>('/ai/chat', 'POST', {
    message: data.message,
    ...(data.sessionId ? { sessionId: data.sessionId } : {}),
  });
}
