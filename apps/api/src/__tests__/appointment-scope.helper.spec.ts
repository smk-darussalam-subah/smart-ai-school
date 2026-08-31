import type { AuthUser } from '@smk/auth';
import { resolveActiveKaprogMajorScope } from '../common/helpers/appointment-scope.helper';
import { PrismaService } from '../prisma/prisma.service';

describe('resolveActiveKaprogMajorScope school date', () => {
  const user: AuthUser = {
    keycloakId: 'kc-kaprog',
    username: 'kaprog',
    email: 'kaprog@example.test',
    fullName: 'Kaprog',
    roles: ['GURU', 'KAPROG'],
  };

  it('uses the Jakarta school date for KAPROG scope at 00:15 WIB', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T17:15:00.000Z'));
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-kaprog', isActive: true, deletedAt: null }),
      },
      academicYear: {
        findMany: jest.fn().mockResolvedValue([{ id: 'ay-active', code: '2026/2027' }]),
      },
      appointment: {
        findMany: jest.fn().mockResolvedValue([{
          majorId: 'major-akl',
          major: { id: 'major-akl', code: 'AKL' },
        }]),
      },
    };

    try {
      await expect(resolveActiveKaprogMajorScope(
        prisma as unknown as PrismaService,
        user,
      )).resolves.toEqual({
        academicYearId: 'ay-active',
        academicYearCode: '2026/2027',
        majorIds: ['major-akl'],
        majorCodes: ['AKL'],
      });
      expect(prisma.appointment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          effectiveFrom: { lte: new Date('2026-08-31T00:00:00.000Z') },
          OR: [
            { effectiveUntil: null },
            { effectiveUntil: { gte: new Date('2026-08-31T00:00:00.000Z') } },
          ],
        }),
      }));
    } finally {
      jest.useRealTimers();
    }
  });
});
