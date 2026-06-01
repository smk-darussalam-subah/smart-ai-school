// =============================================================================
// Shared TypeScript Types — Smart AI School (SMK Darussalam Subah)
// Semua interface dan type yang dipakai bersama oleh apps/api dan apps/web
// =============================================================================

// ── Auth & User ──────────────────────────────────────────────────────────────

export type UserRole =
  | 'SUPER_ADMIN'
  | 'KEPALA_SEKOLAH'
  | 'GURU'
  | 'SISWA'
  | 'ORANG_TUA'
  | 'INDUSTRI';

export interface User {
  id: string;           // UUID
  keycloakId: string;
  email: string;
  fullName: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Student ───────────────────────────────────────────────────────────────────

export type StudentStatus = 'active' | 'inactive' | 'graduated' | 'dropped';

export interface Student {
  id: string;
  userId: string;
  nis: string;           // Nomor Induk Siswa
  classId: string;
  parentId?: string;
  status: StudentStatus;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ── Academic ──────────────────────────────────────────────────────────────────

export interface Class {
  id: string;
  name: string;          // mis: 'XII RPL 1'
  majorCode: string;     // mis: 'RPL', 'TKRO', 'DKV', 'AKL'
  grade: 10 | 11 | 12;
  teacherId: string;     // wali kelas
  academicYear: string;  // mis: '2025/2026'
  capacity: number;
  createdAt: Date;
}

export interface Teacher {
  id: string;
  userId: string;
  nip?: string;          // Nomor Induk Pegawai
  subjects: string[];
  isWaliKelas: boolean;
  classId?: string;
  createdAt: Date;
}

// ── PPDB (Penerimaan Peserta Didik Baru) ──────────────────────────────────────

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'interested'
  | 'registered'
  | 'paid'
  | 'accepted'
  | 'rejected'
  | 'cold';

export type LeadSource =
  | 'chatbot_wa'
  | 'website'
  | 'referral'
  | 'instagram'
  | 'tiktok'
  | 'event'
  | 'walk_in'
  | 'other';

export interface PpdbLead {
  id: string;
  fullName: string;
  phone: string;
  schoolOrigin?: string;
  interestMajor?: string;
  source: LeadSource;
  status: LeadStatus;
  notes?: string;
  assignedTo?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Notification ──────────────────────────────────────────────────────────────

export type NotifChannel = 'whatsapp' | 'email' | 'push' | 'in_app';
export type NotifStatus = 'pending' | 'sent' | 'failed' | 'read';

export interface Notification {
  id: string;
  recipientId: string;
  channel: NotifChannel;
  subject?: string;
  body: string;
  status: NotifStatus;
  sentAt?: Date;
  createdAt: Date;
}

/**
 * Abstraksi pengiriman notifikasi — anti lock-in ke provider manapun.
 * Throw jika pengiriman gagal; caller (NotificationService) yang mencatat failed.
 */
export interface NotificationAdapter {
  send(
    channel: 'whatsapp' | 'email',
    to: string,
    body: string,
    subject?: string,
  ): Promise<void>;
}

// ── API Response Wrapper ──────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ── Query Params ──────────────────────────────────────────────────────────────

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}
