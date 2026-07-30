import {
  createAiSingleFlightGuard,
  deriveAiButtonState,
  mapAiErrorToTeacherCopy,
  parseAiSectionOutput,
  runContainedAiSectionFlow,
} from '../app/dashboard/akademik/_components/modul-ajar-ai-containment';

describe('Modul Ajar AI containment helpers', () => {
  it('labels unsaved and dirty drafts as save-before-generate', () => {
    expect(deriveAiButtonState({
      section: 'kegiatan',
      savedVersion: 'dirty',
      rppId: null,
      body: {},
      isGenerating: false,
    }).label).toBe('Simpan & bantu isi bagian ini');

    expect(deriveAiButtonState({
      section: 'kegiatan',
      savedVersion: 'saved',
      rppId: 'rpp-1',
      body: {},
      isGenerating: false,
    }).label).toBe('Bantu isi bagian ini');
  });

  it('unsaved draft flow saves first, then generates once with returned rppId', async () => {
    const calls: string[] = [];
    const guard = createAiSingleFlightGuard();
    const ensureSaved = jest.fn(async () => {
      calls.push('save');
      return 'rpp-created';
    });
    const generate = jest.fn(async (request: { rppId: string }) => {
      calls.push(`generate:${request.rppId}`);
      return { success: true, data: { output: 'Kegiatan inti hasil AI.' } };
    });

    const result = await runContainedAiSectionFlow({
      section: 'kegiatan',
      body: {},
      guard,
      ensureSaved,
      generate,
    });

    expect(result).toMatchObject({ status: 'applied', rppId: 'rpp-created' });
    expect(calls).toEqual(['save', 'generate:rpp-created']);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('dirty saved draft flow updates before generation', async () => {
    const calls: string[] = [];
    const result = await runContainedAiSectionFlow({
      section: 'profil',
      body: { profilUraian: 'lama' },
      guard: createAiSingleFlightGuard(),
      ensureSaved: async () => {
        calls.push('update');
        return 'rpp-existing';
      },
      generate: async (request) => {
        calls.push(`generate:${request.rppId}`);
        return { success: true, data: { output: 'Profil baru.' } };
      },
    });

    expect(result).toMatchObject({ status: 'applied', rppId: 'rpp-existing' });
    expect(calls).toEqual(['update', 'generate:rpp-existing']);
  });

  it('save success plus AI failure keeps the saved rppId in result', async () => {
    const result = await runContainedAiSectionFlow({
      section: 'kegiatan',
      body: {},
      guard: createAiSingleFlightGuard(),
      ensureSaved: async () => 'rpp-saved',
      generate: async () => ({ success: false, errorCode: 'AI_PROVIDER_TIMEOUT' }),
    });

    expect(result).toEqual({
      status: 'failed',
      codeOrMessage: 'AI_PROVIDER_TIMEOUT',
      rppId: 'rpp-saved',
    });
    expect(mapAiErrorToTeacherCopy('AI_PROVIDER_TIMEOUT')).toContain('Draf Anda tetap tersimpan');
  });

  it('save rejection releases the single-flight guard for the next attempt', async () => {
    const guard = createAiSingleFlightGuard();
    const result = await runContainedAiSectionFlow({
      section: 'kegiatan',
      body: {},
      guard,
      ensureSaved: async () => { throw new Error('Gagal menyimpan draft.'); },
      generate: jest.fn(),
    });

    expect(result).toEqual({
      status: 'failed',
      codeOrMessage: 'Gagal menyimpan draft.',
      rppId: undefined,
    });
    expect(guard.isActive()).toBe(false);
  });

  it('double click is deduplicated by single-flight guard', async () => {
    const guard = createAiSingleFlightGuard();
    let resolveSave!: (value: string) => void;
    const ensureSaved = jest.fn(() => new Promise<string>((resolve) => {
      resolveSave = resolve;
    }));
    const generate = jest.fn(async () => ({ success: true, data: { output: 'Kegiatan.' } }));

    const first = runContainedAiSectionFlow({ section: 'kegiatan', body: {}, guard, ensureSaved, generate });
    const second = await runContainedAiSectionFlow({ section: 'kegiatan', body: {}, guard, ensureSaved, generate });
    resolveSave('rpp-once');
    const firstResult = await first;

    expect(second).toEqual({ status: 'duplicate' });
    expect(firstResult).toMatchObject({ status: 'applied' });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('missing TP for ATP returns foundation state with zero provider call', async () => {
    const ensureSaved = jest.fn();
    const generate = jest.fn();

    const result = await runContainedAiSectionFlow({
      section: 'atp',
      body: { cp: 'CP ada', tp: [] },
      guard: createAiSingleFlightGuard(),
      ensureSaved,
      generate,
    });

    expect(result).toEqual({ status: 'missing_foundation', code: 'AI_FOUNDATION_INCOMPLETE' });
    expect(ensureSaved).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it('invalid output does not produce a patch', () => {
    expect(parseAiSectionOutput('atp', 'bukan json', { tp: ['TP 1'] }))
      .toEqual({ ok: false, code: 'AI_OUTPUT_INVALID' });
  });
});
