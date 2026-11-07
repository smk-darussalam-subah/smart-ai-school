import 'reflect-metadata';
import { AuthUser } from '@smk/auth';
import { StudentDashboardService } from '../student-dashboard/student-dashboard.service';
import { StudentDashboardController } from '../student-dashboard/student-dashboard.controller';
import { PrismaService } from '../prisma/prisma.service';
import { parentChangeQuery } from '../student-dashboard/parent-dashboard-changes';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { REQUIRED_PERMISSION_KEY } from '../permissions/decorators/require-permission.decorator';

const parent: AuthUser = {
  keycloakId: '10000000-0000-4000-8000-000000000001',
  username: 'parent-proof',
  email: 'parent@example.invalid',
  fullName: 'Synthetic parent',
  roles: ['ORANG_TUA'],
};
const row = {
  snapshot: { children: ['private-synthetic-child'], grades: [1, 'updated'] },
  scope: { children: ['private-synthetic-child'] },
};

describe('private parent dashboard revisions', () => {
  function setup() {
    const query = jest.fn().mockResolvedValue([row]);
    const service = new StudentDashboardService({ $queryRaw: query } as unknown as PrismaService);
    return { query, service, controller: new StudentDashboardController(service) };
  }

  it('returns opaque hashes only and binds query values solely to authenticated identity', async () => {
    const { service, query } = setup();
    const result = await service.getParentChanges(parent);
    expect(Object.keys(result).sort()).toEqual(['revision', 'scopeRevision']);
    expect(result.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(result.scopeRevision).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain('private-synthetic-child');
    expect(query.mock.calls[0][0].values).toEqual([parent.keycloakId]);
    expect(parentChangeQuery(parent.keycloakId).text).not.toContain(parent.keycloakId);
  });

  it('keeps unchanged snapshots stable and separates every parent identity', async () => {
    const { service } = setup();
    const first = await service.getParentChanges(parent);
    expect(await service.getParentChanges(parent)).toEqual(first);
    const other = await service.getParentChanges({
      ...parent,
      keycloakId: '10000000-0000-4000-8000-000000000002',
    });
    expect(other.revision).not.toBe(first.revision);
    expect(other.scopeRevision).not.toBe(first.scopeRevision);
  });

  it('updates data revision independently and scope revision when membership is withdrawn', async () => {
    const { service, query } = setup();
    const first = await service.getParentChanges(parent);
    query.mockResolvedValueOnce([{ ...row, snapshot: { ...row.snapshot, grades: [2, 'new'] } }]);
    const changed = await service.getParentChanges(parent);
    expect(changed.revision).not.toBe(first.revision);
    expect(changed.scopeRevision).toBe(first.scopeRevision);
    query.mockResolvedValueOnce([{ snapshot: { children: [] }, scope: { children: [] } }]);
    const removed = await service.getParentChanges(parent);
    expect(removed.revision).not.toBe(first.revision);
    expect(removed.scopeRevision).not.toBe(first.scopeRevision);
  });

  it.each(['SISWA', 'GURU', 'SUPER_ADMIN'] as const)(
    'does not grant parent metadata to %s context',
    async (role) => {
      const { service, query } = setup();
      await expect(service.getParentChanges({ ...parent, roles: [role] })).rejects.toMatchObject({
        status: 403,
      });
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('denies an absent/inactive/deleted authoritative parent and propagates failed reads', async () => {
    const { service, query } = setup();
    query.mockResolvedValueOnce([]);
    await expect(service.getParentChanges(parent)).rejects.toMatchObject({ status: 403 });
    query.mockRejectedValueOnce(new Error('unavailable'));
    await expect(service.getParentChanges(parent)).rejects.toThrow('unavailable');
  });

  it('rejects foreign parent/child query parameters instead of accepting a caller scope', () => {
    const { controller, query } = setup();
    expect(() => controller.getParentChanges(parent, { studentId: parent.keycloakId })).toThrow();
    expect(() => controller.getParentChanges(parent, { parentId: parent.keycloakId })).toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('retains separate parent role/permission metadata and accepts an empty query', async () => {
    const { controller } = setup();
    const handler = StudentDashboardController.prototype.getParentChanges;
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(['ORANG_TUA']);
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, handler)).toBe('student.child.read');
    expect(await controller.getParentChanges(parent, {})).toMatchObject({
      revision: expect.any(String),
    });
  });
});
