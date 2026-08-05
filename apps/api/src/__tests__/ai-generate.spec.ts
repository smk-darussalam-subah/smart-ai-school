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
import { OpenAiProviderError } from '../ai/adapters/openai.adapter';
import { AiProviderStatusService } from '../ai/ai-provider-status.service';

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
const flushPromises = () => new Promise<void>((resolve) => setImmediate(resolve));

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
  const shouldAttemptOpenAiProbe = jest.fn();
  const markOpenAiQuotaExhausted = jest.fn();
  const markOpenAiRecovered = jest.fn();
  const claimOpenAiQuotaNoticeIncident = jest.fn();
  const releaseOpenAiQuotaNoticeIncident = jest.fn();

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
    [userFindUnique, userFindMany, teacherFindUnique, rppFindFirst, teachingAssignmentFindFirst, aiGenerationCreate, localChat, cloudChat, notificationNotify, shouldAttemptOpenAiProbe, markOpenAiQuotaExhausted, markOpenAiRecovered, claimOpenAiQuotaNoticeIncident, releaseOpenAiQuotaNoticeIncident]
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
    shouldAttemptOpenAiProbe.mockResolvedValue(true);
    markOpenAiQuotaExhausted.mockResolvedValue(undefined);
    markOpenAiRecovered.mockResolvedValue(undefined);
    claimOpenAiQuotaNoticeIncident.mockResolvedValue('incident-1');
    releaseOpenAiQuotaNoticeIncident.mockResolvedValue(undefined);

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
        { provide: AiProviderStatusService, useValue: {
          shouldAttemptOpenAiProbe,
          markOpenAiQuotaExhausted,
          markOpenAiRecovered,
          claimOpenAiQuotaNoticeIncident,
          releaseOpenAiQuotaNoticeIncident,
        } },
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
    expect(cloudChat).toHaveBeenCalledWith(
      expect.stringContaining('Schema JSON'),
      undefined,
      { responseFormat: expect.objectContaining({
        type: 'json_schema',
        name: 'rpp_kegiatan_patch',
        schema: expect.objectContaining({
          additionalProperties: false,
          required: ['kegiatan'],
        }),
      }) },
    );
    expect(localChat).not.toHaveBeenCalled();
  });

  it('opens circuit, falls back to Ollama, and notifies admin when OpenAI quota is exhausted', async () => {
    localChat.mockResolvedValue(KEGIATAN_PATCH);
    cloudChat.mockRejectedValue(new OpenAiProviderError(
      'You exceeded your current quota',
      429,
      'organization_spend_limit_exceeded',
      'insufficient_quota',
      null,
    ));

    const res = await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);
    await flushPromises();
    await flushPromises();

    expect(res.output).toEqual({
      kegiatan: [{
        pertemuan: 'Pertemuan 1',
        pendahuluan: 'Menyampaikan tujuan pembelajaran.',
        inti: 'Menganalisis grafik fungsi linear.',
        penutup: 'Refleksi dan umpan balik.',
      }],
    });
    expect(cloudChat).toHaveBeenCalledTimes(1);
    expect(localChat).toHaveBeenCalledWith(
      expect.stringContaining('Schema JSON'),
      undefined,
      { responseFormat: expect.objectContaining({
        type: 'json_schema',
        name: 'rpp_kegiatan_patch',
        schema: expect.objectContaining({
          additionalProperties: false,
          required: ['kegiatan'],
        }),
      }) },
    );
    expect(markOpenAiQuotaExhausted).toHaveBeenCalledWith('organization_spend_limit_exceeded');
    expect(notificationNotify).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'email',
      to: 'admin@example.sch.id',
      subject: 'OpenAI fallback aktif',
      refType: 'ai_openai_quota',
      refId: 'incident-1',
    }));
    expect((notificationNotify.mock.calls[0][0] as { body: string }).body).toContain('Ollama lokal');
    expect((notificationNotify.mock.calls[0][0] as { body: string }).body).toContain('billing/usage OpenAI');
    expect(aiGenerationCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ model: 'ollama' }),
    }));
  });

  it.each([
    'credit_balance_exhausted',
    'organization_usage_limit_exceeded',
  ])('opens circuit and falls back for official OpenAI quota code %s', async (code) => {
    cloudChat.mockRejectedValue(new OpenAiProviderError(
      'OpenAI usage is not available',
      429,
      code,
      'insufficient_quota',
      null,
    ));
    localChat.mockResolvedValue(KEGIATAN_PATCH);

    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);
    await flushPromises();
    await flushPromises();

    expect(cloudChat).toHaveBeenCalledTimes(1);
    expect(localChat).toHaveBeenCalledTimes(1);
    expect(markOpenAiQuotaExhausted).toHaveBeenCalledWith(code);
    expect(aiGenerationCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ model: 'ollama' }),
    }));
  });

  it('throttles repeated OpenAI quota admin notifications while continuing fallback', async () => {
    claimOpenAiQuotaNoticeIncident
      .mockResolvedValueOnce('incident-1')
      .mockResolvedValueOnce(null);
    cloudChat.mockRejectedValue(new OpenAiProviderError(
      'You exceeded your current quota',
      429,
      'insufficient_quota',
      'insufficient_quota',
      null,
    ));
    localChat.mockResolvedValue(KEGIATAN_PATCH);

    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);
    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);
    await flushPromises();
    await flushPromises();

    expect(cloudChat).toHaveBeenCalledTimes(2);
    expect(localChat).toHaveBeenCalledTimes(2);
    expect(notificationNotify).toHaveBeenCalledTimes(1);
    expect(claimOpenAiQuotaNoticeIncident).toHaveBeenCalledTimes(2);
  });

  it('bypasses OpenAI while Redis circuit is open and uses Ollama directly', async () => {
    shouldAttemptOpenAiProbe.mockResolvedValue(false);
    localChat.mockResolvedValue(KEGIATAN_PATCH);

    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);

    expect(cloudChat).not.toHaveBeenCalled();
    expect(localChat).toHaveBeenCalledTimes(1);
    expect(notificationNotify).not.toHaveBeenCalled();
    expect(aiGenerationCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ model: 'ollama' }),
    }));
  });

  it('retries temporary OpenAI rate limit once without opening circuit or falling back', async () => {
    cloudChat
      .mockRejectedValueOnce(new OpenAiProviderError(
        'Rate limit reached',
        429,
        'rate_limit_exceeded',
        'rate_limit_exceeded',
        0,
      ))
      .mockResolvedValueOnce(KEGIATAN_PATCH);

    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);

    expect(cloudChat).toHaveBeenCalledTimes(2);
    expect(localChat).not.toHaveBeenCalled();
    expect(markOpenAiQuotaExhausted).not.toHaveBeenCalled();
    expect(notificationNotify).not.toHaveBeenCalled();
    expect(aiGenerationCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ model: 'gpt-4.1-mini' }),
    }));
  });

  it('does not retry before a long Retry-After budget and returns rate-limited response', async () => {
    cloudChat.mockRejectedValue(new OpenAiProviderError(
      'Rate limit reached',
      429,
      'rate_limit_exceeded',
      'rate_limit_exceeded',
      5,
    ));

    await expect(service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU))
      .rejects.toMatchObject({ response: expect.objectContaining({ error: 'AI_PROVIDER_RATE_LIMITED' }) });

    expect(cloudChat).toHaveBeenCalledTimes(1);
    expect(localChat).not.toHaveBeenCalled();
    expect(markOpenAiQuotaExhausted).not.toHaveBeenCalled();
    expect(notificationNotify).not.toHaveBeenCalled();
  });

  it('uses one incident refId for all admin recipients in the same quota notice', async () => {
    userFindMany.mockResolvedValue([{
      id: 'admin-1',
      fullName: 'Super Admin 1',
      email: 'admin1@example.sch.id',
      phone: null,
    }, {
      id: 'admin-2',
      fullName: 'Super Admin 2',
      email: null,
      phone: '628100000001',
    }]);
    cloudChat.mockRejectedValue(new OpenAiProviderError(
      'Project spend limit exceeded',
      429,
      'project_spend_limit_exceeded',
      'insufficient_quota',
      null,
    ));
    localChat.mockResolvedValue(KEGIATAN_PATCH);

    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);
    await flushPromises();
    await flushPromises();

    expect(notificationNotify).toHaveBeenCalledTimes(2);
    expect(notificationNotify.mock.calls.map((call) => call[0])).toEqual([
      expect.objectContaining({ channel: 'email', to: 'admin1@example.sch.id', refId: 'incident-1' }),
      expect.objectContaining({ channel: 'whatsapp', to: '628100000001', refId: 'incident-1' }),
    ]);
  });

  it('keeps quota notice throttle when at least one admin recipient succeeds', async () => {
    userFindMany.mockResolvedValue([{
      id: 'admin-1',
      fullName: 'Super Admin 1',
      email: 'admin1@example.sch.id',
      phone: null,
    }, {
      id: 'admin-2',
      fullName: 'Super Admin 2',
      email: 'admin2@example.sch.id',
      phone: null,
    }]);
    notificationNotify
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('email unavailable'));
    cloudChat.mockRejectedValue(new OpenAiProviderError(
      'Project spend limit exceeded',
      429,
      'project_spend_limit_exceeded',
      'insufficient_quota',
      null,
    ));
    localChat.mockResolvedValue(KEGIATAN_PATCH);

    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);
    await flushPromises();
    await flushPromises();

    expect(notificationNotify).toHaveBeenCalledTimes(2);
    expect(releaseOpenAiQuotaNoticeIncident).not.toHaveBeenCalled();
  });

  it('releases quota notice throttle when every recipient delivery fails', async () => {
    userFindMany.mockResolvedValue([{
      id: 'admin-1',
      fullName: 'Super Admin 1',
      email: 'admin1@example.sch.id',
      phone: null,
    }]);
    notificationNotify.mockRejectedValue(new Error('email unavailable'));
    cloudChat.mockRejectedValue(new OpenAiProviderError(
      'Project spend limit exceeded',
      429,
      'project_spend_limit_exceeded',
      'insufficient_quota',
      null,
    ));
    localChat.mockResolvedValue(KEGIATAN_PATCH);

    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);
    await flushPromises();
    await flushPromises();

    expect(notificationNotify).toHaveBeenCalledTimes(1);
    expect(releaseOpenAiQuotaNoticeIncident).toHaveBeenCalledWith('incident-1');
  });

  it('uses unique notification refIds for separate quota incidents', async () => {
    claimOpenAiQuotaNoticeIncident
      .mockResolvedValueOnce('incident-1')
      .mockResolvedValueOnce('incident-2');
    cloudChat.mockRejectedValue(new OpenAiProviderError(
      'Project spend limit exceeded',
      429,
      'project_spend_limit_exceeded',
      'insufficient_quota',
      null,
    ));
    localChat.mockResolvedValue(KEGIATAN_PATCH);

    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);
    await flushPromises();
    await flushPromises();
    await service.generateRppStep({ rppId: RPP_ID, section: 'kegiatan' }, GURU);
    await flushPromises();
    await flushPromises();

    const first = notificationNotify.mock.calls[0][0] as { refId: string };
    const second = notificationNotify.mock.calls[1][0] as { refId: string };
    expect(notificationNotify).toHaveBeenCalledTimes(2);
    expect(first.refId).not.toBe(second.refId);
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
