/** Only the two deliberately public active-period endpoints may share results.
 * No tokens, permissions, pupil/parent data or authenticated catalogs enter here.
 * Each Web process keeps a bounded five-second cache; failures are never cached.
 */
const PUBLIC_PATHS = new Set([
  '/api/v1/school/academic-years/active',
  '/api/v1/school/semesters/active',
]);

export function isPublicAcademicCatalog(url: URL): boolean {
  return PUBLIC_PATHS.has(url.pathname) && !url.search && !url.username && !url.password &&
    (url.protocol === 'http:' || url.protocol === 'https:');
}

interface Entry {
  generation: number;
  expiresAt: number;
  value?: unknown;
  flight?: Promise<unknown | null>;
}

export class PublicAcademicCatalog {
  private readonly entries = new Map<string, Entry>();
  private generation = 0;

  constructor(
    private readonly now = Date.now,
    private readonly ttlMs = 5000,
    private readonly flightTimeoutMs = 8000,
  ) {}

  async read(url: URL, load: (signal?: AbortSignal) => Promise<unknown | null>): Promise<unknown | null> {
    if (!isPublicAcademicCatalog(url)) return load();
    const key = url.toString();
    const existing = this.entries.get(key);
    if (existing?.flight) return structuredClone(await existing.flight);
    if (existing && existing.expiresAt > this.now()) return structuredClone(existing.value);
    if (this.entries.size >= 8) this.entries.delete(this.entries.keys().next().value!);
    const entry: Entry = { generation: this.generation, expiresAt: 0 };
    this.entries.set(key, entry);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('Active academic catalog unavailable'));
      }, this.flightTimeoutMs);
    });
    entry.flight = (async () => {
      try {
        const value = await Promise.race([load(controller.signal), deadline]);
        if (entry.generation === this.generation && this.entries.get(key) === entry) {
          if (value === null || value === undefined) this.entries.delete(key);
          else {
            entry.value = structuredClone(value);
            entry.expiresAt = this.now() + this.ttlMs;
          }
        }
        return value;
      } catch (error) {
        if (this.entries.get(key) === entry) this.entries.delete(key);
        throw error;
      } finally { if (timer) clearTimeout(timer); entry.flight = undefined; }
    })();
    return structuredClone(await entry.flight);
  }

  invalidate(): void {
    this.generation++;
    this.entries.clear();
  }
}

export const publicAcademicCatalog = new PublicAcademicCatalog();

/** Invalidate this process on confirmed period mutation, including no-content success.
 * Another process/external writer becomes visible after the current fetch (at
 * most8s) and its5s TTL. Backend checks remain authoritative for mutations.
 */
export function invalidatePublicAcademicCatalog(path: string, method: string): void {
  if (!['GET', 'HEAD'].includes(method.toUpperCase()) &&
      /^\/school\/(academic-years|semesters)(\/|\?|$)/.test(path))
    publicAcademicCatalog.invalidate();
}
