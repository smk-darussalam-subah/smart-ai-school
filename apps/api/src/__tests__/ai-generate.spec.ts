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
import { NotificationService } from '../notification/notification.service';

const RPP_ID = '11111111-1111-4111-8111-111111111111';
const GURU: AuthUser = { keycloakId: 'kc-guru', username: 'guru1', roles: ['GURU'] } as AuthUser;
const KEGIATAN_PATCH = JSON.stringify({
  kegiatan: [{
    pertemuan: 'Pertemuan 1',
    pendahuluan: 'Menyampaikan tujuan pembelajaran.',
    inti: 'Menganalisis grafik fungsi linear.',
    penutup: 'Refleksi dan umpan balik.',
  }],
});
const ATP_PATCH = JSON.stringify({
  atp: [{ tpRef: 'TP 1', indikator: 'Menjelaskan grafik fungsi linear dengan benar.' }],
});
const kegiatanPatchWithInti = (inti: string) => JSON.stringify({
  kegiatan: [{
    pertemuan: 'Pertemuan 1',
    pendahuluan: 'Apersepsi pembelajaran.',
    inti,
    penutup: 'Refleksi pembelajaran.',
  }],
});

describe('AiGenerateService - AI-0A Modul Ajar containment', () => {
  let service: AiGenerateService;
  const userFindUnique = jest.fn();
  const userFindMany = jest.fn();
  const teacherFindUnique = jest.fn();
  const rppFindFirst = jest.fn();
  const teachingAssignmentFindFirst = jest.fn();
  const aiGenerationCreate = jest.fn();
  const localChat = jest.fn();
  const cloudChat = jest.fn();
  const notificationNotify = jest.fn();

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
    [userFindUnique, userFindMany, teacherFindUnique, rppFindFirst, teachingAssignmentFindFirst, aiGenerationCreate, localChat, cloudChat, notificationNotify]
      .forEach((mock) => mock.mockReset());

    userFindUnique.mockResolvedValue({ id: 'user-1' });
    userFindMany.mockResolvedValue([{
      id: 'admin-1',
      fullName: 'Super Admin',
      email: 'admin@example.sch.id',
      phone: null,
    }]);
    teacherFindUnique.mockResolvedValue({ id: 'teacher-1' });
    rppFindFirst.mockResolvedValue(baseRpp);
    teachingAssignmentFindFirst.mockResolvedValue({ id: 'ta-1' });
    aiGenerationCreate.mockResolvedValue({});
    localChat.mockResolvedValue(KEGIATAN_PATCH);
    cloudChat.mockResolvedValue(KEGIATAN_PATCH);
    notificationNotify.mockResolvedValue(undefined);

    const prisma = {
      user: { findUnique: userFindUnique, findMany: userFindMany },
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
        { provide: NotificationService, useValue: { notify: notificationNotify } },
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
    localChat.mockResolvedValue(KEGIATAN_PATCH);

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

  it('stops kegiatan and asesmen generation with missing TP before save/provider/audit', async () => {
    rppFindFirst.mockResolvedValue({ ...baseRpp, body: { cp: 'CP tersimpan', tp: [] } });

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_FOUNDATION_INCOMPLETE' }) });
    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'asesmen' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_FOUNDATION_INCOMPLETE' }) });

    expect(localChat).not.toHaveBeenCalled();
    expect(cloudChat).not.toHaveBeenCalled();
    expect(aiGenerationCreate).not.toHaveBeenCalled();
  });

  it('stops CP/TP generation with missing CP before provider call', async () => {
    rppFindFirst.mockResolvedValue({ ...baseRpp, body: { tp: ['TP browser'] } });

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'cp_tp' }, GURU))
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

  it('rejects markdown/code-fence and legacy KI/KD output before audit success', async () => {
    cloudChat.mockResolvedValue('```json\n{"kegiatan":[{"inti":"Kompetensi Dasar lama"}]}\n```');

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_OUTPUT_INVALID' }) });

    expect(aiGenerationCreate).not.toHaveBeenCalled();
  });

  it('rejects an outer code fence around otherwise valid JSON before audit success', async () => {
    cloudChat.mockResolvedValue(`\`\`\`json\n${KEGIATAN_PATCH}\n\`\`\``);

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_OUTPUT_INVALID' }) });

    expect(aiGenerationCreate).not.toHaveBeenCalled();
  });

  it('rejects a nested code fence inside otherwise valid JSON before audit success', async () => {
    cloudChat.mockResolvedValue(kegiatanPatchWithInti('Siswa membandingkan contoh ```teks``` dan menjelaskan hasilnya.'));

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_OUTPUT_INVALID' }) });

    expect(aiGenerationCreate).not.toHaveBeenCalled();
  });

  it('rejects incomplete kegiatan patches before audit success', async () => {
    cloudChat.mockResolvedValue(JSON.stringify({
      kegiatan: [{ pertemuan: 'Pertemuan 1', inti: 'Hanya kegiatan inti.' }],
    }));

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_OUTPUT_INVALID' }) });

    expect(aiGenerationCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['KD mandiri', 'Gunakan KD 3.1 sebagai acuan.'],
    ['Kompetensi Dasar', 'Mengacu pada Kompetensi Dasar kelas X.'],
    ['Kompetensi Inti', 'Mengacu pada Kompetensi Inti kelas X.'],
    ['KI/KD', 'Mengacu pada KI/KD kelas X.'],
    ['KI-KD', 'Mengacu pada KI-KD kelas X.'],
    ['KI dan KD', 'Mengacu pada KI dan KD kelas X.'],
    ['heading markdown generik', '# Tujuan Pembelajaran\nSiswa memahami grafik.'],
  ])('rejects legacy curriculum or markdown heading output without code fence: %s', async (_case, badText) => {
    cloudChat.mockResolvedValue(kegiatanPatchWithInti(badText));

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_OUTPUT_INVALID' }) });

    expect(aiGenerationCreate).not.toHaveBeenCalled();
  });

  it('rejects extra fields and CP overwrite in CP/TP patch', async () => {
    cloudChat.mockResolvedValue(JSON.stringify({
      cp: 'CP buatan AI',
      tp: ['Menjelaskan grafik fungsi linear.'],
    }));

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'cp_tp' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_OUTPUT_INVALID' }) });

    expect(aiGenerationCreate).not.toHaveBeenCalled();
  });

  it('returns a structured patch for ATP and validates TP refs against saved TP', async () => {
    cloudChat.mockResolvedValue(ATP_PATCH);

    const res = await service.generateRppStep({ rppId: RPP_ID, section: 'atp' }, GURU);

    expect(res).toEqual({
      type: 'atp',
      output: { atp: [{ tpRef: 'TP 1', indikator: 'Menjelaskan grafik fungsi linear dengan benar.' }] },
    });
  });

  it('rejects ATP refs that invent unsaved TP', async () => {
    cloudChat.mockResolvedValue(JSON.stringify({
      atp: [{ tpRef: 'TP 2', indikator: 'Indikator palsu.' }],
    }));

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'atp' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_OUTPUT_INVALID' }) });
  });

  it('uses a single configured provider attempt for non-PII prompts', async () => {
    const res = await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);

    expect(res).toEqual({
      type: 'kegiatan',
      output: {
        kegiatan: [{
          pertemuan: 'Pertemuan 1',
          pendahuluan: 'Menyampaikan tujuan pembelajaran.',
          inti: 'Menganalisis grafik fungsi linear.',
          penutup: 'Refleksi dan umpan balik.',
        }],
      },
    });
    expect(cloudChat).toHaveBeenCalledTimes(1);
    expect(localChat).not.toHaveBeenCalled();
  });

  it('falls back to Ollama and notifies admin when OpenAI quota is exhausted', async () => {
    cloudChat.mockRejectedValue(new Error('OpenAI chat gagal: HTTP 429 — {"error":{"code":"insufficient_quota","message":"You exceeded your current quota"}}'));
    localChat.mockResolvedValue(KEGIATAN_PATCH);

    const res = await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);

    expect(res.output).toEqual({
      kegiatan: [{
        pertemuan: 'Pertemuan 1',
        pendahuluan: 'Menyampaikan tujuan pembelajaran.',
        inti: 'Menganalisis grafik fungsi linear.',
        penutup: 'Refleksi dan umpan balik.',
      }],
    });
    expect(cloudChat).toHaveBeenCalledTimes(1);
    expect(localChat).toHaveBeenCalledTimes(1);
    expect(notificationNotify).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'email',
      to: 'admin@example.sch.id',
      subject: 'OpenAI fallback aktif',
      refType: 'ai_openai_quota',
    }));
    expect((notificationNotify.mock.calls[0][0] as { body: string }).body).toContain('Ollama lokal');
    expect(aiGenerationCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ model: 'ollama' }),
    }));
  });

  it('throttles repeated OpenAI quota admin notifications while continuing fallback', async () => {
    cloudChat.mockRejectedValue(new Error('OpenAI chat gagal: HTTP 429 — insufficient_quota'));
    localChat.mockResolvedValue(KEGIATAN_PATCH);

    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);
    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);

    expect(cloudChat).toHaveBeenCalledTimes(2);
    expect(localChat).toHaveBeenCalledTimes(2);
    expect(notificationNotify).toHaveBeenCalledTimes(1);
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
