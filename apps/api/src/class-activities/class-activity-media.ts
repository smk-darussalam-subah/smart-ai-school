import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export const CLASS_ACTIVITY_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const CLASS_ACTIVITY_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type ClassActivityMediaType = (typeof CLASS_ACTIVITY_MEDIA_TYPES)[number];

const PRIVATE_MEDIA_KEY_PATTERN =
  /^class-activities\/v1\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;

const EXTENSION_BY_TYPE: Record<ClassActivityMediaType, 'jpg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const TYPE_BY_EXTENSION: Record<'jpg' | 'png' | 'webp', ClassActivityMediaType> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function hasJpegSignature(bytes: Buffer): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function hasPngSignature(bytes: Buffer): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return bytes.length >= signature.length
    && signature.every((value, index) => bytes[index] === value);
}

function hasWebpSignature(bytes: Buffer): boolean {
  return bytes.length >= 12
    && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
    && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
}

export function validateClassActivityMedia(
  body: unknown,
  rawContentType: string | undefined,
): { bytes: Buffer; contentType: ClassActivityMediaType } {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new BadRequestException('Berkas media wajib diisi');
  }
  if (body.length > CLASS_ACTIVITY_MEDIA_MAX_BYTES) {
    throw new PayloadTooLargeException('Ukuran media maksimal 5 MiB');
  }

  const contentType = rawContentType?.split(';', 1)[0]?.trim().toLowerCase();
  if (!CLASS_ACTIVITY_MEDIA_TYPES.includes(contentType as ClassActivityMediaType)) {
    throw new UnsupportedMediaTypeException('Media harus berupa JPEG, PNG, atau WebP');
  }

  const signatureMatches = contentType === 'image/jpeg'
    ? hasJpegSignature(body)
    : contentType === 'image/png'
      ? hasPngSignature(body)
      : hasWebpSignature(body);
  if (!signatureMatches) {
    throw new UnsupportedMediaTypeException('Isi berkas tidak sesuai dengan tipe media');
  }

  return { bytes: body, contentType: contentType as ClassActivityMediaType };
}

export function createClassActivityMediaKey(contentType: ClassActivityMediaType): string {
  return `class-activities/v1/${randomUUID()}.${EXTENSION_BY_TYPE[contentType]}`;
}

export function parseClassActivityMediaKey(value: string | null | undefined): string | null {
  if (!value || !PRIVATE_MEDIA_KEY_PATTERN.test(value)) return null;
  return value;
}

export function contentTypeForClassActivityMediaKey(key: string): ClassActivityMediaType {
  const validKey = parseClassActivityMediaKey(key);
  if (!validKey) throw new BadRequestException('Referensi media privat tidak valid');
  const extension = validKey.slice(validKey.lastIndexOf('.') + 1) as 'jpg' | 'png' | 'webp';
  return TYPE_BY_EXTENSION[extension];
}
