jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthUser } from '@smk/auth';
import { AiGenerateService } from '../ai/ai-generate.service';
import { GenerateRppStepSchema } from '../ai/dto/generate.dto';
import { PrismaService } from '../prisma/prisma.service';

const RPP_ID = '11111111-1111-4111-8111-111111111111';
const GURU: AuthUser = { keycloakId: 'kc-guru', username: 'guru1', roles: ['GURU'] } as AuthUser;

describe('AiGenerateService - AI-0A Modul Ajar containment', () => {
  let service: AiGenerateService;
  const userFindUnique = jest.fn();
  const teacherFindUnique = jest.fn();
  const rppFindFirst = jest.fn();
  const teachingAssignmentFindFirst = jest.fn();
  const aiGenerationCreate = jest.fn();
  const localChat = jest.fn();
  const cloudChat = jest.fn();

  const baseRpp = {
    id: RPP_ID,
    teacherId: 'teacher-1',
    classId: 'class-1',
    subject: 'Matematika',
    title: 'Fungsi Linear',
    academicYear: '2026/2027',
    semester: 1,
    body: {
      fase: 'E',
      cp: 'Peserta didik memahami fungsi linear.',
      tp: ['Menjelaskan grafik fungsi linear.'],
      kegiatan: [],
    },
    class: { id: 'class-1', name: 'X TKJ 1', grade: 10, majorCode: 'TKJ' },
  };

  beforeEach(async () => {
    [userFindUnique, teacherFindUnique, rppFindFirst, teachingAssignmentFindFirst, aiGenerationCreate, localChat, cloudChat]
      .forEach((mock) => mock.mockReset());

    userFindUnique.mockResolvedValue({ id: 'user-1' });
    teacherFindUnique.mockResolvedValue({ id: 'teacher-1' });
    rppFindFirst.mockResolvedValue(baseRpp);
    teachingAssignmentFindFirst.mockResolvedValue({ id: 'ta-1' });
    aiGenerationCreate.mockResolvedValue({});
    localChat.mockResolvedValue('Kegiatan inti tersimpan.');
    cloudChat.mockResolvedValue('Kegiatan inti dari cloud.');

    const prisma = {
      user: { findUnique: userFindUnique },
      teacher: { findUnique: teacherFindUnique },
      rpp: { findFirst: rppFindFirst },
      teachingAssignment: { findFirst: teachingAssignmentFindFirst },
      aiGeneration: { create: aiGenerationCreate },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiGenerateService,
        { provide: PrismaService, useValue: prisma },
        { provide: 'AI_GATEWAY', useValue: { chat: localChat } },
        { provide: 'OPENAI_GATEWAY', useValue: { chat: cloudChat } },
      ],
    }).compile();
    service = module.get(AiGenerateService);
  });

  it('loads saved RPP and derives prompt from server-side ownership context', async () => {
    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);

    expect(rppFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: RPP_ID, teacherId: 'teacher-1' },
    }));
    expect(teachingAssignmentFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        teacherId: 'teacher-1',
        classId: 'class-1',
        subject: 'Matematika',
        academicYear: '2026/2027',
      },
    }));
    const prompt = cloudChat.mock.calls[0][0] as string;
    expect(prompt).toContain('Mapel: Matematika.');
    expect(prompt).toContain('Judul: Fungsi Linear.');
    expect(prompt).toContain('Kelas: X TKJ 1');
    expect(prompt).not.toContain('browser');
  });

  it('rejects extra browser context fields at the DTO boundary', () => {
    const parsed = GenerateRppStepSchema.safeParse({
      rppId: RPP_ID,
      section: 'kegiatan',
      context: 'raw browser context',
      rppBody: { cp: 'raw body' },
      subject: 'browser-declared subject',
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'unrecognized_keys',
          keys: expect.arrayContaining(['context', 'rppBody', 'subject']),
        }),
      ]));
    }
  });

  it('rejects non-owner before provider call and audit write', async () => {
    rppFindFirst.mockResolvedValue(null);

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU))
      .rejects.toThrow('Akses Modul Ajar ditolak');

    expect(localChat).not.toHaveBeenCalled();
    expect(cloudChat).not.toHaveBeenCalled();
    expect(aiGenerationCreate).not.toHaveBeenCalled();
  });

  it('rejects owned RPP without active TeachingAssignment before provider call', async () => {
    teachingAssignmentFindFirst.mockResolvedValue(null);

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU))
      .rejects.toThrow('Assignment mengajar untuk Modul Ajar ini tidak aktif');

    expect(localChat).not.toHaveBeenCalled();
    expect(cloudChat).not.toHaveBeenCalled();
    expect(aiGenerationCreate).not.toHaveBeenCalled();
  });

  it('routes PII context to local gateway and never calls cloud', async () => {
    rppFindFirst.mockResolvedValue({
      ...baseRpp,
      body: {
        cp: 'Nama: Budi Santoso. Email: budi@example.com.',
        tp: ['Menjelaskan jaringan lokal.'],
      },
    });
    localChat.mockResolvedValue('Kegiatan aman.');

    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);

    expect(localChat).toHaveBeenCalledTimes(1);
    expect(cloudChat).not.toHaveBeenCalled();
    const promptSentLocal = localChat.mock.calls[0][0] as string;
    expect(promptSentLocal).not.toContain('budi@example.com');
    expect(promptSentLocal).toContain('[EMAIL]');
    const auditPrompt = aiGenerationCreate.mock.calls[0][0].data.prompt as string;
    expect(auditPrompt).not.toContain('Budi Santoso');
    expect(auditPrompt).not.toContain('budi@example.com');
  });

  it('blocks PII context if local gateway fails, with no cloud fallback', async () => {
    rppFindFirst.mockResolvedValue({
      ...baseRpp,
      body: { cp: 'Nama: Budi Santoso', tp: ['TP aman'] },
    });
    localChat.mockRejectedValue(new Error('local unavailable'));

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_CONTEXT_PII_BLOCKED' }) });

    expect(cloudChat).not.toHaveBeenCalled();
    expect(aiGenerationCreate).not.toHaveBeenCalled();
  });

  it('stops ATP generation with missing TP before provider call', async () => {
    rppFindFirst.mockResolvedValue({ ...baseRpp, body: { cp: 'CP tersimpan' } });

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'atp' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_FOUNDATION_INCOMPLETE' }) });

    expect(localChat).not.toHaveBeenCalled();
    expect(cloudChat).not.toHaveBeenCalled();
  });

  it('rejects invalid ATP output before audit success', async () => {
    cloudChat.mockResolvedValue('ini bukan JSON');

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'atp' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_OUTPUT_INVALID' }) });

    expect(aiGenerationCreate).not.toHaveBeenCalled();
  });

  it('uses a single configured provider attempt for non-PII prompts', async () => {
    const res = await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);

    expect(res).toEqual({ type: 'kegiatan', output: 'Kegiatan inti dari cloud.' });
    expect(cloudChat).toHaveBeenCalledTimes(1);
    expect(localChat).not.toHaveBeenCalled();
  });

  it('legacy raw-context endpoints are disabled explicitly', () => {
    expect(() => service.rejectLegacyGeneration()).toThrow(HttpException);
    try {
      service.rejectLegacyGeneration();
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(410);
      expect((err as HttpException).getResponse()).toEqual(expect.objectContaining({
        error: 'AI_ENDPOINT_DISABLED',
      }));
    }
  });
});
