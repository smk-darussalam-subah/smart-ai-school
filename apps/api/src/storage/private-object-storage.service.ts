import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import {
  CLASS_ACTIVITY_MEDIA_MAX_BYTES,
  ClassActivityMediaType,
  contentTypeForClassActivityMediaKey,
  parseClassActivityMediaKey,
} from '../class-activities/class-activity-media';

type StorageMethod = 'DELETE' | 'GET' | 'PUT';

export interface PrivateObjectStorageConfig {
  endpoint: URL;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
}

export interface PrivateObject {
  bytes: Buffer;
  contentType: ClassActivityMediaType;
}

const STORAGE_TIMEOUT_MS = 10_000;
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function requiredTrimmed(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function loadPrivateObjectStorageConfig(
  env: NodeJS.ProcessEnv = process.env,
): PrivateObjectStorageConfig | null {
  const endpointValue = requiredTrimmed(
    env.CLASS_ACTIVITY_MEDIA_ENDPOINT ?? env.MINIO_ENDPOINT,
  );
  const accessKey = requiredTrimmed(env.CLASS_ACTIVITY_MEDIA_ACCESS_KEY);
  const secretKey = requiredTrimmed(env.CLASS_ACTIVITY_MEDIA_SECRET_KEY);
  const bucket = requiredTrimmed(env.CLASS_ACTIVITY_MEDIA_BUCKET);
  const region = requiredTrimmed(env.CLASS_ACTIVITY_MEDIA_REGION) ?? 'us-east-1';

  if (!endpointValue || !accessKey || !secretKey || !bucket) return null;
  if (!BUCKET_PATTERN.test(bucket) || bucket.includes('..')) return null;
  if (!/^[a-z0-9-]{1,32}$/.test(region)) return null;

  let endpoint: URL;
  try {
    endpoint = new URL(endpointValue);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(endpoint.protocol)
    || endpoint.username
    || endpoint.password
    || endpoint.search
    || endpoint.hash
    || (endpoint.pathname !== '/' && endpoint.pathname !== '')) {
    return null;
  }
  endpoint.pathname = '/';

  return { endpoint, accessKey, secretKey, bucket, region };
}

@Injectable()
export class PrivateObjectStorageService {
  private readonly config: PrivateObjectStorageConfig | null;

  constructor() {
    this.config = loadPrivateObjectStorageConfig();
  }

  private requireConfig(): PrivateObjectStorageConfig {
    if (!this.config) {
      throw new ServiceUnavailableException('Penyimpanan media privat belum dikonfigurasi');
    }
    return this.config;
  }

  private objectPath(config: PrivateObjectStorageConfig, key?: string): string {
    if (key && !parseClassActivityMediaKey(key)) {
      throw new BadRequestException('Kunci media privat tidak valid');
    }
    const segments = key ? [config.bucket, ...key.split('/')] : [config.bucket];
    return `/${segments.map(encodePathSegment).join('/')}`;
  }

  private async request(
    method: StorageMethod,
    key?: string,
    body?: Buffer,
    contentType?: ClassActivityMediaType,
  ): Promise<Response> {
    const config = this.requireConfig();
    const canonicalUri = this.objectPath(config, key);
    const url = new URL(canonicalUri, config.endpoint);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256(body ?? '');
    const canonicalHeaders = [
      `host:${url.host}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${amzDate}`,
      '',
    ].join('\n');
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [
      method,
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256(canonicalRequest),
    ].join('\n');
    const dateKey = hmac(`AWS4${config.secretKey}`, dateStamp);
    const regionKey = hmac(dateKey, config.region);
    const serviceKey = hmac(regionKey, 's3');
    const signingKey = hmac(serviceKey, 'aws4_request');
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    try {
      return await fetch(url, {
        method,
        headers: {
          Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
          ...(contentType ? { 'Content-Type': contentType } : {}),
          'X-Amz-Content-Sha256': payloadHash,
          'X-Amz-Date': amzDate,
        },
        ...(body ? { body: new Uint8Array(body) } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException('Penyimpanan media privat tidak dapat dihubungi');
    }
  }

  async putObject(key: string, bytes: Buffer, contentType: ClassActivityMediaType): Promise<void> {
    if (!parseClassActivityMediaKey(key)) {
      throw new BadRequestException('Kunci media privat tidak valid');
    }
    if (bytes.length === 0 || bytes.length > CLASS_ACTIVITY_MEDIA_MAX_BYTES) {
      throw new BadRequestException('Ukuran media privat tidak valid');
    }
    if (contentTypeForClassActivityMediaKey(key) !== contentType) {
      throw new BadRequestException('Ekstensi dan tipe media tidak cocok');
    }
    const response = await this.request('PUT', key, bytes, contentType);
    if (!response.ok) {
      throw new ServiceUnavailableException('Media privat gagal disimpan');
    }
  }

  async getObject(key: string): Promise<PrivateObject> {
    const expectedType = contentTypeForClassActivityMediaKey(key);
    const response = await this.request('GET', key);
    if (response.status === 404) throw new NotFoundException('Media kegiatan tidak ditemukan');
    if (!response.ok) {
      throw new ServiceUnavailableException('Media privat gagal dibaca');
    }

    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(contentLength) && contentLength > CLASS_ACTIVITY_MEDIA_MAX_BYTES) {
      throw new ServiceUnavailableException('Media privat melebihi batas ukuran');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > CLASS_ACTIVITY_MEDIA_MAX_BYTES) {
      throw new ServiceUnavailableException('Ukuran media privat tidak valid');
    }
    const storedType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (storedType && storedType !== expectedType) {
      throw new ServiceUnavailableException('Metadata tipe media privat tidak valid');
    }
    return { bytes, contentType: expectedType };
  }

  async deleteObject(key: string): Promise<void> {
    if (!parseClassActivityMediaKey(key)) {
      throw new BadRequestException('Kunci media privat tidak valid');
    }
    const response = await this.request('DELETE', key);
    if (!response.ok && response.status !== 404) {
      throw new ServiceUnavailableException('Media privat gagal dihapus');
    }
  }
}
