import {
  BadRequestException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  CLASS_ACTIVITY_MEDIA_MAX_BYTES,
  contentTypeForClassActivityMediaKey,
  parseClassActivityMediaKey,
  validateClassActivityMedia,
} from '../class-activities/class-activity-media';
import {
  loadPrivateObjectStorageConfig,
  PrivateObjectStorageService,
} from '../storage/private-object-storage.service';
import { CreateActivitySchema, UpdateActivitySchema } from '../class-activities/dto/class-activity.dto';

const VALID_KEY = 'class-activities/v1/123e4567-e89b-42d3-a456-426614174000.jpg';

describe('Class Activity private media contract', () => {
  it.each([
    ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])],
    ['image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['image/webp', Buffer.from('RIFF0000WEBP', 'ascii')],
  ])('menerima %s dengan signature yang sesuai', (contentType, bytes) => {
    expect(validateClassActivityMedia(bytes, contentType)).toEqual({ bytes, contentType });
  });

  it('menolak MIME yang tidak diizinkan dan MIME palsu', () => {
    expect(() => validateClassActivityMedia(Buffer.from('<svg/>'), 'image/svg+xml'))
      .toThrow(UnsupportedMediaTypeException);
    expect(() => validateClassActivityMedia(Buffer.from('not-a-jpeg'), 'image/jpeg'))
      .toThrow(UnsupportedMediaTypeException);
  });

  it('menolak payload kosong dan lebih dari 5 MiB', () => {
    expect(() => validateClassActivityMedia(Buffer.alloc(0), 'image/png'))
      .toThrow(BadRequestException);
    expect(() => validateClassActivityMedia(
      Buffer.alloc(CLASS_ACTIVITY_MEDIA_MAX_BYTES + 1),
      'image/png',
    )).toThrow(PayloadTooLargeException);
  });

  it('DTO create/update menolak photoUrl baru, termasuk URL eksternal', () => {
    const base = {
      classId: '123e4567-e89b-42d3-a456-426614174000',
      date: '2026-08-12',
      title: 'Praktikum jaringan',
      category: 'praktikum',
    };
    expect(CreateActivitySchema.safeParse({
      ...base,
      photoUrl: 'https://example.com/student.jpg',
    }).success).toBe(false);
    expect(UpdateActivitySchema.safeParse({ photoUrl: null }).success).toBe(false);
  });

  it.each([
    '../../etc/passwd',
    'class-activities/v1/../../secret.jpg',
    'class-activities/v1/%2e%2e%2fsecret.jpg',
    'https://example.com/image.jpg',
    'http://169.254.169.254/latest/meta-data',
    'class-activities/v1/not-a-uuid.jpg',
  ])('menolak referensi traversal/SSRF: %s', (value) => {
    expect(parseClassActivityMediaKey(value)).toBeNull();
  });

  it('hanya memetakan tipe dari object key yang tervalidasi', () => {
    expect(contentTypeForClassActivityMediaKey(VALID_KEY)).toBe('image/jpeg');
    expect(() => contentTypeForClassActivityMediaKey('../private.jpg'))
      .toThrow(BadRequestException);
  });

  it('konfigurasi menolak endpoint ber-userinfo/path/query dan bucket traversal', () => {
    const base = {
      CLASS_ACTIVITY_MEDIA_ACCESS_KEY: 'access',
      CLASS_ACTIVITY_MEDIA_SECRET_KEY: 'secret',
      CLASS_ACTIVITY_MEDIA_BUCKET: 'diis-class-activities',
    } as NodeJS.ProcessEnv;
    expect(loadPrivateObjectStorageConfig({
      ...base,
      CLASS_ACTIVITY_MEDIA_ENDPOINT: 'http://user:pass@minio:9000/',
    })).toBeNull();
    expect(loadPrivateObjectStorageConfig({
      ...base,
      CLASS_ACTIVITY_MEDIA_ENDPOINT: 'http://minio:9000/internal?target=other',
    })).toBeNull();
    expect(loadPrivateObjectStorageConfig({
      ...base,
      CLASS_ACTIVITY_MEDIA_ENDPOINT: 'http://minio:9000',
      CLASS_ACTIVITY_MEDIA_BUCKET: 'diis..private',
    })).toBeNull();
  });

  it('storage gagal tertutup ketika environment belum lengkap', async () => {
    const originalEnv = process.env;
    process.env = { NODE_ENV: 'test' };
    try {
      const storage = new PrivateObjectStorageService();
      await expect(storage.putObject(
        VALID_KEY,
        Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        'image/jpeg',
      )).rejects.toThrow(ServiceUnavailableException);
    } finally {
      process.env = originalEnv;
    }
  });

  it('signed request hanya menuju endpoint storage terkonfigurasi', async () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      CLASS_ACTIVITY_MEDIA_ENDPOINT: 'http://minio:9000',
      CLASS_ACTIVITY_MEDIA_ACCESS_KEY: 'access',
      CLASS_ACTIVITY_MEDIA_SECRET_KEY: 'secret',
      CLASS_ACTIVITY_MEDIA_BUCKET: 'diis-class-activities',
    };
    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    try {
      const storage = new PrivateObjectStorageService();
      await storage.putObject(
        VALID_KEY,
        Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        'image/jpeg',
      );

      const requestedUrls = fetchSpy.mock.calls.map(([input]) => new URL(String(input)));
      expect(requestedUrls).toHaveLength(1);
      expect(requestedUrls.every((url) => url.origin === 'http://minio:9000')).toBe(true);
      expect(requestedUrls[0]!.pathname).toBe(`/diis-class-activities/${VALID_KEY}`);
      expect(fetchSpy.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ redirect: 'error' }));
    } finally {
      fetchSpy.mockRestore();
      process.env = originalEnv;
    }
  });
});
