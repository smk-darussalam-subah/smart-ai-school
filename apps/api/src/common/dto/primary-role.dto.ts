import { z } from 'zod';

export const ApiPrimaryRoleSchema = z.enum([
  'SUPER_ADMIN',
  'TATA_USAHA',
  'GURU',
  'SISWA',
  'ORANG_TUA',
  'INDUSTRI',
]);
