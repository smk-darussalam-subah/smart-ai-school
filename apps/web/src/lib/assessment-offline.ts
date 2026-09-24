export const DIIS_ASSESSMENT_DATABASE_NAME = 'diis-assessment-outbox-v1';
const DATABASE_VERSION = 1;
const KEY_STORE = 'keys';
const RECORD_STORE = 'records';
const KEY_ID = 'assessment-aes-gcm-v1';
let encryptionKeyPromise: Promise<CryptoKey> | null = null;

export type AssessmentAnswerMap = Record<string, unknown>;

export interface AssessmentDraftPayload {
  responseId: string;
  sessionId: string;
  revision: number;
  mutationId: string;
  answers: AssessmentAnswerMap;
  pendingSubmit: boolean;
  submitRequestedAt: string | null;
  updatedAt: string;
}

export interface AssessmentSignalPayload {
  eventId: string;
  responseId: string;
  sessionId: string;
  type: AssessmentRuntimeSignalType;
  occurredAt: string;
}

export type AssessmentRuntimeSignalType =
  | 'heartbeat'
  | 'fullscreen_exit'
  | 'visibility_hidden'
  | 'window_blur'
  | 'pagehide'
  | 'exit_attempt'
  | 'offline'
  | 'online';

interface EncryptedRecord {
  id: string;
  responseId: string;
  revision: number;
  kind: 'draft' | 'signal';
  mutationId?: string;
  pendingSubmit?: boolean;
  submitRequestedAt?: string | null;
  iv: string;
  ciphertext: string;
}

export type LocalSaveResult = 'saved' | 'stale' | 'unavailable';
export const ASSESSMENT_SIGNAL_SUBMIT_LIMIT = 100;

export type AssessmentSubmitPrerequisiteFailureReason = 'queue-read' | 'signal-sync';

export interface AssessmentSubmitPrerequisiteFailure {
  pendingSubmit: boolean;
  retryable: boolean;
  saveState: 'queued' | 'failed';
  warning: string;
  toast: string;
}

export function assessmentSubmitPrerequisiteFailure(
  localSave: LocalSaveResult,
  reason: AssessmentSubmitPrerequisiteFailureReason,
): AssessmentSubmitPrerequisiteFailure {
  if (localSave === 'saved') {
    return {
      pendingSubmit: true,
      retryable: true,
      saveState: 'queued',
      warning:
        reason === 'queue-read'
          ? 'Bukti pengawasan ujian di perangkat tidak dapat dibaca. Jawaban tetap tersimpan aman dan belum dikirim.'
          : 'Sebagian bukti pengawasan belum dapat dikonfirmasi server. Jawaban tetap tersimpan aman dan akan dicoba lagi.',
      toast:
        reason === 'queue-read'
          ? 'Pengiriman ditunda karena bukti pengawasan belum dapat dibaca.'
          : 'Pengiriman ditunda sampai bukti pengawasan berhasil disinkronkan.',
    };
  }

  return {
    pendingSubmit: false,
    retryable: false,
    saveState: 'failed',
    warning:
      reason === 'queue-read'
        ? 'Bukti pengawasan dan salinan tahan-tutup tidak dapat dibaca atau dibuat. Jawaban hanya ada di layar; jangan tutup aplikasi dan tekan Kirim jawaban untuk mencoba lagi.'
        : 'Sinkronisasi bukti pengawasan gagal dan salinan tahan-tutup tidak tersedia. Jawaban hanya ada di layar; jangan tutup aplikasi dan tekan Kirim jawaban untuk mencoba lagi.',
    toast:
      'Jawaban belum aman disimpan atau dikirim. Jangan tutup aplikasi; coba Kirim jawaban lagi.',
  };
}

export type AssessmentSignalQueueReadResult =
  | { status: 'ok'; signals: AssessmentSignalPayload[] }
  | { status: 'unavailable'; signals: [] };

export async function resolveAssessmentSignalQueue<T>(
  load: () => Promise<T[]>,
  decode: (record: T) => Promise<AssessmentSignalPayload>,
): Promise<AssessmentSignalQueueReadResult> {
  try {
    const records = await load();
    return { status: 'ok', signals: await Promise.all(records.map(decode)) };
  } catch {
    return { status: 'unavailable', signals: [] };
  }
}

export async function prepareAssessmentSignalsForSubmit(
  signals: AssessmentSignalPayload[],
  deliver: (signal: AssessmentSignalPayload) => Promise<boolean>,
  remove: (eventId: string) => Promise<boolean>,
  limit = ASSESSMENT_SIGNAL_SUBMIT_LIMIT,
): Promise<{ status: 'ok'; signals: AssessmentSignalPayload[] } | { status: 'unavailable' }> {
  const ordered = [...signals].sort(
    (left, right) =>
      left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId),
  );
  const overflowCount = Math.max(0, ordered.length - limit);
  for (const signal of ordered.slice(0, overflowCount)) {
    if (!(await deliver(signal))) return { status: 'unavailable' };
    if (!(await remove(signal.eventId))) return { status: 'unavailable' };
  }
  return { status: 'ok', signals: ordered.slice(overflowCount) };
}

export function assessmentSubmitRetryDelay(attempt: number): number {
  return Math.min(1_000 * 2 ** Math.min(Math.max(0, attempt - 1), 5), 30_000);
}

export function scheduleAssessmentSubmitRetry(
  attempt: number,
  callback: () => void,
  schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout> = setTimeout,
): ReturnType<typeof setTimeout> {
  return schedule(callback, assessmentSubmitRetryDelay(attempt));
}

export function createAssessmentClientId(runtimeCrypto: Crypto = crypto): string {
  const withRandomUuid = runtimeCrypto as Crypto & { randomUUID?: () => string };
  if (typeof withRandomUuid.randomUUID === 'function') return withRandomUuid.randomUUID();
  const bytes = runtimeCrypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function shouldAcceptAssessmentDraftWrite(
  current: Pick<EncryptedRecord, 'revision' | 'mutationId' | 'pendingSubmit'> | null,
  incoming: Pick<AssessmentDraftPayload, 'revision' | 'mutationId' | 'pendingSubmit'>,
): boolean {
  if (!current) return true;
  if (current.pendingSubmit) {
    return (
      incoming.pendingSubmit &&
      incoming.revision === current.revision &&
      incoming.mutationId === current.mutationId
    );
  }
  if (incoming.revision > current.revision) return true;
  if (incoming.revision < current.revision) return false;
  return incoming.mutationId === current.mutationId;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function browserCrypto(): Crypto | null {
  return typeof crypto !== 'undefined' && crypto.subtle ? crypto : null;
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB unavailable'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DIIS_ASSESSMENT_DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(KEY_STORE)) database.createObjectStore(KEY_STORE);
      if (!database.objectStoreNames.contains(RECORD_STORE)) {
        const store = database.createObjectStore(RECORD_STORE, { keyPath: 'id' });
        store.createIndex('responseId', 'responseId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

async function readStoredKey(database: IDBDatabase): Promise<CryptoKey | null> {
  const transaction = database.transaction(KEY_STORE, 'readonly');
  return (
    ((await requestResult(transaction.objectStore(KEY_STORE).get(KEY_ID))) as
      | CryptoKey
      | undefined) ?? null
  );
}

function addKeyIfAbsent(database: IDBDatabase, key: CryptoKey): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(KEY_STORE, 'readwrite');
    const request = transaction.objectStore(KEY_STORE).add(key, KEY_ID);
    let added = true;
    request.onerror = (event) => {
      if (request.error?.name === 'ConstraintError') {
        event.preventDefault();
        event.stopPropagation();
        added = false;
        return;
      }
      reject(request.error ?? new Error('Encryption key write failed'));
    };
    transaction.oncomplete = () => resolve(added);
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Encryption key transaction failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Encryption key transaction aborted'));
  });
}

async function resolveEncryptionKey(database: IDBDatabase): Promise<CryptoKey> {
  const runtimeCrypto = browserCrypto();
  if (!runtimeCrypto) throw new Error('WebCrypto unavailable');
  const existing = await readStoredKey(database);
  if (existing) return existing;

  const created = await runtimeCrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  if (await addKeyIfAbsent(database, created)) return created;
  const winner = await readStoredKey(database);
  if (!winner) throw new Error('Encryption key race could not be reconciled');
  return winner;
}

async function getEncryptionKey(database: IDBDatabase): Promise<CryptoKey> {
  if (encryptionKeyPromise) return encryptionKeyPromise;
  const pending = resolveEncryptionKey(database);
  encryptionKeyPromise = pending;
  try {
    return await pending;
  } finally {
    if (encryptionKeyPromise === pending) encryptionKeyPromise = null;
  }
}

async function encryptPayload(
  database: IDBDatabase,
  id: string,
  responseId: string,
  revision: number,
  kind: EncryptedRecord['kind'],
  payload: unknown,
  draftMetadata?: Pick<
    AssessmentDraftPayload,
    'mutationId' | 'pendingSubmit' | 'submitRequestedAt'
  >,
): Promise<EncryptedRecord> {
  const runtimeCrypto = browserCrypto();
  if (!runtimeCrypto) throw new Error('WebCrypto unavailable');
  const key = await getEncryptionKey(database);
  const iv = runtimeCrypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await runtimeCrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    id,
    responseId,
    revision,
    kind,
    ...(draftMetadata ?? {}),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptPayload<T>(database: IDBDatabase, record: EncryptedRecord): Promise<T> {
  const runtimeCrypto = browserCrypto();
  if (!runtimeCrypto) throw new Error('WebCrypto unavailable');
  const key = await getEncryptionKey(database);
  const plaintext = await runtimeCrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(record.iv) },
    key,
    base64ToBytes(record.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export async function saveAssessmentDraft(
  payload: AssessmentDraftPayload,
): Promise<LocalSaveResult> {
  if (!Number.isInteger(payload.revision) || payload.revision < 0) return 'unavailable';
  let database: IDBDatabase | null = null;
  try {
    database = await openDatabase();
    const id = `draft:${payload.responseId}`;
    const encrypted = await encryptPayload(
      database,
      id,
      payload.responseId,
      payload.revision,
      'draft',
      payload,
      {
        mutationId: payload.mutationId,
        pendingSubmit: payload.pendingSubmit,
        submitRequestedAt: payload.submitRequestedAt,
      },
    );
    const transaction = database.transaction(RECORD_STORE, 'readwrite');
    const completed = transactionDone(transaction);
    const store = transaction.objectStore(RECORD_STORE);
    const current = (await requestResult(store.get(id))) as EncryptedRecord | undefined;
    if (!shouldAcceptAssessmentDraftWrite(current ?? null, payload)) {
      await completed;
      return 'stale';
    }
    store.put(encrypted);
    await completed;
    return 'saved';
  } catch {
    return 'unavailable';
  } finally {
    database?.close();
  }
}

export async function loadAssessmentDraft(
  responseId: string,
): Promise<AssessmentDraftPayload | null> {
  let database: IDBDatabase | null = null;
  try {
    database = await openDatabase();
    const transaction = database.transaction(RECORD_STORE, 'readonly');
    const record = (await requestResult(
      transaction.objectStore(RECORD_STORE).get(`draft:${responseId}`),
    )) as EncryptedRecord | undefined;
    return record ? await decryptPayload<AssessmentDraftPayload>(database, record) : null;
  } catch {
    return null;
  } finally {
    database?.close();
  }
}

export async function deleteAssessmentDraft(responseId: string): Promise<boolean> {
  let database: IDBDatabase | null = null;
  try {
    database = await openDatabase();
    const transaction = database.transaction(RECORD_STORE, 'readwrite');
    const completed = transactionDone(transaction);
    transaction.objectStore(RECORD_STORE).delete(`draft:${responseId}`);
    await completed;
    return true;
  } catch {
    return false;
  } finally {
    database?.close();
  }
}

export async function queueAssessmentSignal(payload: AssessmentSignalPayload): Promise<boolean> {
  let database: IDBDatabase | null = null;
  try {
    database = await openDatabase();
    const id = `signal:${payload.eventId}`;
    const encrypted = await encryptPayload(database, id, payload.responseId, 0, 'signal', payload);
    const transaction = database.transaction(RECORD_STORE, 'readwrite');
    const completed = transactionDone(transaction);
    transaction.objectStore(RECORD_STORE).put(encrypted);
    await completed;
    return true;
  } catch {
    return false;
  } finally {
    database?.close();
  }
}

export async function listAssessmentSignals(
  responseId: string,
): Promise<AssessmentSignalQueueReadResult> {
  let database: IDBDatabase | null = null;
  try {
    database = await openDatabase();
    const transaction = database.transaction(RECORD_STORE, 'readonly');
    return resolveAssessmentSignalQueue(
      async () => {
        const records = (await requestResult(
          transaction.objectStore(RECORD_STORE).index('responseId').getAll(responseId),
        )) as EncryptedRecord[];
        return records.filter((record) => record.kind === 'signal');
      },
      (record) => decryptPayload<AssessmentSignalPayload>(database!, record),
    );
  } catch {
    return { status: 'unavailable', signals: [] };
  } finally {
    database?.close();
  }
}

export async function deleteAssessmentSignal(eventId: string): Promise<boolean> {
  let database: IDBDatabase | null = null;
  try {
    database = await openDatabase();
    const transaction = database.transaction(RECORD_STORE, 'readwrite');
    const completed = transactionDone(transaction);
    transaction.objectStore(RECORD_STORE).delete(`signal:${eventId}`);
    await completed;
    return true;
  } catch {
    return false;
  } finally {
    database?.close();
  }
}

export function selectNewestAssessmentDraft(
  server: { answers: AssessmentAnswerMap; revision: number; mutationId: string | null },
  local: AssessmentDraftPayload | null,
): {
  answers: AssessmentAnswerMap;
  revision: number;
  mutationId: string | null;
  pendingSubmit: boolean;
  submitRequestedAt: string | null;
  source: 'server' | 'device';
} {
  if (
    local &&
    (local.revision > server.revision ||
      (local.revision === server.revision && local.pendingSubmit))
  ) {
    return {
      answers: local.answers,
      revision: local.revision,
      mutationId: local.mutationId,
      pendingSubmit: local.pendingSubmit,
      submitRequestedAt: local.submitRequestedAt,
      source: 'device',
    };
  }
  return {
    answers: server.answers,
    revision: server.revision,
    mutationId: server.mutationId,
    pendingSubmit: false,
    submitRequestedAt: null,
    source: 'server',
  };
}
