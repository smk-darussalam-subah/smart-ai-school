import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@smk/auth';

export const ROLES_KEY = 'roles';

/**
 * Deklarasikan role yang boleh mengakses endpoint
 * @example @Roles('GURU', 'KEPALA_SEKOLAH')
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
