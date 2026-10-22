import { ClassSessionService } from '../class-sessions/class-session.service';
import { ListClassSessionQuerySchema } from '../class-sessions/class-session.dto';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '@smk/auth';
const id = '00000000-0000-4000-8000-000000000001';
describe('learning recap session read', () => {
  it.each([{ id: 'bad' }, { semester: 3 }, { academicYear: '2026-2027' }, { scope: 'operations' }])(
    'rejects unsupported API query %j',
    (query) => expect(ListClassSessionQuerySchema.safeParse(query).success).toBe(false),
  );
  it('combines exact ID and academic period with own identity scope', async () => {
    const prisma = {
      teacher: { findFirst: jest.fn().mockResolvedValue({ id: 'own-teacher' }) },
      classSession: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new ClassSessionService(
      prisma as unknown as PrismaService,
      {} as ConstructorParameters<typeof ClassSessionService>[1],
    );
    await service.list(
      ListClassSessionQuerySchema.parse({
        id,
        academicYear: '2026/2027',
        semester: '1',
        scope: 'own',
      }),
      { keycloakId: 'kc-own', roles: ['GURU', 'KEPALA_SEKOLAH'] } as AuthUser,
    );
    expect(prisma.classSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id,
          academicYear: { code: '2026/2027' },
          semester: { number: 1 },
          assignedTeacherId: 'own-teacher',
        }),
      }),
    );
    expect(prisma.classSession.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ id, assignedTeacherId: 'own-teacher' }),
    });
  });
});
