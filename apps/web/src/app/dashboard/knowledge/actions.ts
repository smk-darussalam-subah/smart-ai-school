'use server';
// =============================================================================
// Server Actions — Knowledge Base mutations
// Token diambil server-side via getServerSession; tidak pernah dikirim ke client.
// =============================================================================

import { getServerSession } from 'next-auth';
import { revalidatePath } from 'next/cache';
import { authOptions } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import type { KnowledgeDetail, BackfillResult } from '@/lib/api';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

// ── Private fetch helper (supports method + body) ─────────────────────────────

async function apiMutate<T>(
  path: string,
  token: string,
  method: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const url = new URL(`/api/v1${path}`, API_BASE);
  try {
    const res = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const data: T | null = res.ok ? ((await res.json()) as T) : null;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

// ── Public result types ───────────────────────────────────────────────────────

export interface ActionResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export interface CreateActionResult extends ActionResult {
  embeddingOk?: boolean;
}

export interface BackfillActionResult extends ActionResult {
  data?: BackfillResult;
}

// ── Read action (used in Edit flow) ──────────────────────────────────────────

export async function getKnowledgeDetailAction(id: string): Promise<KnowledgeDetail | null> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return null;
  return apiFetch<KnowledgeDetail>(`/ai/knowledge/${id}`, session.accessToken);
}

// ── Mutation actions ──────────────────────────────────────────────────────────

export async function createKnowledgeAction(body: {
  title: string;
  content: string;
  category: string;
  source?: string;
}): Promise<CreateActionResult> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return { ok: false, error: 'Sesi tidak valid' };

  const result = await apiMutate<{ embeddingOk: boolean }>(
    '/ai/knowledge',
    session.accessToken,
    'POST',
    body,
  );
  revalidatePath('/dashboard/knowledge');

  if (!result.ok) {
    return { ok: false, status: result.status, error: 'Gagal membuat knowledge' };
  }
  return { ok: true, embeddingOk: result.data?.embeddingOk };
}

export async function updateKnowledgeAction(
  id: string,
  body: { title?: string; content?: string; category?: string },
): Promise<ActionResult> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return { ok: false, error: 'Sesi tidak valid' };

  const result = await apiMutate(
    `/ai/knowledge/${id}`,
    session.accessToken,
    'PATCH',
    body,
  );
  revalidatePath('/dashboard/knowledge');

  if (!result.ok) {
    return { ok: false, status: result.status, error: 'Gagal mengubah knowledge' };
  }
  return { ok: true };
}

export async function publishKnowledgeAction(id: string): Promise<ActionResult> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return { ok: false, error: 'Sesi tidak valid' };

  const result = await apiMutate(
    `/ai/knowledge/${id}/publish`,
    session.accessToken,
    'POST',
  );
  revalidatePath('/dashboard/knowledge');

  if (!result.ok) {
    if (result.status === 422) {
      return {
        ok: false,
        status: 422,
        error: 'Belum ada embedding — jalankan Backfill atau edit konten dulu',
      };
    }
    if (result.status === 403) return { ok: false, status: 403, error: 'Akses ditolak' };
    return { ok: false, status: result.status, error: 'Gagal publish' };
  }
  return { ok: true };
}

export async function unpublishKnowledgeAction(id: string): Promise<ActionResult> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return { ok: false, error: 'Sesi tidak valid' };

  const result = await apiMutate(
    `/ai/knowledge/${id}/unpublish`,
    session.accessToken,
    'POST',
  );
  revalidatePath('/dashboard/knowledge');

  if (!result.ok) return { ok: false, status: result.status, error: 'Gagal unpublish' };
  return { ok: true };
}

export async function deleteKnowledgeAction(id: string): Promise<ActionResult> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return { ok: false, error: 'Sesi tidak valid' };

  const result = await apiMutate(
    `/ai/knowledge/${id}`,
    session.accessToken,
    'DELETE',
  );
  revalidatePath('/dashboard/knowledge');

  if (!result.ok) return { ok: false, status: result.status, error: 'Gagal menghapus' };
  return { ok: true };
}

export async function backfillKnowledgeAction(): Promise<BackfillActionResult> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return { ok: false, error: 'Sesi tidak valid' };

  const result = await apiMutate<BackfillResult>(
    '/ai/knowledge/backfill',
    session.accessToken,
    'POST',
  );
  revalidatePath('/dashboard/knowledge');

  if (!result.ok) return { ok: false, status: result.status, error: 'Backfill gagal' };
  return { ok: true, data: result.data ?? undefined };
}
