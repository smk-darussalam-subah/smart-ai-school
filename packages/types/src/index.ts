// =============================================================================
// Shared TypeScript Types — Smart AI School (SMK Darussalam Subah)
// Semua interface dan type yang dipakai bersama oleh apps/api dan apps/web
// =============================================================================

// ── Auth & User ──────────────────────────────────────────────────────────────

export type UserRole =
  | 'SUPER_ADMIN'
  | 'KEPALA_SEKOLAH'
  | 'TATA_USAHA'
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
  niy?: string;          // Nomor Induk Yayasan (identitas kepegawaian di school.staff)
  subjects: string[];
  isWaliKelas: boolean;
  classId?: string;
  createdAt: Date;
}

export type AssessmentType = 'diagnostik' | 'formatif' | 'sumatif';
export type AssessmentSessionStatus = 'draft' | 'active' | 'completed';
export type AssessmentGradeTarget = 'uh' | 'uts' | 'uas';
export type AssessmentQuestionType = 'multiple_choice' | 'essay' | 'true_false' | 'matching';
export type AssessmentDifficulty = 'easy' | 'medium' | 'hard';

export interface AssessmentOption {
  id: string;
  text: string;
}

export interface AssessmentRubricCriterion {
  id: string;
  name: string;
  description?: string;
  weight: number;
  maxScore: number;
}

export interface AssessmentMatchingPair {
  id: string;
  prompt: string;
  match: string;
}

export interface AssessmentQuestionBase {
  id: string;
  type: AssessmentQuestionType;
  body: string;
  subject: string;
  difficulty: AssessmentDifficulty;
  tags: string[];
}

export interface AssessmentMultipleChoiceQuestion extends AssessmentQuestionBase {
  type: 'multiple_choice';
  options: AssessmentOption[];
  answer: string;
}

export interface AssessmentTrueFalseQuestion extends AssessmentQuestionBase {
  type: 'true_false';
  answer: boolean;
}

export interface AssessmentMatchingQuestion extends AssessmentQuestionBase {
  type: 'matching';
  pairs: AssessmentMatchingPair[];
  answer: Record<string, string>;
}

export interface AssessmentEssayQuestion extends AssessmentQuestionBase {
  type: 'essay';
  guideAnswer?: string;
  rubric: AssessmentRubricCriterion[];
}

export type AssessmentQuestion =
  | AssessmentMultipleChoiceQuestion
  | AssessmentTrueFalseQuestion
  | AssessmentMatchingQuestion
  | AssessmentEssayQuestion;

export type AssessmentStudentQuestion =
  | Omit<AssessmentMultipleChoiceQuestion, 'answer'>
  | Omit<AssessmentTrueFalseQuestion, 'answer'>
  | Omit<AssessmentMatchingQuestion, 'answer' | 'pairs'> & {
      prompts: Array<Pick<AssessmentMatchingPair, 'id' | 'prompt'>>;
      choices: AssessmentOption[];
    }
  | Omit<AssessmentEssayQuestion, 'guideAnswer' | 'rubric'> & {
      rubricCriteria: Array<Pick<AssessmentRubricCriterion, 'id' | 'name' | 'maxScore'>>;
    };

export interface AssessmentQuestionSelection {
  questionId: string;
  points: number;
  order: number;
}

export type AssessmentAnswerValue =
  | { type: 'multiple_choice'; optionId: string }
  | { type: 'true_false'; value: boolean }
  | { type: 'matching'; pairs: Record<string, string> }
  | { type: 'essay'; text: string };

export type AssessmentAnswerMap = Record<string, AssessmentAnswerValue>;

export interface AssessmentItemScore {
  questionId: string;
  type: AssessmentQuestionType;
  status: 'auto' | 'manual_pending' | 'manual_scored';
  points: number;
  maxPoints: number;
  scorePct: number | null;
  rubricScores?: Record<string, number>;
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

// ── AI Gateway ───────────────────────────────────────────────────────────────

/**
 * Potongan konteks RAG yang dioper ke AIGateway.chat().
 * Decoupled dari Prisma model agar tidak ada ketergantungan langsung.
 */
export interface RagContext {
  title: string;
  content: string;
}

export interface AiChatOptions {
  responseFormat?: 'json_object' | {
    type: 'json_schema';
    name: string;
    schema: Record<string, unknown>;
    strict?: boolean;
  };
}

/**
 * Abstraksi AI provider — anti lock-in ke Ollama/Claude/OpenAI.
 * embed() panjang array HARUS == OLLAMA_EMBED_DIMENSIONS (768).
 */
export interface AIGateway {
  chat(prompt: string, context?: RagContext[], options?: AiChatOptions): Promise<string>;
  embed(text: string): Promise<number[]>;
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
