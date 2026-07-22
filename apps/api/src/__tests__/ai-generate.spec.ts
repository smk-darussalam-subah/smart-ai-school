// =============================================================================
// W3-5: AiGenerateService — PII stripping on egress + redacted audit storage
//
// Verifies that prompts built by AiGenerateService are stripped of PII
// (email/phone/NIS/name) BEFORE being sent to the gateway and BEFORE being
// persisted in the AiGeneration audit record.
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { AuthUser } from '@smk/auth';
import { AiGenerateService } from '../ai/ai-generate.service';
import { PrismaService } from '../prisma/prisma.service';

const GURU: AuthUser = { keycloakId: 'kc-guru', username: 'guru1', roles: ['GURU'] } as AuthUser;

describe('AiGenerateService — W3-5 PII stripping', () => {
  let service: AiGenerateService;
  const userFindUnique = jest.fn();
  const teacherFindFirst = jest.fn();
  const aiGenerationCreate = jest.fn();
  // Capture the prompt that reaches the gateway AND the audit layer.
  const chatMock = jest.fn();

  beforeEach(async () => {
    userFindUnique.mockReset();
    teacherFindFirst.mockReset();
    aiGenerationCreate.mockReset();
    chatMock.mockReset();
    userFindUnique.mockResolvedValue({ id: 'user-1' });
    teacherFindFirst.mockResolvedValue({ id: 'teacher-1' });
    aiGenerationCreate.mockResolvedValue({});
    chatMock.mockResolvedValue('AI output');

    const prisma = {
      user: { findUnique: userFindUnique },
      teacher: { findUnique: teacherFindFirst },
      aiGeneration: { create: aiGenerationCreate },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiGenerateService,
        { provide: PrismaService, useValue: prisma },
        { provide: 'AI_GATEWAY', useValue: { chat: chatMock } },
        { provide: 'OPENAI_GATEWAY', useValue: null },
      ],
    }).compile();
    service = module.get(AiGenerateService);
  });

  it('W3-5: generateRppStep — prompt dikirim ke gateway selalu tanpa PII', async () => {
    await service.generateRppStep(
      {
        step: 'kegiatan',
        subject: 'Matematika',
        context: 'Hubungi Ahmad di email siswa@smkdarussalamsubah.sch.id atau HP 081234567890. NIS: 1234567890.',
      },
      GURU,
    );

    const promptSentToGateway = chatMock.mock.calls[0][0] as string;
    expect(promptSentToGateway).not.toContain('siswa@smkdarussalamsubah.sch.id');
    expect(promptSentToGateway).not.toContain('081234567890');
    expect(promptSentToGateway).not.toContain('1234567890');
    expect(promptSentToGateway).toContain('[EMAIL]');
    expect(promptSentToGateway).toContain('[HP]');
    expect(promptSentToGateway).toContain('[NIS]');
  });

  it('W3-5: audit record stores the redacted prompt, not the raw PII version', async () => {
    await service.generateMaterial(
      {
        subject: 'B. Indonesia',
        rppBody: 'Untuk materi hubungi Budi via email budi@example.com atau HP 081298765432.',
      },
      GURU,
    );

    const auditData = aiGenerationCreate.mock.calls[0][0].data as {
      prompt: string;
      output: string;
    };
    expect(auditData.prompt).not.toContain('budi@example.com');
    expect(auditData.prompt).not.toContain('081298765432');
    expect(auditData.prompt).toContain('[EMAIL]');
    expect(auditData.prompt).toContain('[HP]');
  });

  it('W3-5: generateQuestions strips PII from RPP body context', async () => {
    chatMock.mockResolvedValue('[{"body":"q1","options":["A"],"answer":"A","difficulty":"easy"}]');
    await service.generateQuestions(
      {
        type: 'multiple_choice',
        count: 1,
        subject: 'Matematika',
        rppBody: 'Nama: Siti Aminah. Email: siti@example.com',
      },
      GURU,
    );

    const promptSentToGateway = chatMock.mock.calls[0][0] as string;
    expect(promptSentToGateway).not.toContain('siti@example.com');
    expect(promptSentToGateway).toContain('[EMAIL]');
    // Nama berlabel juga di-redact.
    expect(promptSentToGateway).toContain('[NAMA]');
  });

  it('W3-5: generateAtp strips PII from CP/TP context', async () => {
    chatMock.mockResolvedValue('[{"code":"TP 1.1","tp":"x","atp":["a"]}]');
    await service.generateAtp(
      {
        subject: 'Matematika',
        cp: 'CP dengan kontak guru: guru@example.com',
        tp: ['TP 1.1'],
      },
      GURU,
    );

    const promptSentToGateway = chatMock.mock.calls[0][0] as string;
    expect(promptSentToGateway).not.toContain('guru@example.com');
    expect(promptSentToGateway).toContain('[EMAIL]');
  });
});
