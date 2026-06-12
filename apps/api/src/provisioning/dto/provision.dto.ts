// =============================================================================
// provision.dto.ts — DTO untuk ProvisioningService
// =============================================================================

import { z } from 'zod';
import { UserRole } from '@smk/auth';
import { phoneE164 } from '../../common/helpers/phone';

export const ProvisionUserSchema = z.object({
  role: UserRole,
  fullName: z.string().min(1, 'fullName wajib diisi'),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  payload: z
    .object({
      nip: z.string().optional(),
    })
    .optional(),
}).strict().refine(
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
);

export type ProvisionUserDto = z.infer<typeof ProvisionUserSchema>;

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
