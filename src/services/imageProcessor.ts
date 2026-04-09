import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { encode as blurhashEncode } from 'blurhash';
import AppError from '@/utils/appError';
import { UploadSession } from '@/types/upload';

export interface ProcessedImageResult {
  imageId: string;
  originalUrl: string;
  thumbnailUrl: string;
  blurHash: string;
  width: number;
  height: number;
  fileSize: number;
}

const ALLOWED_MAGIC_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/**
 * Merges all chunk files for an upload into a single Buffer,
 * validates the file, processes it with sharp, and cleans up tmp files.
 */
export async function processImage(
  uploadId: string,
  session: UploadSession,
): Promise<ProcessedImageResult> {
  // 1. Read all chunks in order and concatenate into one Buffer
  const chunkDir = path.join('tmp', 'uploads', uploadId);
  const chunkBuffers: Buffer[] = [];

  for (let i = 0; i < session.totalChunks; i++) {
    const chunkPath = path.join(chunkDir, `${i}.chunk`);
    const chunkData = await fs.readFile(chunkPath);
    chunkBuffers.push(chunkData);
  }

  const fileBuffer = Buffer.concat(chunkBuffers);

  // 2. Validate magic bytes via file-type (ESM-only package, use dynamic import)
  const { fileTypeFromBuffer } = await import('file-type');
  const fileTypeResult = await fileTypeFromBuffer(fileBuffer);

  if (!fileTypeResult || !ALLOWED_MAGIC_MIME_TYPES.has(fileTypeResult.mime)) {
    throw new AppError('INVALID_IMAGE', 415);
  }

  // 3. Verify SHA-256 checksum against session.checksum
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  if (hash !== session.checksum) {
    throw new AppError('CHECKSUM_MISMATCH', 400);
  }

  // 4. Generate a new imageId
  const imageId = crypto.randomUUID();

  // 5. Create output directory public/images/messageImage/{imageId}/
  const outputDir = path.join('public', 'images', 'messageImage', imageId);
  await fs.mkdir(outputDir, { recursive: true });

  const originalPath = path.join(outputDir, 'original.webp');
  const thumbPath = path.join(outputDir, 'thumb.webp');

  // 6. Convert to WebP and strip EXIF metadata (default sharp behaviour) → original.webp
  await sharp(fileBuffer).webp().toFile(originalPath);

  // 7. Generate thumbnail (max 400×400, preserve aspect ratio) → thumb.webp
  await sharp(fileBuffer)
    .resize(400, 400, { fit: 'inside' })
    .webp()
    .toFile(thumbPath);

  // 8. Get image dimensions (from original) and file size (from disk)
  const metadata = await sharp(fileBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  const stat = await fs.stat(originalPath);
  const fileSize = stat.size;

  // 9. Compute BlurHash using a small raw pixel buffer from sharp
  const BLURHASH_WIDTH = 32;
  const BLURHASH_HEIGHT = Math.round(32 * (height / (width || 1)));
  const clampedBlurHashHeight = Math.max(1, BLURHASH_HEIGHT);

  const { data: rawPixels, info: rawInfo } = await sharp(fileBuffer)
    .resize(BLURHASH_WIDTH, clampedBlurHashHeight, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const blurHash = blurhashEncode(
    new Uint8ClampedArray(rawPixels),
    rawInfo.width,
    rawInfo.height,
    4,
    3,
  );

  // 10. Remove the tmp upload directory
  await fs.rm(chunkDir, { recursive: true, force: true });

  // 11. Return result
  const originalUrl = `/images/messageImage/${imageId}/original.webp`;
  const thumbnailUrl = `/images/messageImage/${imageId}/thumb.webp`;

  return {
    imageId,
    originalUrl,
    thumbnailUrl,
    blurHash,
    width,
    height,
    fileSize,
  };
}
