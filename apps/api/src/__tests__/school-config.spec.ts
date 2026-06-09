jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SchoolConfigService } from '../school-config/school-config.service';
import { SchoolConfigController } from '../school-config/school-config.controller';
import { PrismaService } from '../prisma/prisma.service';

const PROFILE = { id: 'p1', name: 'SMK Darussalam Subah', npsn: '20324567', address: 'Jl. Raya', phone: null, email: null, website: null, headmasterName: null, headmasterNip: null, logoUrl: null, accreditation: 'A', createdAt: new Date(), updatedAt: new Date() };
const MAJOR_TKRO = { id: 'm1', code: 'TKRO', name: 'Teknik Kendaraan Ringan Otomotif', description: null, isActive: true, createdAt: new Date(), updatedAt: new Date() };
const AY = { id: 'ay1', code: '2026/2027', startDate: new Date('2026-07-13'), endDate: new Date('2027-06-26'), isActive: true, createdAt: new Date(), updatedAt: new Date() };
const SEM = { id: 's1', academicYearId: 'ay1', number: 1, startDate: new Date('2026-07-13'), endDate: new Date('2026-12-19'), isActive: true, createdAt: new Date(), updatedAt: new Date(), academicYear: { code: '2026/2027' } };

// ════════════════════════════════════════════════════════════════════════════
// SchoolConfigService
// ════════════════════════════════════════════════════════════════════════════

describe('SchoolConfigService', () => {
  let service: SchoolConfigService;
  const mockProfile = { findFirst: jest.fn(), update: jest.fn() };
  const mockMajor = { findMany: jest.fn(), create: jest.fn(), update: jest.fn() };
  const mockAY = { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() };
  const mockSem = { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() };
  const mockCal = { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() };

  beforeEach(async () => {
    [mockProfile.findFirst, mockProfile.update, mockMajor.findMany, mockMajor.create, mockMajor.update,
      mockAY.findMany, mockAY.findFirst, mockAY.create, mockAY.update, mockAY.updateMany,
      mockSem.findMany, mockSem.findFirst, mockSem.create, mockSem.update, mockSem.updateMany,
      mockCal.findMany, mockCal.create, mockCal.update, mockCal.delete].forEach(m => m.mockReset());

    const prisma = {
      schoolProfile: mockProfile,
      major: mockMajor,
      academicYear: mockAY,
      semester: mockSem,
      academicCalendar: mockCal,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SchoolConfigService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(SchoolConfigService);
  });

  it('getProfile → return profile (cached after first call)', async () => {
    mockProfile.findFirst.mockResolvedValue(PROFILE);
    const r1 = await service.getProfile();
    expect(r1).toBeDefined();
    await service.getProfile();
    expect(mockProfile.findFirst).toHaveBeenCalledTimes(1);
  });

  it('getProfile → no profile → NotFoundException', async () => {
    mockProfile.findFirst.mockResolvedValue(null);
    await expect(service.getProfile()).rejects.toThrow(NotFoundException);
  });

  it('updateProfile → invalidate cache', async () => {
    mockProfile.findFirst.mockResolvedValue(PROFILE);
    mockProfile.update.mockResolvedValue({ ...PROFILE, name: 'Updated' });
    await service.updateProfile({ name: 'Updated' });
    expect(mockProfile.update).toHaveBeenCalledTimes(1);
  });

  it('getMajors → return all majors', async () => {
    mockMajor.findMany.mockResolvedValue([MAJOR_TKRO]);
    const result = await service.getMajors();
    expect(result).toHaveLength(1);
  });

  it('createMajor → insert', async () => {
    mockMajor.create.mockResolvedValue(MAJOR_TKRO);
    const result = await service.createMajor({ code: 'TKRO', name: 'TKRO' });
    expect(result.code).toBe('TKRO');
  });

  it('getActiveAcademicYear → return active', async () => {
    mockAY.findFirst.mockResolvedValue(AY);
    const result = await service.getActiveAcademicYear();
    expect(result.code).toBe('2026/2027');
  });

  it('getActiveAcademicYear → none active → NotFoundException', async () => {
    mockAY.findFirst.mockResolvedValue(null);
    await expect(service.getActiveAcademicYear()).rejects.toThrow(NotFoundException);
  });

  it('createAcademicYear with isActive → deactivate others first', async () => {
    mockAY.updateMany.mockResolvedValue({ count: 1 });
    mockAY.create.mockResolvedValue(AY);
    await service.createAcademicYear({ code: '2026/2027', startDate: new Date(), endDate: new Date(), isActive: true });
    expect(mockAY.updateMany).toHaveBeenCalledWith({ data: { isActive: false } });
  });

  it('getSemesters → filter by academicYearId', async () => {
    mockSem.findMany.mockResolvedValue([SEM]);
    await service.getSemesters('ay1');
    expect(mockSem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { academicYearId: 'ay1' } }));
  });

  it('getActiveSemester → return active', async () => {
    mockSem.findFirst.mockResolvedValue(SEM);
    const result = await service.getActiveSemester();
    expect(result.academicYear.code).toBe('2026/2027');
  });

  it('getCalendarEvents → filter by type', async () => {
    mockCal.findMany.mockResolvedValue([]);
    await service.getCalendarEvents(undefined, 'exam');
    expect(mockCal.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { type: 'exam' } }));
  });

  it('createCalendarEvent → insert', async () => {
    mockCal.create.mockResolvedValue({ id: 'e1', academicYearId: 'ay1', name: 'UTS', startDate: new Date(), endDate: new Date(), type: 'exam', description: null, createdAt: new Date(), updatedAt: new Date() });
    await service.createCalendarEvent({ academicYearId: 'ay1', name: 'UTS', startDate: new Date(), endDate: new Date(), type: 'exam' });
    expect(mockCal.create).toHaveBeenCalledTimes(1);
  });

  it('deleteCalendarEvent → delete', async () => {
    mockCal.delete.mockResolvedValue({ id: 'e1' });
    await service.deleteCalendarEvent('e1');
    expect(mockCal.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// SchoolConfigController
// ════════════════════════════════════════════════════════════════════════════

describe('SchoolConfigController', () => {
  let controller: SchoolConfigController;
  const mock = {
    getProfile: jest.fn(), updateProfile: jest.fn(),
    getMajors: jest.fn(), createMajor: jest.fn(), updateMajor: jest.fn(),
    getAcademicYears: jest.fn(), getActiveAcademicYear: jest.fn(), createAcademicYear: jest.fn(), updateAcademicYear: jest.fn(),
    getSemesters: jest.fn(), getActiveSemester: jest.fn(), createSemester: jest.fn(), updateSemester: jest.fn(),
    getCalendarEvents: jest.fn(), createCalendarEvent: jest.fn(), updateCalendarEvent: jest.fn(), deleteCalendarEvent: jest.fn(),
  };

  beforeEach(async () => {
    Object.values(mock).forEach(m => m.mockReset());
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchoolConfigController],
      providers: [{ provide: SchoolConfigService, useValue: mock }],
    }).compile();
    controller = module.get(SchoolConfigController);
  });

  it('getProfile → service getProfile', async () => {
    mock.getProfile.mockResolvedValue(PROFILE);
    const r = (await controller.getProfile()) as typeof PROFILE;
    expect(r.name).toBe('SMK Darussalam Subah');
  });

  it('getMajors → service getMajors', async () => {
    mock.getMajors.mockResolvedValue([MAJOR_TKRO]);
    const r = (await controller.getMajors()) as Array<typeof MAJOR_TKRO>;
    expect(r).toHaveLength(1);
  });

  it('getActiveAcademicYear → service', async () => {
    mock.getActiveAcademicYear.mockResolvedValue(AY);
    const r = (await controller.getActiveAcademicYear()) as typeof AY;
    expect(r.code).toBe('2026/2027');
  });

  it('getActiveSemester → service', async () => {
    mock.getActiveSemester.mockResolvedValue(SEM);
    const r = (await controller.getActiveSemester()) as typeof SEM;
    expect(r.number).toBe(1);
  });

  it('createCalendarEvent → service create', async () => {
    mock.createCalendarEvent.mockResolvedValue({ id: 'e1' });
    await controller.createCalendarEvent({
      academicYearId: 'ay1', name: 'UTS', startDate: '2026-09-28' as unknown as Date, endDate: '2026-10-03' as unknown as Date, type: 'exam',
    } as Record<string, unknown>);
    expect(mock.createCalendarEvent).toHaveBeenCalledTimes(1);
  });

  it('deleteCalendarEvent → service delete', async () => {
    await controller.deleteCalendarEvent('e1');
    expect(mock.deleteCalendarEvent).toHaveBeenCalledWith('e1');
  });
});
