jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
import { PermissionsService } from '../permissions/permissions.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

describe('fresh authority is deduplicated only at a request entry boundary', () => {
  const query = jest.fn();
  const db = {
    user: { findFirst: query, findUnique: jest.fn(async () => null) },
    academicYear: { findMany: jest.fn(async () => []) },
    rolePermission: { findMany: jest.fn(async () => []) },
  };
  let service: PermissionsService;
  beforeEach(() => {
    jest.clearAllMocks();
    query.mockReset().mockResolvedValue({ role: 'GURU' });
    service = new PermissionsService(db as unknown as PrismaService);
  });
  it('coalesces concurrent reads on one request but not parallel requests', async () => {
    const request = {};
    expect(
      await Promise.all([
        service.getAuthoritativePrimaryRole('same', undefined, request),
        service.getAuthoritativePrimaryRole('same', undefined, request),
      ]),
    ).toEqual(['GURU', 'GURU']);
    expect(query).toHaveBeenCalledTimes(1);
    await Promise.all([
      service.getAuthoritativePrimaryRole('same', undefined, {}),
      service.getAuthoritativePrimaryRole('same', undefined, {}),
    ]);
    expect(query).toHaveBeenCalledTimes(3);
  });
  it('never shares the snapshot with another identity even if a request object is reused', async () => {
    const request = {};
    await service.getAuthoritativePrimaryRole('first', undefined, request);
    query.mockResolvedValue({ role: 'TATA_USAHA' });
    expect(await service.getAuthoritativePrimaryRole('other', undefined, request)).toBe(
      'TATA_USAHA',
    );
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('does not carry failed lookup state into the next request', async () => {
    query.mockRejectedValueOnce(Error('PRIVATE query details'));
    await expect(service.getAuthoritativePrimaryRole('same', undefined, {})).rejects.toMatchObject({
      status: 503,
      response: { code: 'AUTHORITY_UNAVAILABLE' },
    });
    expect(await service.getAuthoritativePrimaryRole('same', undefined, {})).toBe('GURU');
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('re-reads at post-queue and fresh-permission boundaries instead of using entry SUPER_ADMIN', async () => {
    query.mockResolvedValueOnce({ role: 'SUPER_ADMIN' });
    expect(await service.getAuthoritativePrimaryRole('same', undefined, {})).toBe('SUPER_ADMIN');
    query.mockResolvedValue({ role: 'GURU' });
    expect(await service.getAuthoritativePrimaryRole('same')).toBe('GURU');
    expect(
      await service.hasFreshPermission(
        'same',
        'permissions.manage',
        db as unknown as Prisma.TransactionClient,
      ),
    ).toBe(false);
    expect(query).toHaveBeenCalledTimes(3);
  });
  it('explicit transaction clients bypass entry memo even when a request is supplied', async () => {
    const request = {};
    await service.getAuthoritativePrimaryRole('same', undefined, request);
    const txQuery = jest.fn(async () => ({ role: 'TATA_USAHA' }));
    const tx = { user: { findFirst: txQuery } } as unknown as Prisma.TransactionClient;
    expect(await service.getAuthoritativePrimaryRole('same', tx, request)).toBe('TATA_USAHA');
    expect(txQuery).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('real missing/invalid authority is not converted into a transient error or wildcard', async () => {
    query.mockResolvedValueOnce(null).mockResolvedValueOnce({ role: 'NOT_PRIMARY' });
    expect(await service.getAuthoritativePrimaryRole('same', undefined, {})).toBeNull();
    expect(await service.getAuthoritativePrimaryRole('same', undefined, {})).toBeNull();
  });
});
