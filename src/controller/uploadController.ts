import crypto from 'crypto';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
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
import { processImage } from '@/services/imageProcessor';
import MessageImage from '@/model/messageImageModel';
import Message from '@/model/messageModel';
import { WebSocketServer } from '@/server';
const UPLOAD_SESSION_TTL_SECONDS = 86400;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const SESSION_KEY = (uploadId: string) => `upload:session:${uploadId}`;
const CHUNKS_KEY = (uploadId: string) => `upload:chunks:${uploadId}`;
// 追蹤每個 chunk 已接收的 byte 數，支援 sub-chunk 斷點續傳
const CHUNK_PROGRESS_KEY = (uploadId: string) =>
  `upload:chunk:progress:${uploadId}`;

async function getSession(uploadId: string): Promise<UploadSession | null> {
  const raw = await redis.hgetall(SESSION_KEY(uploadId));
  if (!raw || Object.keys(raw).length === 0) return null;

  return {
    userId: raw.userId,
    receiverId: raw.receiverId ?? '',
    roomId: Number(raw.roomId ?? 0),
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
// finalizeUpload — called automatically when last chunk is received
// ---------------------------------------------------------------------------
// async function deleteAllUploadKeys() {
//   let cursor = '0';
//   do {
//     const [nextCursor, keys] = await redis.scan(
//       cursor,
//       'MATCH',
//       'upload:*',
//       'COUNT',
//       100,
//     );
//     cursor = nextCursor;
//     if (keys.length > 0) {
//       await redis.del(...keys);
//     }
//   } while (cursor !== '0');
// }
// deleteAllUploadKeys();
export async function finalizeUpload(
  uploadId: string,
  localId: string,
  session: UploadSession,
  filePath: string,
): Promise<{
  senderId: string;
  receiverId: string;
  thumbnailUrl: string;
  blurHash: string;
  roomId: number;
  type: string;
  imageId: string;
  message: string;
  sendTime: Date;
  isRead: false;
}> {
  // 1. 讀取完整檔案，進行安全驗證
  const fileBuffer = await fsPromises.readFile(filePath);

  // 1a. Magic Bytes 驗證：確認檔案真實格式為允許的圖片類型
  const { fileTypeFromBuffer } = await import('file-type');
  const fileTypeResult = await fileTypeFromBuffer(
    fileBuffer as unknown as ArrayBuffer,
  );
  const ALLOWED_MAGIC_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);
  if (!fileTypeResult || !ALLOWED_MAGIC_MIME_TYPES.has(fileTypeResult.mime)) {
    throw new AppError('INVALID_IMAGE', 415);
  }

  // 1b. SHA-256 Checksum 比對：確認傳輸過程中資料未損壞或竄改
  const hash = crypto
    .createHash('sha256')
    .update(fileBuffer as unknown as Uint8Array)
    .digest('hex');
  if (hash !== session.checksum) {
    throw new AppError('CHECKSUM_MISMATCH', 400);
  }

  // 2. Process image (convert, generate blurHash)
  let result;
  try {
    result = await processImage(uploadId, filePath);
  } catch {
    throw new AppError('PROCESSING_FAILED', 422);
  }

  const now = new Date();
  const expireAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // 3. Write MessageImage record
  const imageId = uploadId;
  await MessageImage.create({
    imageId,
    userId: session.userId,
    originalUrl: filePath.replace(/^public\//, ''),
    thumbnailUrl: result.thumbnailUrl,
    blurHash: result.blurHash,
    width: result.width,
    height: result.height,
    fileSize: result.fileSize,
    mimeType: 'image/webp',
    isExpired: false,
    expireAt,
    createdAt: now,
  });

  // 4. Write Message record
  const message = await Message.create({
    senderId: session.userId,
    receiverId: session.receiverId,
    roomId: session.roomId,
    type: 'image',
    imageId,
    message: '',
    sendTime: now,
    isRead: false,
  });

  // 5. Update Redis session status = 'completed'
  await redis.hset(SESSION_KEY(uploadId), 'status', 'completed');

  // 6. Broadcast imageMessage via WebSocket
  const createdMessage = await Message.findOne({
    where: { id: message.dataValues.id },
    include: [
      {
        model: MessageImage,
        as: 'messageImage',
        foreignKey: 'imageId',
        required: false,
        attributes: [
          'thumbnailUrl',
          'blurHash',
          'width',
          'height',
          'isExpired',
        ],
      },
    ],
  });

  WebSocketServer.sendToSpecifyUser({
    uuid: [session.userId, session.receiverId],
    type: 'chatRoom',
    code: 'SUCCESS',
    data: {
      roomId: session.roomId,
      message: [
        {
          ...createdMessage!.dataValues,
          localId,
          sendTime: Math.floor(+createdMessage!.dataValues.sendTime / 1000),
        },
      ],
    },
  });

  return {
    senderId: session.userId,
    receiverId: session.receiverId,
    roomId: session.roomId,
    type: 'image',
    thumbnailUrl: result.thumbnailUrl,
    blurHash: result.blurHash,
    imageId,
    message: '',
    sendTime: now,
    isRead: false,
  };
}

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

export const initUpload = catchAsyncController(async (req, res) => {
  const { fileName, fileSize, mimeType, checksum, receiverId, roomId } =
    req.body;

  // 1. 驗證必填欄位
  if (
    !fileName ||
    !fileSize ||
    !mimeType ||
    !checksum ||
    !receiverId ||
    !roomId
  ) {
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

  // 5. 後端計算 totalChunks，確保與 MAX_CHUNK_SIZE 一致
  const totalChunks = Math.ceil(fileSize / MAX_CHUNK_SIZE);

  // 6. 產生 uploadId
  const uploadId = crypto.randomUUID();

  const expiresAt = new Date(
    Date.now() + UPLOAD_SESSION_TTL_SECONDS * 1000,
  ).toISOString();
  const userId = req.user?.uuid ?? '';

  // 7. 寫入 Redis
  await redis.hset(`upload:session:${uploadId}`, {
    userId,
    receiverId,
    roomId: String(roomId),
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
  const { uploadId, localId, chunkIndex: chunkIndexParam } = req.params;

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

  // 4. 解析 Content-Range header（必填）
  //    格式：Content-Range: bytes {start}-{end}/{chunkTotal}
  const contentRange = req.headers['content-range'];
  if (!contentRange) {
    throw new AppError('MISSING_CONTENT_RANGE', 400);
  }
  const match = contentRange.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
  if (!match) {
    throw new AppError('INVALID_CONTENT_RANGE', 400);
  }
  const start = Number(match[1]);
  // const end = Number(match[2]);
  // const total = Number(match[3]);

  const body = req.body as Buffer;

  const fileDir = path.join('public', 'messageImage', uploadId);
  const filePath = path.join(fileDir, session.fileName);

  await fsPromises.mkdir(fileDir, { recursive: true });
  // 「建立一個全新的檔案，若已存在就報錯」，這個動作在 OS 層是原子的。
  try {
    // O_CREAT | O_EXCL 確保只有第一個請求能建立檔案（原子操作，無 race condition）
    // O_WRONLY 以唯寫模式開啟
    // O_CREAT 檔案不存在時建立
    // O_EXCL 若檔案已存在則直接失敗（拋出 EEXIST）
    const fh = await fsPromises.open(
      filePath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
    );
    // 將檔案大小設定為 session.fileSize（例如 10MB）。此時檔案內容全為零，但磁碟空間已預先保留，後續任何 chunk 寫入任意 offset 都不會超出邊界。
    await fh.truncate(session.fileSize);
    await fh.close();
  } catch (e: any) {
    if (e.code !== 'EEXIST') throw e;
  }

  const fileHandle = await fsPromises.open(filePath, 'r+');
  try {
    await fileHandle.write(body as Uint8Array, 0, body.length, start);
  } finally {
    await fileHandle.close();
  }

  await redis.sadd(CHUNKS_KEY(uploadId), String(chunkIndex));
  const receivedCount = await redis.scard(CHUNKS_KEY(uploadId));

  if (receivedCount === session.totalChunks) {
    const message = await finalizeUpload(uploadId, localId, session, filePath);
    res.status(200).json({
      status: 'success',
      code: 200,
      data: message,
    });
    return;
  }

  // 未完成：回 206 Partial Content
  res.status(206).json({
    status: 'success',
    code: 206,
    data: {
      uploadId,
      chunkIndex,
      totalChunks: session.totalChunks,
    },
  });
});

export const getUploadStatus = catchAsyncController(async (req, res) => {
  const { uploadId } = req.params;

  // 1. 從 Redis 取 session，不存在回 404
  const session = await getSession(uploadId);
  if (!session) {
    throw new AppError('UPLOAD_NOT_FOUND', 404);
  }

  // 2. 從 upload:chunks:{uploadId} Set 取已完整接收的 chunkIndex 清單
  const rawChunkIndices = await redis.smembers(CHUNKS_KEY(uploadId));
  const receivedChunkIndices = rawChunkIndices
    .map(Number)
    .sort((a, b) => a - b);

  // 3. 取各 chunk 的 sub-chunk 進度（尚未完整接收的 chunk 已收到多少 bytes）
  const rawProgress = await redis.hgetall(CHUNK_PROGRESS_KEY(uploadId));
  const chunkProgress: Record<number, number> = {};
  for (const [k, v] of Object.entries(rawProgress)) {
    chunkProgress[Number(k)] = Number(v);
  }

  // 4. 回傳 200
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
      chunkProgress,
      expiresAt: session.expiresAt,
    },
  });
});

export const cancelUpload = catchAsyncController(async (req, res) => {
  const { uploadId } = req.params;

  // 1. 從 Redis 取 session，不存在回 404
  const session = await getSession(uploadId);
  if (!session) {
    throw new AppError('UPLOAD_NOT_FOUND', 404);
  }

  // 2. 若 status = 'completed' 回 409
  if (session.status === 'completed') {
    throw new AppError('UPLOAD_ALREADY_COMPLETED', 409);
  }

  // 3. 刪除 Redis keys（含 sub-chunk 進度）
  await redis.del(SESSION_KEY(uploadId));
  await redis.del(CHUNKS_KEY(uploadId));
  await redis.del(CHUNK_PROGRESS_KEY(uploadId));

  // 4. 刪除上傳目錄（若存在）
  const chunkDir = path.join('public', 'messageImage', uploadId);
  await fsPromises.rm(chunkDir, { recursive: true, force: true });

  // 5. 回傳 204
  res.status(204).send();
});
