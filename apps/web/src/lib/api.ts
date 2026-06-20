// =============================================================================
// API client — server-side fetch ke NestJS backend dengan Bearer token.
// Digunakan di Server Components; JANGAN pakai di client components.
// Gunakan /api/backend/* rewrite untuk fetch dari client.
// =============================================================================

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

// ── Shared types ──────────────────────────────────────────────────────────────

export interface StudentRef {
  id: string;
  nis: string;
  user: { fullName: string };
}

export interface GradeItem {
  id: string;
  studentId: string;
  semester: number;
  academicYear: string;
  score: string; // Prisma Decimal serialized as string
  type: 'uts' | 'uh' | 'uas' | 'praktik' | 'sikap';
  notes: string | null;
  student: StudentRef;
  assignment: {
    subject: string;
    classId: string;
    academicYear: string;
    class: { id: string; name: string };
  };
}

export interface AttendanceItem {
  id: string;
  studentId: string;
  classId: string;
  date: string;
  status: 'hadir' | 'izin' | 'sakit' | 'alpha';
  notes: string | null;
  student: StudentRef;
  class: { id: string; name: string; majorCode: string };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// ── Knowledge Base types ──────────────────────────────────────────────────────

export interface KnowledgeListItem {
  id: string;
  title: string;
  category: string;
  isActive: boolean;
  hasEmbedding: boolean;
  createdBy: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface KnowledgeDetail extends KnowledgeListItem {
  content: string;
  source: string;
  updatedAt: string;
}

export interface BackfillResult {
  total: number;
  success: number;
  failed: number;
}

// ── Fetch helper ──────────────────────────────────────────────────────────────

/**
 * Server-side fetch ke API dengan Bearer token.
 * Mengembalikan null jika gagal (401, 403, 5xx, network error).
 * Caller bertanggung jawab menangani null sebagai empty state.
 */
export async function apiFetch<T>(
  path: string,
  token: string,
  params?: Record<string, string>,
): Promise<T | null> {
  const url = new URL(`/api/v1${path}`, API_BASE);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store', // data absensi/nilai harus selalu fresh
    });

    if (!res.ok) {
      if (process.env.NODE_ENV === 'development') console.error(`[apiFetch] ${res.status} ${path}`);
      return null;
    }
    return res.json() as Promise<T>;
  } catch (err) {
    if (process.env.NODE_ENV === 'development') console.error(`[apiFetch] network error ${path}:`, err);
    return null;
  }
}

/**
 * Ekstrak pesan error API yang ramah dari body respons gagal.
 * NestJS exception → { message: string }. ZodPipe (validasi) → { message: [{field,message}] }.
 * Selalu kembalikan string yang bisa ditampilkan ke user.
 */
export function apiErrorMessage(body: unknown, fallback = 'Gagal memproses permintaan.'): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m;
    if (Array.isArray(m)) {
      const parts = m
        .map((x) => {
          if (typeof x === 'string') return x;
          if (x && typeof x === 'object' && 'message' in x) {
            const field = 'field' in x && (x as { field: unknown }).field ? `${(x as { field: unknown }).field}: ` : '';
            return `${field}${(x as { message: unknown }).message}`;
          }
          return '';
        })
        .filter(Boolean);
      if (parts.length) return parts.join('; ');
    }
  }
  return fallback;
}
