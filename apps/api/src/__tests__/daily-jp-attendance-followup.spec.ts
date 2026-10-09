import { isScheduleOperational } from '../schedule/schedule-validity';
import { isAttendanceWorkingDay } from '../staff-attendance/arrival-rules';
import { assertFreshMutationAuthority } from '../common/helpers/identity-mutation-lock';
import { Prisma } from '@prisma/client';
import { PermissionsService } from '../permissions/permissions.service';
import { ForbiddenException } from '@nestjs/common';

describe('Fresh mutation authority under lifecycle serialization', () => {
  it.each([
    { role: null, allowed: true }, { role: 'GURU', allowed: true },
    { role: 'TATA_USAHA', allowed: false },
  ])('denies inactive/disallowed/revoked permission: $role/$allowed', async ({ role, allowed }) => {
    const tx = { $executeRaw: jest.fn().mockResolvedValue(1) } as unknown as Prisma.TransactionClient;
    const permissions = { getAuthoritativePrimaryRole: jest.fn().mockResolvedValue(role),
      hasFreshPermission: jest.fn().mockResolvedValue(allowed) } as unknown as PermissionsService;
    await expect(assertFreshMutationAuthority(tx, permissions, 'synthetic', 'academic.schedule.manage', ['SUPER_ADMIN', 'TATA_USAHA']))
      .rejects.toThrow(ForbiddenException);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(permissions.getAuthoritativePrimaryRole).toHaveBeenCalledWith('synthetic', tx);
  });
  it('accepts only the active position plus current permission, not a stale role label', async () => {
    const tx = { $executeRaw: jest.fn().mockResolvedValue(1) } as unknown as Prisma.TransactionClient;
    const positions = jest.fn().mockResolvedValue(new Set(['WAKA_KURIKULUM']));
    const permissions = { getAuthoritativePrimaryRole: jest.fn().mockResolvedValue('GURU'),
      hasFreshPermission: jest.fn().mockResolvedValue(true), getActivePositionCodes: positions } as unknown as PermissionsService;
    await expect(assertFreshMutationAuthority(tx, permissions, 'synthetic', 'academic.schedule.manage', ['SUPER_ADMIN', 'TATA_USAHA'], ['WAKA_KURIKULUM']))
      .resolves.toBeUndefined();
    positions.mockResolvedValue(new Set());
    await expect(assertFreshMutationAuthority(tx, permissions, 'synthetic', 'academic.schedule.manage', ['SUPER_ADMIN', 'TATA_USAHA'], ['WAKA_KURIKULUM']))
      .rejects.toThrow(ForbiddenException);
  });
});

describe('Follow-up date-column boundary contracts', () => {
  it('keeps an exception valid through its approved WIB date, not one day longer; missing expiry is invalid', () => {
    const group = { mode: 'AUTHORIZED_EXCEPTION', expiresOn: new Date('2026-10-06T00:00:00Z') };
    expect(isScheduleOperational(group, '2026-10-06')).toBe(true);
    expect(isScheduleOperational(group, '2026-10-07')).toBe(false);
    expect(isScheduleOperational({ ...group, expiresOn: null }, '2026-10-06')).toBe(false);
    expect(isScheduleOperational({ mode: 'JOINT_CLASS', expiresOn: null }, '2026-10-07')).toBe(true);
    expect(isScheduleOperational(null, '2026-10-07')).toBe(true);
  });
  it('honors Sunday, configured nonworking weekdays, and inclusive holiday date ranges', () => {
    expect(isAttendanceWorkingDay('2026-10-11', [1,2,3,4,5,6], [])).toBe(false);
    expect(isAttendanceWorkingDay('2026-10-06', [1,3,4,5,6], [])).toBe(false);
    const holiday = [{ startDate: new Date('2026-10-06'), endDate: new Date('2026-10-07') }];
    expect(isAttendanceWorkingDay('2026-10-06', [1,2,3,4,5,6], holiday)).toBe(false);
    expect(isAttendanceWorkingDay('2026-10-07', [1,2,3,4,5,6], holiday)).toBe(false);
    expect(isAttendanceWorkingDay('2026-10-08', [1,2,3,4,5,6], holiday)).toBe(true);
  });
});
