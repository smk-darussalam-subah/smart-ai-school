// =============================================================================
// provision.dto.ts — DTO untuk ProvisioningService
// =============================================================================

import { z } from 'zod';
import { UserRole } from '@smk/auth';
import { phoneE164 } from '../../common/helpers/phone';

// Role pegawai internal yayasan → wajib NIY + status kepegawaian (punya baris school.staff).
export const STAFF_ROLES = ['GURU', 'TATA_USAHA', 'KEPALA_SEKOLAH'] as const;

const GenderSchema = z.enum(['L', 'P']);
const EmploymentStatusSchema = z.enum(['GTY', 'GTT', 'PTY', 'PTT']);

export const ProvisionUserSchema = z.object({
  role: UserRole,
  fullName: z.string().min(1, 'fullName wajib diisi'),
  gender: GenderSchema,
  email: z.string().email().optional(),
  phone: z.string().optional(),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'birthDate harus format YYYY-MM-DD')
    .optional(),
  address: z.string().max(500).optional(),
  niy: z.string().min(1).max(50).optional(),
  employmentStatus: EmploymentStatusSchema.optional(),
}).strict()
  // Aturan email/phone per-role (sama seperti sebelumnya).
  .refine(
    (dto) => {
      if (dto.role === 'SISWA') return false;
      const needsEmail = (['GURU', 'TATA_USAHA', 'KEPALA_SEKOLAH', 'SUPER_ADMIN', 'INDUSTRI'] as string[]).includes(dto.role);
      const needsPhone = dto.role === 'ORANG_TUA';
      if (needsEmail && !dto.email) return false;
      if (needsPhone && !dto.phone) return false;
      return true;
    },
    (dto) => {
      if (dto.role === 'SISWA') {
        return { message: 'Role SISWA tidak diterima di /provision/users — gunakan /provision/students' };
      }
      return { message: `${dto.role} memerlukan ${(dto.role === 'ORANG_TUA' ? 'phone' : 'email')}` };
    },
  )
  // Pegawai wajib NIY + status; non-pegawai (INDUSTRI/ORANG_TUA/SUPER_ADMIN) tidak boleh isi keduanya.
  .refine(
    (dto) => {
      const isStaff = (STAFF_ROLES as readonly string[]).includes(dto.role);
      if (isStaff) return !!dto.niy && !!dto.employmentStatus;
      return dto.niy === undefined && dto.employmentStatus === undefined;
    },
    (dto) => {
      const isStaff = (STAFF_ROLES as readonly string[]).includes(dto.role);
      return {
        message: isStaff
          ? `${dto.role} memerlukan niy dan employmentStatus`
          : `Role ${dto.role} tidak boleh memiliki niy/employmentStatus`,
      };
    },
  );

export type ProvisionUserDto = z.infer<typeof ProvisionUserSchema>;

// Import massal: array baris mentah (divalidasi per-baris di service agar skip-invalid).
export const ProvisionUsersBulkSchema = z.object({
  users: z.array(z.record(z.unknown())).min(1, 'Minimal 1 baris').max(500, 'Maksimal 500 baris per impor'),
}).strict();

export type ProvisionUsersBulkDto = z.infer<typeof ProvisionUsersBulkSchema>;

export const ProvisionStudentSchema = z.object({
  siswa: z.object({
    nis: z.string().min(1, 'NIS wajib diisi').max(20),
    fullName: z.string().min(1, 'fullName wajib diisi'),
    classId: z.string().uuid().optional(),
    email: z.string().email().optional(),
  }),
  ortu: z.object({
    name: z.string().min(1, 'nama ortu wajib diisi'),
    phone: phoneE164,
    email: z.string().email().optional(),
  }),
  reuseParentByPhone: z.boolean().optional(),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'consent harus bernilai true — operator wajib konfirmasi persetujuan data' }),
  }),
}).strict();

export type ProvisionStudentDto = z.infer<typeof ProvisionStudentSchema>;
