import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { catchAsyncController } from '@/utils/catchAsync';
import AppError from '@/utils/appError';
import { redis } from '@/config/redis';
import {
  UploadSession,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  MAX_CHUNK_SIZE,
} from '@/types/upload';

const UPLOAD_SESSION_TTL_SECONDS = 86400;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const SESSION_KEY = (uploadId: string) => `upload:session:${uploadId}`;
const CHUNKS_KEY = (uploadId: string) => `upload:chunks:${uploadId}`;

async function getSession(uploadId: string): Promise<UploadSession | null> {
  const raw = await redis.hgetall(SESSION_KEY(uploadId));
  if (!raw || Object.keys(raw).length === 0) return null;

  return {
    userId: raw.userId,
    fileName: raw.fileName,
    fileSize: Number(raw.fileSize),
    mimeType: raw.mimeType,
    checksum: raw.checksum,
    status: raw.status as UploadSession['status'],
    totalChunks: Number(raw.totalChunks),
    receivedChunks: Number(raw.receivedChunks),
    expiresAt: raw.expiresAt,
  };
}

// ---------------------------------------------------------------------------
// finalizeUpload — stub; full implementation in TASK-010
// ---------------------------------------------------------------------------

export async function finalizeUpload(
  uploadId: string,
  session: UploadSession,
): Promise<void> {
  void uploadId;
  void session;
  // TODO: TASK-010 will replace this stub with:
  //   processImage → write MySQL (MessageImage + Message)
  //   → broadcast WebSocket imageMessage → update Redis status = 'completed'
  throw new AppError('PROCESSING_NOT_IMPLEMENTED', 501);
}

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

export const initUpload = catchAsyncController(async (req, res) => {
  const { fileName, fileSize, mimeType, checksum, totalChunks } = req.body;

  // 1. 驗證必填欄位
  if (!fileName || !fileSize || !mimeType || !checksum || !totalChunks) {
    throw new AppError('MISSING_REQUIRED_FIELDS', 400);
  }

  // 2. 驗證 mimeType
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new AppError('INVALID_FILE_TYPE', 400);
  }

  // 3. 驗證 fileSize
  if (fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
    throw new AppError('INVALID_FILE_SIZE', 400);
  }

  // 4. 驗證 checksum（64 位 hex）
  if (!/^[a-f0-9]{64}$/i.test(checksum)) {
    throw new AppError('INVALID_CHECKSUM', 400);
  }

  // 5. 驗證 totalChunks（容許誤差 ±1）
  const expectedChunks = Math.ceil(fileSize / MAX_CHUNK_SIZE);
  if (totalChunks < 1 || Math.abs(totalChunks - expectedChunks) > 1) {
    throw new AppError('INVALID_CHUNK_COUNT', 400);
  }

  // 6. 產生 uploadId
  const uploadId = crypto.randomUUID();

  const expiresAt = new Date(
    Date.now() + UPLOAD_SESSION_TTL_SECONDS * 1000,
  ).toISOString();
  const userId = req.user?.uuid ?? '';

  // 7. 寫入 Redis
  await redis.hset(`upload:session:${uploadId}`, {
    userId,
    fileName,
    fileSize: String(fileSize),
    mimeType,
    checksum,
    status: 'uploading',
    totalChunks: String(totalChunks),
    receivedChunks: '0',
    expiresAt,
  });
  await redis.expire(`upload:session:${uploadId}`, UPLOAD_SESSION_TTL_SECONDS);

  // 8. 回傳 201
  res.status(201).json({
    status: 'success',
    code: 201,
    data: {
      uploadId,
      totalChunks,
      expiresAt,
    },
  });
});

export const uploadChunk = catchAsyncController(async (req, res) => {
  const { uploadId, chunkIndex: chunkIndexParam } = req.params;

  // 1. 從 Redis 取 session，不存在回 404
  const session = await getSession(uploadId);
  if (!session) {
    throw new AppError('UPLOAD_NOT_FOUND', 404);
  }

  // 2. 若 status 為 'completed' 回 409
  if (session.status === 'completed') {
    throw new AppError('UPLOAD_ALREADY_COMPLETED', 409);
  }

  // 3. 解析並驗證 chunkIndex
  const chunkIndex = Number(chunkIndexParam);
  if (
    !Number.isInteger(chunkIndex) ||
    chunkIndex < 0 ||
    chunkIndex >= session.totalChunks
  ) {
    throw new AppError('INVALID_CHUNK_INDEX', 400);
  }

  // 4. 驗證 req.body (Buffer) 大小
  const body = req.body as Buffer;
  const isLastChunk = chunkIndex === session.totalChunks - 1;
  const expectedLastChunkSize =
    session.fileSize - (session.totalChunks - 1) * MAX_CHUNK_SIZE;

  if (isLastChunk) {
    if (body.length !== expectedLastChunkSize) {
      throw new AppError('INVALID_CHUNK_SIZE', 400);
    }
  } else {
    if (body.length > MAX_CHUNK_SIZE) {
      throw new AppError('INVALID_CHUNK_SIZE', 400);
    }
  }

  // 5. 幂等處理：若此 chunkIndex 已接收過，直接回 200
  const alreadyReceived = await redis.sismember(
    CHUNKS_KEY(uploadId),
    String(chunkIndex),
  );
  if (alreadyReceived) {
    res.status(200).json({
      uploadId,
      chunkIndex,
      receivedChunks: session.receivedChunks,
      totalChunks: session.totalChunks,
    });
    return;
  }

  // 6. 將 chunk 寫入磁碟 tmp/uploads/{uploadId}/{chunkIndex}.chunk
  const chunkDir = path.join('tmp', 'uploads', uploadId);
  await fs.mkdir(chunkDir, { recursive: true });
  await fs.writeFile(
    path.join(chunkDir, `${chunkIndex}.chunk`),
    body as unknown as Uint8Array,
  );

  // 7. 更新 Redis：記錄 chunkIndex，累計 receivedChunks
  await redis.sadd(CHUNKS_KEY(uploadId), String(chunkIndex));
  const newReceivedChunks = await redis.hincrby(
    SESSION_KEY(uploadId),
    'receivedChunks',
    1,
  );

  // 8. 所有 chunks 都到齊時，自動觸發 finalizeUpload
  if (newReceivedChunks === session.totalChunks) {
    await finalizeUpload(uploadId, session);

    res.status(200).json({
      uploadId,
      receivedChunks: newReceivedChunks,
      totalChunks: session.totalChunks,
    });
    return;
  }

  // 未完成：回 206 Partial Content
  res.status(206).json({
    uploadId,
    chunkIndex,
    receivedChunks: newReceivedChunks,
    totalChunks: session.totalChunks,
  });
});

export const getUploadStatus = catchAsyncController(async (req, res) => {
  const { uploadId } = req.params;

  // 1. 從 Redis 取 session，不存在回 404
  const session = await getSession(uploadId);
  if (!session) {
    throw new AppError('UPLOAD_NOT_FOUND', 404);
  }

  // 2. 從 upload:chunks:{uploadId} Set 取已接收的 chunkIndex 清單
  const rawChunkIndices = await redis.smembers(CHUNKS_KEY(uploadId));
  const receivedChunkIndices = rawChunkIndices
    .map(Number)
    .sort((a, b) => a - b);

  // 3. 回傳 200
  res.status(200).json({
    status: 'success',
    code: 200,
    data: {
      uploadId,
      status: session.status,
      fileSize: session.fileSize,
      totalChunks: session.totalChunks,
      receivedChunks: session.receivedChunks,
      receivedChunkIndices,
      expiresAt: session.expiresAt,
    },
  });
});

export const cancelUpload = catchAsyncController(async (_req, res) => {
  res.status(501).json({ message: 'Not implemented' });
});
