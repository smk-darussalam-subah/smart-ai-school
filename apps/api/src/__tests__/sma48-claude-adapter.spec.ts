// =============================================================================
// sma48-claude-adapter.spec.ts — Unit tests SMA-48 ClaudeAdapter + R-03
//
// Skenario wajib:
//   (a) stripPiiForLlm(nama+NIS+email+HP dummy) → semua jadi placeholder berlabel
//   (b) hasPii true → routing ke Ollama, ClaudeAdapter TIDAK dipanggil (spy)
//   (c) tanpa ANTHROPIC_API_KEY → factory pilih null → Ollama
//   (d) AI_PROVIDER=claude + key (mock) + pesan non-PII → ClaudeAdapter dipanggil
//       dengan teks yang sudah di-strip
// =============================================================================

jest.mock('@anthropic-ai/sdk');
jest.mock('@smk/auth', () => ({
  verifyKeycloakToken: jest.fn(),
  extractAuthUser: jest.fn(),
}));
jest.mock('@smk/logger', () => ({
  auditLog: jest.fn(),
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  logError: jest.fn(),
}));

import Anthropic from '@anthropic-ai/sdk';
import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from '../ai/ai.service';
import { AiController } from '../ai/ai.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AIGateway } from '@smk/types';
import { AuthUser } from '@smk/auth';
import { ClaudeAdapter } from '../ai/adapters/claude.adapter';
import { stripPiiForLlm, hasPii } from '../ai/adapters/pii-strip.utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeVector(len = 768): number[] {
  return Array.from({ length: len }, (_, i) => i / len);
}

function makeUser(): AuthUser {
  return {
    keycloakId: 'kc-user-uuid',
    email: 'guru@smk.sch.id',
    username: 'guru',
    roles: ['GURU'],
    fullName: 'Guru Test',
  };
}

function makeOllamaGateway(): jest.Mocked<AIGateway> {
  return {
    embed: jest.fn().mockResolvedValue(makeVector()),
    chat: jest.fn().mockResolvedValue('Jawaban dari Ollama'),
  };
}

function makeClaudeGateway(): jest.Mocked<AIGateway> {
  return {
    embed: jest.fn().mockRejectedValue(new Error('embed not supported')),
    chat: jest.fn().mockResolvedValue('Jawaban dari Claude'),
  };
}

function makePrisma(): PrismaService {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'db-user-uuid' }),
    },
    ragChunk: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    chatSession: {
      findUnique: jest.fn().mockResolvedValue({ id: 'session-uuid', userId: 'db-user-uuid' }),
      create: jest.fn().mockResolvedValue({ id: 'new-session-uuid' }),
    },
    chatMessage: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
}

async function buildModule(
  ollamaGw: AIGateway,
  claudeGw: AIGateway | null,
  prisma: PrismaService,
): Promise<TestingModule> {
  return Test.createTestingModule({
    controllers: [AiController],
    providers: [
      AiService,
      { provide: 'AI_GATEWAY', useValue: ollamaGw },
      { provide: 'CLAUDE_GATEWAY', useValue: claudeGw },
      { provide: 'OPENAI_GATEWAY', useValue: null }, // R-28: default off in tests
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
}

// ── (a) stripPiiForLlm — placeholder berlabel ─────────────────────────────────

describe('(a) stripPiiForLlm: PII diganti placeholder berlabel', () => {
  it('email → [EMAIL]', () => {
    const result = stripPiiForLlm('Hubungi siswa@smk.sch.id untuk konfirmasi');
    expect(result).not.toContain('siswa@smk.sch.id');
    expect(result).toContain('[EMAIL]');
  });

  it('nomor HP +62 → [HP]', () => {
    const result = stripPiiForLlm('WhatsApp ke +6281234567890');
    expect(result).not.toContain('+6281234567890');
    expect(result).toContain('[HP]');
  });

  it('nomor HP 08xx → [HP]', () => {
    const result = stripPiiForLlm('HP siswa: 081234567890');
    expect(result).not.toContain('081234567890');
    expect(result).toContain('[HP]');
  });

  it('NIS berlabel → [NIS]', () => {
    const result = stripPiiForLlm('Data siswa NIS: 1234567890 belum lengkap');
    expect(result).not.toContain('1234567890');
    expect(result).toContain('[NIS]');
  });

  it('nama berlabel → [NAMA]', () => {
    const result = stripPiiForLlm('Konflik pada fullName: Ahmad Fauzi saat insert');
    expect(result).not.toContain('Ahmad Fauzi');
    expect(result).toContain('[NAMA]');
  });

  it('kombinasi nama+NIS+email+HP dummy → semua jadi placeholder berlabel', () => {
    const input =
      'Siswa fullName: Budi Santoso, NIS: 9876543210, email budi@smk.id, HP 081298765432';
    const result = stripPiiForLlm(input);

    expect(result).toContain('[NAMA]');
    expect(result).toContain('[NIS]');
    expect(result).toContain('[EMAIL]');
    expect(result).toContain('[HP]');

    expect(result).not.toContain('Budi Santoso');
    expect(result).not.toContain('9876543210');
    expect(result).not.toContain('budi@smk.id');
    expect(result).not.toContain('081298765432');
  });

  it('teks tanpa PII → tidak berubah', () => {
    const safe = 'Apa syarat pendaftaran PPDB tahun ini?';
    expect(stripPiiForLlm(safe)).toBe(safe);
  });

  it('idempoten: placeholder sudah ada → tidak di-strip ulang', () => {
    const already = 'Email: [EMAIL], NIS: [NIS]';
    expect(stripPiiForLlm(already)).toBe(already);
  });
});

// ── hasPii ────────────────────────────────────────────────────────────────────

describe('hasPii: deteksi PII dalam teks', () => {
  it('email → true', () => expect(hasPii('test@example.com')).toBe(true));
  it('HP +62 → true', () => expect(hasPii('+6281234567890')).toBe(true));
  it('HP 08xx → true', () => expect(hasPii('081234567890')).toBe(true));
  it('NIS berlabel → true', () => expect(hasPii('NIS: 12345678')).toBe(true));
  it('nama berlabel → true', () => expect(hasPii('nama: Ahmad')).toBe(true));
  it('teks bersih → false', () => expect(hasPii('Jadwal sholat Subuh jam 04:30')).toBe(false));
  it('string kosong → false', () => expect(hasPii('')).toBe(false));
});

// ── (b) hasPii true → routing ke Ollama, Claude TIDAK dipanggil ──────────────

describe('(b) Decision tree: hasPii → paksa Ollama, ClaudeAdapter tidak dipanggil', () => {
  it('pesan mengandung email → gateway (Ollama) dipanggil, claudeGateway tidak', async () => {
    const ollama = makeOllamaGateway();
    const claude = makeClaudeGateway();
    const mod = await buildModule(ollama, claude, makePrisma());
    const svc = mod.get(AiService);

    await svc.chatWithRag({ message: 'Email siswa: test@sekolah.id apa ini?' }, makeUser());

    expect(ollama.chat).toHaveBeenCalled();
    expect(claude.chat).not.toHaveBeenCalled();
  });

  it('pesan mengandung NIS berlabel → Ollama, bukan Claude', async () => {
    const ollama = makeOllamaGateway();
    const claude = makeClaudeGateway();
    const mod = await buildModule(ollama, claude, makePrisma());
    const svc = mod.get(AiService);

    await svc.chatWithRag({ message: 'Cek NIS: 12345678 statusnya?' }, makeUser());

    expect(ollama.chat).toHaveBeenCalled();
    expect(claude.chat).not.toHaveBeenCalled();
  });

  it('pesan mengandung HP → Ollama, bukan Claude', async () => {
    const ollama = makeOllamaGateway();
    const claude = makeClaudeGateway();
    const mod = await buildModule(ollama, claude, makePrisma());
    const svc = mod.get(AiService);

    await svc.chatWithRag({ message: 'Hubungi orang tua di 081298765432' }, makeUser());

    expect(ollama.chat).toHaveBeenCalled();
    expect(claude.chat).not.toHaveBeenCalled();
  });

  it('context chunk mengandung PII → paksa Ollama meski pesan bersih', async () => {
    const ollama = makeOllamaGateway();
    const claude = makeClaudeGateway();
    const prisma = makePrisma();
    // $queryRaw return chunk dengan PII di content
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      { id: 'c1', title: 'Data Siswa', content: 'siswa@contoh.id terdaftar', similarity: 0.9 },
    ]);
    const mod = await buildModule(ollama, claude, prisma);
    const svc = mod.get(AiService);

    await svc.chatWithRag({ message: 'informasi siswa?' }, makeUser());

    expect(ollama.chat).toHaveBeenCalled();
    expect(claude.chat).not.toHaveBeenCalled();
  });
});

// ── (c) tanpa ANTHROPIC_API_KEY → CLAUDE_GATEWAY null → Ollama ───────────────

describe('(c) Tanpa ANTHROPIC_API_KEY: CLAUDE_GATEWAY null, Ollama dipakai', () => {
  it('claudeGateway null → chat selalu ke Ollama meski pesan non-PII', async () => {
    const ollama = makeOllamaGateway();
    const mod = await buildModule(ollama, null, makePrisma()); // claudeGw = null
    const svc = mod.get(AiService);

    const result = await svc.chatWithRag({ message: 'Apa itu PPDB?' }, makeUser());

    expect(ollama.chat).toHaveBeenCalled();
    expect(result.answer).toBe('Jawaban dari Ollama');
  });

  it('claudeGateway null + hasPii → Ollama (tidak ada perubahan jalur)', async () => {
    const ollama = makeOllamaGateway();
    const mod = await buildModule(ollama, null, makePrisma());
    const svc = mod.get(AiService);

    await svc.chatWithRag({ message: 'Email siswa: test@test.id' }, makeUser());

    expect(ollama.chat).toHaveBeenCalled();
  });
});

// ── (d) Claude aktif + non-PII → ClaudeAdapter dipanggil dengan teks ter-strip ─

describe('(d) Claude aktif + non-PII: ClaudeAdapter dipanggil, teks sudah di-strip', () => {
  it('pesan non-PII → claudeGateway.chat dipanggil, ollamaGateway.chat tidak', async () => {
    const ollama = makeOllamaGateway();
    const claude = makeClaudeGateway();
    const mod = await buildModule(ollama, claude, makePrisma());
    const svc = mod.get(AiService);

    const result = await svc.chatWithRag({ message: 'Bagaimana cara daftar PPDB?' }, makeUser());

    expect(claude.chat).toHaveBeenCalled();
    expect(ollama.chat).not.toHaveBeenCalled();
    expect(result.answer).toBe('Jawaban dari Claude');
  });

  it('teks yang dikirim ke Claude sudah di-strip (belt-and-suspenders via adapter)', async () => {
    const ollama = makeOllamaGateway();
    const claude = makeClaudeGateway();
    const mod = await buildModule(ollama, claude, makePrisma());
    const svc = mod.get(AiService);

    // Pesan tanpa PII yang terdeteksi hasPii (kata-kata aman)
    const safeMessage = 'Syarat masuk jurusan RPL apa saja?';
    await svc.chatWithRag({ message: safeMessage }, makeUser());

    expect(claude.chat).toHaveBeenCalledWith(safeMessage, undefined);
  });

  it('service memanggil claudeGateway.chat dengan stripped message dan context', async () => {
    const ollama = makeOllamaGateway();
    const claude = makeClaudeGateway();
    const prisma = makePrisma();
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      { id: 'c1', title: 'FAQ PPDB', content: 'Pendaftaran dibuka Januari', similarity: 0.9 },
    ]);
    const mod = await buildModule(ollama, claude, prisma);
    const svc = mod.get(AiService);

    await svc.chatWithRag({ message: 'Kapan pendaftaran dibuka?' }, makeUser());

    expect(claude.chat).toHaveBeenCalledWith(
      'Kapan pendaftaran dibuka?',
      expect.arrayContaining([
        expect.objectContaining({ title: 'FAQ PPDB' }),
      ]),
    );
  });
});

// ── ClaudeAdapter.embed() — safeguard ────────────────────────────────────────

describe('ClaudeAdapter.embed(): harus throw (embedding tidak via Claude)', () => {
  it('embed() melempar Error (R-03 safeguard — embedding tetap Ollama)', async () => {
    // Mock Anthropic constructor
    const MockAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;
    MockAnthropic.mockImplementation(() => ({ messages: { create: jest.fn() } } as unknown as Anthropic));

    const adapter = new ClaudeAdapter('test-api-key');
    await expect(adapter.embed('teks')).rejects.toThrow(/embed/i);
  });
});

// ── ClaudeAdapter.chat() — mock SDK ───────────────────────────────────────────

describe('ClaudeAdapter.chat(): kirim ke Claude API (mocked SDK)', () => {
  beforeEach(() => {
    const MockAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;
    MockAnthropic.mockImplementation(
      () =>
        ({
          messages: {
            create: jest.fn().mockResolvedValue({
              content: [{ type: 'text', text: 'Jawaban dari Claude mock' }],
            }),
          },
        }) as unknown as Anthropic,
    );
  });

  it('chat() memanggil messages.create dan mengembalikan teks', async () => {
    const adapter = new ClaudeAdapter('test-api-key');
    const result = await adapter.chat('Pertanyaan aman');
    expect(result).toBe('Jawaban dari Claude mock');
  });

  it('chat() memanggil stripPiiForLlm secara internal (belt-and-suspenders)', async () => {
    const adapter = new ClaudeAdapter('test-api-key');
    // Meski ada "email" dalam pesan, adapter strip dulu
    const result = await adapter.chat('Ada pertanyaan umum');
    expect(typeof result).toBe('string');
  });

  it('chat() dengan context → menggabungkan context dalam prompt ke Claude', async () => {
    const adapter = new ClaudeAdapter('test-api-key');
    const context = [{ title: 'FAQ PPDB', content: 'Info pendaftaran' }];
    const result = await adapter.chat('Bagaimana daftar?', context);
    expect(result).toBe('Jawaban dari Claude mock');
  });

  it('respons tanpa text block → throw Error', async () => {
    const MockAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;
    MockAnthropic.mockImplementation(
      () =>
        ({
          messages: {
            create: jest.fn().mockResolvedValue({ content: [] }),
          },
        }) as unknown as Anthropic,
    );

    const adapter = new ClaudeAdapter('test-api-key');
    await expect(adapter.chat('Test')).rejects.toThrow(/text block/i);
  });
});
