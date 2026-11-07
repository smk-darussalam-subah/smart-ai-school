import {
  PublicAcademicCatalog, isPublicAcademicCatalog,
} from '../lib/public-academic-catalog';

const semester = new URL('http://api.local/api/v1/school/semesters/active');
function deferred<T>() { let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

describe('shared public active-period reads', () => {
  it('coalesces730 cold callers while returning separate payloads', async () => {
    const cache = new PublicAcademicCatalog(); const hold = deferred<unknown>();
    const load = jest.fn(() => hold.promise);
    const callers = Array.from({ length: 730 }, () => cache.read(semester, load));
    expect(load).toHaveBeenCalledTimes(1); hold.resolve({ number: 1, academicYear: { code: '2026/2027' } });
    const values = await Promise.all(callers) as Array<{ number: number }>;
    values[0]!.number = 9;
    expect(values[1]!.number).toBe(1);
    expect(await cache.read(semester, load)).toMatchObject({ number: 1 });
  });
  it('expires within5s and never caches null, errors or private endpoints', async () => {
    let now = 0; const cache = new PublicAcademicCatalog(() => now);
    const load = jest.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValue({ number: 1 });
    expect(await cache.read(semester, load)).toBeNull();
    await expect(cache.read(semester, load)).rejects.toThrow('unavailable');
    await cache.read(semester, load); now = 4999; await cache.read(semester, load);
    expect(load).toHaveBeenCalledTimes(3);
    now = 5000; await cache.read(semester, load); expect(load).toHaveBeenCalledTimes(4);
    const privateLoad = jest.fn().mockResolvedValue({ child: 'one' });
    const privateUrl = new URL('http://api.local/api/v1/student-dashboard/spp');
    await cache.read(privateUrl, privateLoad); await cache.read(privateUrl, privateLoad);
    expect(privateLoad).toHaveBeenCalledTimes(2);
  });
  it('does not let a delayed old response repopulate after period mutation', async () => {
    const cache = new PublicAcademicCatalog(); const old = deferred<unknown>();
    const before = cache.read(semester, () => old.promise);
    cache.invalidate(); const load = jest.fn().mockResolvedValue({ number: 2 });
    await cache.read(semester, load); old.resolve({ number: 1 }); await before;
    expect(await cache.read(semester, load)).toEqual({ number: 2 });
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('isolates origins and refuses scoped/query/credential URL variants', async () => {
    const cache = new PublicAcademicCatalog(); const load = jest.fn().mockResolvedValue({ number: 1 });
    await cache.read(semester, load);
    await cache.read(new URL('http://staging.local'+semester.pathname), load);
    expect(load).toHaveBeenCalledTimes(2);
    for (const suffix of ['?studentId=one', '/private', '?token=sensitive'])
      expect(isPublicAcademicCatalog(new URL(semester.toString()+suffix))).toBe(false);
    expect(isPublicAcademicCatalog(new URL('http://user:secret@api.local'+semester.pathname))).toBe(false);
  });
  it('bounds a hung producer and prevents its late result from replacing the recovered catalog', async () => {
    const cache = new PublicAcademicCatalog(Date.now, 5000, 15);
    const old = deferred<unknown>(); let signal: AbortSignal | undefined;
    const pending = cache.read(semester, (value) => { signal = value; return old.promise; });
    await expect(pending).rejects.toThrow('Active academic catalog unavailable');
    expect(signal?.aborted).toBe(true);
    const fresh = jest.fn().mockResolvedValue({ number: 2 });
    expect(await cache.read(semester, fresh)).toEqual({ number: 2 });
    old.resolve({ number: 1 }); await Promise.resolve();
    expect(await cache.read(semester, fresh)).toEqual({ number: 2 });
    expect(fresh).toHaveBeenCalledTimes(1);
  });
});
