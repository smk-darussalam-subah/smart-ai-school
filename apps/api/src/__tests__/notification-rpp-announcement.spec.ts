// =============================================================================
// 2G-3: NotificationListener — rpp.reviewed & announcement.published
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotificationListener } from '../notification/notification.listener';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { WaLogService } from '../wa-log/wa-log.service';

describe('NotificationListener 2G-3', () => {
  let listener: NotificationListener;
  const notify = jest.fn();
  const teacherFindUnique = jest.fn();
  const userFindMany = jest.fn();

  beforeEach(async () => {
    [notify, teacherFindUnique, userFindMany].forEach((m) => m.mockReset());
    notify.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationListener,
        { provide: NotificationService, useValue: { notify } },
        { provide: WaLogService, useValue: { logWaNotification: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: PrismaService,
          useValue: {
            teacher: { findUnique: teacherFindUnique },
            user: { findMany: userFindMany, findUnique: jest.fn() },
            student: { findUnique: jest.fn() },
          },
        },
      ],
    }).compile();
    listener = module.get(NotificationListener);
  });

  const RPP_PAYLOAD = {
    rppId: 'rpp-1', teacherId: 't1', title: 'Bab 1',
    decision: 'revision' as const, note: 'perbaiki KD',
    reviewedAtIso: '2026-06-11T10:00:00.000Z',
  };

  it('rpp.reviewed → WA ke guru, refId memuat reviewedAt (idempoten per aksi)', async () => {
    teacherFindUnique.mockResolvedValue({ user: { phone: '0812xxx', fullName: 'Bu Sari' } });
    await listener.onRppReviewed(RPP_PAYLOAD);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'whatsapp',
      to: '0812xxx',
      refType: 'rpp-review',
      refId: 'rpp-1:2026-06-11T10:00:00.000Z',
    }));
    expect(notify.mock.calls[0][0].body).toContain('perbaiki KD');
  });

  it('rpp.reviewed: guru tanpa phone → skip tanpa error (fail-soft)', async () => {
    teacherFindUnique.mockResolvedValue({ user: { phone: null, fullName: 'X' } });
    await listener.onRppReviewed(RPP_PAYLOAD);
    expect(notify).not.toHaveBeenCalled();
  });

  it('rpp.reviewed: notify throw → TIDAK melempar keluar (fail-soft)', async () => {
    teacherFindUnique.mockResolvedValue({ user: { phone: '0812', fullName: 'X' } });
    notify.mockRejectedValue(new Error('queue down'));
    await expect(listener.onRppReviewed(RPP_PAYLOAD)).resolves.toBeUndefined();
  });

  it('announcement.published: kategori biasa+prioritas biasa → TIDAK broadcast', async () => {
    await listener.onAnnouncementPublished({
      announcementId: 'a1', title: 'Info', category: 'umum', priority: 'biasa', audience: ['ALL'],
    });
    expect(userFindMany).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('announcement darurat audience ALL → broadcast ke semua user aktif ber-phone', async () => {
    userFindMany.mockResolvedValue([{ phone: '08a' }, { phone: '08b' }]);
    await listener.onAnnouncementPublished({
      announcementId: 'a2', title: 'Banjir', category: 'darurat', priority: 'biasa', audience: ['ALL'],
    });
    const where = userFindMany.mock.calls[0][0].where;
    expect(where.phone).toEqual({ not: null });
    expect(where.role).toBeUndefined(); // ALL = tanpa filter role
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify.mock.calls[0][0].refId).toBe('a2');
  });

  it('announcement urgent audience [GURU] → filter role di QUERY', async () => {
    userFindMany.mockResolvedValue([{ phone: '08g' }]);
    await listener.onAnnouncementPublished({
      announcementId: 'a3', title: 'Rapat', category: 'umum', priority: 'urgent', audience: ['GURU'],
    });
    expect(userFindMany.mock.calls[0][0].where.role).toEqual({ in: ['GURU'] });
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
