// import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { encode as blurhashEncode } from 'blurhash';

export interface ProcessedImageResult {
  thumbnailUrl: string;
  blurHash: string;
  width: number;
  height: number;
  fileSize: number;
}

// const ALLOWED_MAGIC_MIME_TYPES = new Set([
//   'image/jpeg',
//   'image/png',
//   'image/webp',
// ]);

/**
 * Merges all chunk files for an upload into a single Buffer,
 * validates the file, processes it with sharp, and cleans up tmp files.
 */
export async function processImage(
  uploadId: string,
  filePath: string,
): Promise<ProcessedImageResult> {
  // 1. Read file from disk
  const fileBuffer = await fs.readFile(filePath);

  // 2. Create output directory public/images/messageImage/{imageId}/
  const outputDir = path.join('public', 'messageImage', uploadId);
  const thumbPath = path.join(outputDir, 'thumb.webp');

  // 3. Convert to WebP and strip EXIF metadata (default sharp behaviour) → original.webp
  await sharp(fileBuffer).webp().toFile(filePath);

  // 4. Generate thumbnail (max 400×400, preserve aspect ratio) → thumb.webp
  await sharp(filePath)
    .resize(400, 400, { fit: 'inside' })
    .webp()
    .toFile(thumbPath);

  // 5. Get image dimensions (from original) and file size (from disk)
  const metadata = await sharp(fileBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  const stat = await fs.stat(filePath);
  const fileSize = stat.size;

  // 6. Compute BlurHash using a small raw pixel buffer from sharp
  const BLURHASH_WIDTH = 32;
  const BLURHASH_HEIGHT = Math.round(32 * (height / (width || 1)));
  const clampedBlurHashHeight = Math.max(1, BLURHASH_HEIGHT);

  const { data: rawPixels, info: rawInfo } = await sharp(fileBuffer)
    .resize(BLURHASH_WIDTH, clampedBlurHashHeight, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const blurHash = blurhashEncode(
    new Uint8ClampedArray(rawPixels), // RGBA 像素陣列
    rawInfo.width, // 實際寬度
    rawInfo.height, // 實際高度
    4, // X 方向頻率分量
    3, // Y 方向頻率分量
  );
  const thumbnailUrl = `/public/messageImage/${uploadId}/thumb.webp`;

  return {
    thumbnailUrl,
    blurHash,
    width,
    height,
    fileSize,
  };
}
