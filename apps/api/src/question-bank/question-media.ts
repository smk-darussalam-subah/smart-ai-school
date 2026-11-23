import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { validateClassActivityMedia } from '../class-activities/class-activity-media';

const MAX_IMAGE_BYTES = 480 * 1024;
const MAX_IMAGE_DIMENSION = 2560;

function jpegDimensions(bytes: Buffer): [number, number] | null {
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === undefined || offset + 2 > bytes.length || marker === 0xda || marker === 0xd9)
      return null;
    const size = bytes.readUInt16BE(offset);
    if (size < 2 || offset + size > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2].includes(marker) && size >= 8)
      return [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
    offset += size;
  }
  return null;
}

function webpDimensions(bytes: Buffer): [number, number] | null {
  if (bytes.length < 26 || bytes.readUInt32LE(4) + 8 !== bytes.length) return null;
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X' && bytes.length >= 30 && (bytes[20]! & 2) === 0)
    return [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1];
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    const size = bytes.readUInt32LE(21);
    return [(size & 0x3fff) + 1, ((size >>> 14) & 0x3fff) + 1];
  }
  if (chunk === 'VP8 ' && bytes.length >= 30 && bytes.readUIntBE(23, 3) === 0x9d012a)
    return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  return null;
}

export function validateQuestionMedia(raw: unknown, mime: string | undefined) {
  const { bytes, contentType } = validateClassActivityMedia(raw, mime);
  if (bytes.length > MAX_IMAGE_BYTES)
    throw new PayloadTooLargeException('Ukuran gambar soal maksimal 480 KB.');
  const dimensions = contentType === 'image/jpeg' ? jpegDimensions(bytes) :
    contentType === 'image/webp' ? webpDimensions(bytes) :
      bytes.length >= 33 && bytes.readUInt32BE(8) === 13 && bytes.toString('ascii', 12, 16) === 'IHDR'
        ? [bytes.readUInt32BE(16), bytes.readUInt32BE(20)] : null;
  if (!dimensions?.every((value) => value > 0 && value <= MAX_IMAGE_DIMENSION))
    throw new BadRequestException('Gambar harus statis dengan lebar dan tinggi maksimal 2.560 piksel.');
  return { bytes, contentType, width: dimensions[0]!, height: dimensions[1]! };
}

export function listQuestionMediaIds(body: string): string[] {
  if (!body.startsWith('<!--diis-question-html:v1-->')) return [];
  const matches = body.matchAll(/<img\s+[^>]*?\bdata-diis-media\s*=\s*["']([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})["'][^>]*>/gi);
  return [...new Set([...matches].map((match) => match[1]!.toLowerCase()))];
}
