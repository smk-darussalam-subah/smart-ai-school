// =============================================================================
// ai-gateway.spec.ts — Unit tests SMA-45
//
// Skenario wajib:
//   ✓ OllamaAdapter.embed() panjang != 768 → throw (dimensi guard gate §2.1)
//   ✓ OllamaAdapter.embed() 768 → kembalikan array number
//   ✓ OllamaAdapter.chat() susun context chunk + return string
//   ✓ OllamaAdapter.chat() tanpa context → return string
//   ✓ OllamaAdapter.embed() Ollama error HTTP non-200 → throw
//   ✓ OllamaAdapter.chat() Ollama error HTTP non-200 → throw
//   ✓ Factory AI_PROVIDER unset → OpenAI gateway (default) + Ollama embed gateway
//   ✓ Factory AI_PROVIDER=ollama → OllamaAdapter
//   ✓ Factory AI_PROVIDER=claude → throw (Sprint 4 belum tersedia)
//   ✓ AiService.backfillEmbeddings() panggil embed per chunk NULL + $queryRaw UPDATE
//   ✓ AiService.backfillEmbeddings() chunk yang sudah ada embedding → di-skip (dari query)
//   ✓ AiService.backfillEmbeddings() embed gagal → hasil error dicatat, tidak throw
// =============================================================================

jest.mock('@smk/auth', () => ({
  verifyKeycloakToken: jest.fn(),
  extractAuthUser: jest.fn(),
}));

jest.mock('@smk/logger', () => ({
  auditLog: jest.fn(),
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  logError: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { OllamaAdapter } from '../ai/adapters/ollama.adapter';
import { OpenAiAdapter, OpenAiProviderError } from '../ai/adapters/openai.adapter';
import { AiModule } from '../ai/ai.module';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { AIGateway } from '@smk/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAdapter(dims = 768): OllamaAdapter {
  return new OllamaAdapter('http://ollama:11434', 'qwen2.5:7b', 'nomic-embed-text', dims);
}

function mockFetchEmbed(embedding: number[]): void {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: true,
    json: async () => ({ embedding }),
    text: async () => '',
  } as unknown as Response);
}

function mockFetchEmbedError(status = 500, body = 'Internal Error'): void {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => body,
    json: async () => ({}),
  } as unknown as Response);
}

function mockFetchChat(content: string): void {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: true,
    json: async () => ({ message: { content } }),
    text: async () => '',
  } as unknown as Response);
}

function mockFetchChatError(status = 503, body = 'Service Unavailable'): void {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => body,
    json: async () => ({}),
  } as unknown as Response);
}

// ── PrismaService mock ────────────────────────────────────────────────────────

function buildPrismaMock() {
  return {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  };
}

// =============================================================================
// OllamaAdapter — embed()
// =============================================================================

describe('OllamaAdapter.embed()', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('dimensi cocok (768) → kembalikan array number', async () => {
    const embedding = Array.from({ length: 768 }, (_, i) => i * 0.001);
    mockFetchEmbed(embedding);

    const adapter = makeAdapter(768);
    const result = await adapter.embed('Apa itu PPDB?');

    expect(result).toHaveLength(768);
    expect(typeof result[0]).toBe('number');
  });

  it('dimensi tidak cocok → throw dengan pesan jelas (gate §2.1)', async () => {
    const embedding = Array.from({ length: 512 }, () => 0.1); // salah dimensi
    mockFetchEmbed(embedding);

    const adapter = makeAdapter(768);
    await expect(adapter.embed('tes')).rejects.toThrow(/Dimensi embedding tidak cocok.*512.*768/s);
  });

  it('HTTP non-200 → throw dengan info status', async () => {
    mockFetchEmbedError(503, 'Service unavailable');

    const adapter = makeAdapter(768);
    await expect(adapter.embed('tes')).rejects.toThrow(/Ollama embed gagal.*503/);
  });

  it('embedding kosong → throw', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ embedding: [] }),
      text: async () => '',
    } as unknown as Response);

    const adapter = makeAdapter(768);
    await expect(adapter.embed('tes')).rejects.toThrow(/embedding kosong/);
  });
});

// =============================================================================
// OllamaAdapter — chat()
// =============================================================================

describe('OllamaAdapter.chat()', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('tanpa context → return string dari Ollama', async () => {
    mockFetchChat('Selamat datang di SMK Darussalam Subah!');

    const adapter = makeAdapter();
    const result = await adapter.chat('Apa nama sekolah ini?');

    expect(typeof result).toBe('string');
    expect(result).toContain('SMK Darussalam');
  });

  it('does not use JSON mode for normal Ollama chat', async () => {
    const receivedBodies: unknown[] = [];
    global.fetch = jest.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      receivedBodies.push(JSON.parse(init.body as string));
      return {
        ok: true,
        json: async () => ({ message: { content: 'Jawaban naratif.' } }),
        text: async () => '',
      } as unknown as Response;
    });

    await makeAdapter().chat('Jelaskan PPDB.');

    expect(receivedBodies[0]).toEqual(expect.not.objectContaining({ format: 'json' }));
  });

  it('uses JSON mode for structured Ollama chat', async () => {
    const receivedBodies: unknown[] = [];
    global.fetch = jest.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      receivedBodies.push(JSON.parse(init.body as string));
      return {
        ok: true,
        json: async () => ({ message: { content: '{"sarana":"Laptop","target":"Kelas X"}' } }),
        text: async () => '',
      } as unknown as Response;
    });

    await makeAdapter().chat('Kembalikan JSON.', undefined, { responseFormat: 'json_object' });

    expect(receivedBodies[0]).toEqual(expect.objectContaining({
      format: 'json',
      options: expect.objectContaining({ num_predict: 512, temperature: 0.2 }),
    }));
  });

  it('uses JSON Schema mode for structured Ollama chat when schema is provided', async () => {
    const receivedBodies: unknown[] = [];
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: { sarana: { type: 'string' }, target: { type: 'string' } },
      required: ['sarana', 'target'],
    };
    global.fetch = jest.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      receivedBodies.push(JSON.parse(init.body as string));
      return {
        ok: true,
        json: async () => ({ message: { content: '{"sarana":"Laptop","target":"Kelas X"}' } }),
        text: async () => '',
      } as unknown as Response;
    });

    await makeAdapter().chat('Kembalikan JSON.', undefined, {
      responseFormat: { type: 'json_schema', name: 'rpp_sarana_patch', schema },
    });

    expect(receivedBodies[0]).toEqual(expect.objectContaining({
      format: schema,
      options: expect.objectContaining({ num_predict: 512, temperature: 0.2 }),
    }));
  });

  it('dengan context chunk → susun context + return string', async () => {
    const receivedBodies: unknown[] = [];
    global.fetch = jest.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      receivedBodies.push(JSON.parse(init.body as string));
      return {
        ok: true,
        json: async () => ({ message: { content: 'PPDB dibuka bulan Juli' } }),
        text: async () => '',
      } as unknown as Response;
    });

    const adapter = makeAdapter();
    const context = [
      { title: 'Jadwal PPDB', content: 'PPDB SMK Darussalam Subah dibuka pada bulan Juli setiap tahun.' },
    ];

    const result = await adapter.chat('Kapan PPDB dibuka?', context);

    expect(result).toBeTruthy();
    // pastikan ada system message dengan konteks
    const body = receivedBodies[0] as { messages: Array<{ role: string; content: string }> };
    const contextMsg = body.messages.find(
      (m) => m.role === 'system' && m.content.includes('Jadwal PPDB'),
    );
    expect(contextMsg).toBeDefined();
  });

  it('HTTP non-200 → throw', async () => {
    mockFetchChatError(500, 'Internal Error');

    const adapter = makeAdapter();
    await expect(adapter.chat('tes')).rejects.toThrow(/Ollama chat gagal.*500/);
  });

  it('respons tanpa message.content → throw', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: {} }),
      text: async () => '',
    } as unknown as Response);

    const adapter = makeAdapter();
    await expect(adapter.chat('tes')).rejects.toThrow(/message\.content/);
  });
});

// =============================================================================
// AiModule — factory AI_PROVIDER
// =============================================================================

describe('OpenAiAdapter.chat() provider errors', () => {
  const originalFetch = global.fetch;
  const dateNowSpy = jest.spyOn(Date, 'now');

  afterEach(() => {
    global.fetch = originalFetch;
    dateNowSpy.mockReset();
    jest.clearAllMocks();
  });

  afterAll(() => {
    dateNowSpy.mockRestore();
  });

  function mockOpenAiError(status: number, body: string, retryAfter: string | null = null): void {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status,
      headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? retryAfter : null) },
      text: async () => body,
    } as unknown as Response);
  }

  function mockOpenAiSuccess(content = 'Jawaban naratif.'): unknown[] {
    const receivedBodies: unknown[] = [];
    global.fetch = jest.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      receivedBodies.push(JSON.parse(init.body as string));
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content } }] }),
        text: async () => '',
      } as unknown as Response;
    });
    return receivedBodies;
  }

  it('does not request JSON mode for normal OpenAI chat', async () => {
    const receivedBodies = mockOpenAiSuccess();

    await new OpenAiAdapter('test-key').chat('Jelaskan PPDB.');

    expect(receivedBodies[0]).toEqual(expect.not.objectContaining({ response_format: expect.anything() }));
  });

  it('requests JSON object mode when structured output is required', async () => {
    const receivedBodies = mockOpenAiSuccess('{"sarana":"Laptop","target":"Kelas X"}');

    await new OpenAiAdapter('test-key').chat('Kembalikan JSON.', undefined, { responseFormat: 'json_object' });

    expect(receivedBodies[0]).toEqual(expect.objectContaining({
      response_format: { type: 'json_object' },
    }));
  });

  it('requests JSON Schema mode when section-specific schema is provided', async () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: { sarana: { type: 'string' }, target: { type: 'string' } },
      required: ['sarana', 'target'],
    };
    const receivedBodies = mockOpenAiSuccess('{"sarana":"Laptop","target":"Kelas X"}');

    await new OpenAiAdapter('test-key').chat('Kembalikan JSON.', undefined, {
      responseFormat: { type: 'json_schema', name: 'rpp_sarana_patch', schema },
    });

    expect(receivedBodies[0]).toEqual(expect.objectContaining({
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'rpp_sarana_patch',
          strict: true,
          schema,
        },
      },
    }));
  });

  it('parses JSON error status/code/type and numeric Retry-After', async () => {
    mockOpenAiError(429, JSON.stringify({
      error: {
        message: 'Rate limit reached',
        type: 'rate_limit_exceeded',
        code: 'rate_limit_exceeded',
      },
    }), '7');

    await expect(new OpenAiAdapter('test-key').chat('tes')).rejects.toMatchObject({
      name: 'OpenAiProviderError',
      status: 429,
      code: 'rate_limit_exceeded',
      type: 'rate_limit_exceeded',
      retryAfterSeconds: 7,
    });
  });

  it('parses HTTP-date Retry-After into seconds', async () => {
    dateNowSpy.mockReturnValue(Date.parse('2026-08-04T01:00:00.000Z'));
    mockOpenAiError(429, JSON.stringify({
      error: {
        message: 'Rate limit reached',
        type: 'rate_limit_exceeded',
        code: 'rate_limit_exceeded',
      },
    }), 'Tue, 04 Aug 2026 01:00:09 GMT');

    await expect(new OpenAiAdapter('test-key').chat('tes')).rejects.toMatchObject({
      retryAfterSeconds: 9,
    });
  });

  it('ignores malformed Retry-After header', async () => {
    mockOpenAiError(429, JSON.stringify({
      error: {
        message: 'Rate limit reached',
        type: 'rate_limit_exceeded',
        code: 'rate_limit_exceeded',
      },
    }), 'soon');

    await expect(new OpenAiAdapter('test-key').chat('tes')).rejects.toMatchObject({
      retryAfterSeconds: null,
    });
  });

  it('handles non-JSON body without leaking raw provider body or API key', async () => {
    const apiKey = 'sk-testSecretValue123456789';
    mockOpenAiError(500, `provider raw body with ${apiKey} and billing details`, null);

    try {
      await new OpenAiAdapter(apiKey).chat('tes');
      throw new Error('expected OpenAiProviderError');
    } catch (err) {
      expect(err).toBeInstanceOf(OpenAiProviderError);
      expect((err as Error).message).toBe('OpenAI chat gagal: HTTP 500');
      expect((err as Error).message).not.toContain(apiKey);
      expect((err as Error).message).not.toContain('provider raw body');
    }
  });

  it('redacts API key-like values from parsed OpenAI error message', async () => {
    const apiKey = 'sk-testSecretValue123456789';
    mockOpenAiError(401, JSON.stringify({
      error: {
        message: `Invalid API key ${apiKey}`,
        type: 'invalid_request_error',
        code: 'invalid_api_key',
      },
    }), null);

    try {
      await new OpenAiAdapter(apiKey).chat('tes');
      throw new Error('expected OpenAiProviderError');
    } catch (err) {
      expect(err).toBeInstanceOf(OpenAiProviderError);
      expect((err as Error).message).toContain('[REDACTED_OPENAI_KEY]');
      expect((err as Error).message).not.toContain(apiKey);
    }
  });
});

describe('AiModule factory (AI_PROVIDER env)', () => {
  const originalEnv = process.env;
  const compiledModules: TestingModule[] = [];

  async function compileAiTestingModule(): Promise<TestingModule> {
    const mod = await Test.createTestingModule({ imports: [AiModule] })
      .overrideProvider(PrismaService)
      .useValue(buildPrismaMock())
      .overrideProvider('NOTIFICATION_QUEUE')
      .useValue({ add: jest.fn(), close: jest.fn() })
      .overrideProvider('NOTIFICATION_WORKER')
      .useValue({ close: jest.fn() })
      .compile();
    compiledModules.push(mod);
    return mod;
  }

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(async () => {
    await Promise.all(compiledModules.splice(0).map((mod) => mod.close()));
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('AI_PROVIDER unset → OllamaAdapter (default)', async () => {
    delete process.env['AI_PROVIDER'];

    const mod = await compileAiTestingModule();

    const gateway = mod.get<AIGateway>('AI_GATEWAY');
    expect(gateway).toBeInstanceOf(OllamaAdapter);
  });

  it('AI_PROVIDER=ollama → OllamaAdapter', async () => {
    process.env['AI_PROVIDER'] = 'ollama';

    const mod = await compileAiTestingModule();

    const gateway = mod.get<AIGateway>('AI_GATEWAY');
    expect(gateway).toBeInstanceOf(OllamaAdapter);
  });

  it('AI_PROVIDER unset + OPENAI_API_KEY → OPENAI_GATEWAY OpenAiAdapter', async () => {
    delete process.env['AI_PROVIDER'];
    process.env['OPENAI_API_KEY'] = 'test-openai-key';

    const mod = await compileAiTestingModule();

    expect(mod.get<AIGateway | null>('OPENAI_GATEWAY')).toBeInstanceOf(OpenAiAdapter);
  });

  it('AI_PROVIDER=openai + OPENAI_API_KEY → OPENAI_GATEWAY OpenAiAdapter', async () => {
    process.env['AI_PROVIDER'] = 'openai';
    process.env['OPENAI_API_KEY'] = 'test-openai-key';

    const mod = await compileAiTestingModule();

    expect(mod.get<AIGateway | null>('OPENAI_GATEWAY')).toBeInstanceOf(OpenAiAdapter);
  });

  it('AI_PROVIDER=openai tanpa OPENAI_API_KEY → OPENAI_GATEWAY null', async () => {
    process.env['AI_PROVIDER'] = 'openai';
    delete process.env['OPENAI_API_KEY'];

    const mod = await compileAiTestingModule();

    expect(mod.get<AIGateway | null>('OPENAI_GATEWAY')).toBeNull();
  });

  it('AI_PROVIDER=openai dengan OPENAI_API_KEY whitespace → OPENAI_GATEWAY null', async () => {
    process.env['AI_PROVIDER'] = 'openai';
    process.env['OPENAI_API_KEY'] = '   ';

    const mod = await compileAiTestingModule();

    expect(mod.get<AIGateway | null>('OPENAI_GATEWAY')).toBeNull();
  });

  it('AI_PROVIDER=claude tanpa ANTHROPIC_API_KEY → CLAUDE_GATEWAY null, AI_GATEWAY tetap Ollama', async () => {
    process.env['AI_PROVIDER'] = 'claude';
    delete process.env['ANTHROPIC_API_KEY'];

    const mod = await compileAiTestingModule();

    // AI_GATEWAY tetap OllamaAdapter (embed + fallback chat)
    const gateway = mod.get<AIGateway>('AI_GATEWAY');
    expect(gateway).toBeInstanceOf(OllamaAdapter);
    // CLAUDE_GATEWAY null karena tanpa API key
    const claude = mod.get<AIGateway | null>('CLAUDE_GATEWAY');
    expect(claude).toBeNull();
  });
});

// =============================================================================
// AiService — backfillEmbeddings()
// =============================================================================

describe('AiService.backfillEmbeddings()', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  async function buildAiService(
    prismaMock: ReturnType<typeof buildPrismaMock>,
    gatewayMock: Partial<AIGateway>,
  ): Promise<AiService> {
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: 'AI_GATEWAY', useValue: gatewayMock },
        { provide: 'CLAUDE_GATEWAY', useValue: null }, // SMA-48: default off
        { provide: 'OPENAI_GATEWAY', useValue: null }, // R-28: default off
      ],
    }).compile();
    return mod.get(AiService);
  }

  it('chunk NULL → embed dipanggil + $executeRaw UPDATE dipanggil', async () => {
    const prisma = buildPrismaMock();
    prisma.$queryRaw.mockResolvedValue([
      { id: 'chunk-1', content: 'FAQ tentang PPDB' },
      { id: 'chunk-2', content: 'FAQ tentang SPP' },
    ]);
    prisma.$executeRaw.mockResolvedValue(1);

    const gateway: Partial<AIGateway> = {
      embed: jest.fn().mockResolvedValue(Array.from({ length: 768 }, () => 0.1)),
    };

    const service = await buildAiService(prisma, gateway);
    const results = await service.backfillEmbeddings();

    expect(gateway.embed).toHaveBeenCalledTimes(2);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it('query tidak ada chunk NULL → tidak embed, hasil kosong', async () => {
    const prisma = buildPrismaMock();
    prisma.$queryRaw.mockResolvedValue([]);

    const gateway: Partial<AIGateway> = {
      embed: jest.fn(),
    };

    const service = await buildAiService(prisma, gateway);
    const results = await service.backfillEmbeddings();

    expect(gateway.embed).not.toHaveBeenCalled();
    expect(results).toHaveLength(0);
  });

  it('embed gagal pada satu chunk → error dicatat, chunk lain tetap diproses', async () => {
    const prisma = buildPrismaMock();
    prisma.$queryRaw.mockResolvedValue([
      { id: 'chunk-ok', content: 'OK' },
      { id: 'chunk-fail', content: 'FAIL' },
    ]);
    prisma.$executeRaw.mockResolvedValue(1);

    let callCount = 0;
    const gateway: Partial<AIGateway> = {
      embed: jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 2) throw new Error('Ollama tidak tersedia');
        return Array.from({ length: 768 }, () => 0.5);
      }),
    };

    const service = await buildAiService(prisma, gateway);
    const results = await service.backfillEmbeddings();

    expect(results).toHaveLength(2);
    expect(results[0]?.success).toBe(true);
    expect(results[1]?.success).toBe(false);
    expect(results[1]?.error).toContain('Ollama tidak tersedia');
    // $executeRaw hanya dipanggil untuk chunk yang berhasil
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('backfillEmbeddings() tidak throw meskipun ada kegagalan', async () => {
    const prisma = buildPrismaMock();
    prisma.$queryRaw.mockResolvedValue([{ id: 'chunk-x', content: 'test' }]);

    const gateway: Partial<AIGateway> = {
      embed: jest.fn().mockRejectedValue(new Error('timeout')),
    };

    const service = await buildAiService(prisma, gateway);
    await expect(service.backfillEmbeddings()).resolves.not.toThrow();
  });
});
