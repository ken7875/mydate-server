import crypto from 'crypto';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { pipeline } from 'stream/promises';
// import { PassThrough } from 'stream';
import path from 'path';
import { catchAsyncController } from '@/utils/catchAsync';
import AppError from '@/utils/appError';
import { redis } from '@/config/redis';
import {
  UploadSession,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  MAX_FILE_USER_CAN_UPLOAD,
} from '@/types/upload';
import { processImage } from '@/services/imageProcessor';
import MessageImage from '@/model/messageImageModel';
import Message from '@/model/messageModel';
import { WebSocketServer } from '@/server';
import { PassThrough } from 'stream';
const UPLOAD_SESSION_TTL_SECONDS = 86400;

// ---------------------------------------------------------------------------
// Internal helpers
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
const SESSION_KEY = (uploadId: string) => `upload:session:${uploadId}`;

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
    receivedBytes: Number(raw.receivedBytes ?? 0),
    expiresAt: raw.expiresAt,
    thumbWidth: Number(raw.thumbWidth ?? 0),
    thumbHeight: Number(raw.thumbHeight ?? 0),
  };
}

// ---------------------------------------------------------------------------
// finalizeUpload — called automatically when all bytes are received
// ---------------------------------------------------------------------------
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
    result = await processImage(
      uploadId,
      filePath,
      session.thumbWidth,
      session.thumbHeight,
    );
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
  const {
    fileName,
    fileSize,
    mimeType,
    checksum,
    receiverId,
    roomId,
    thumbWidth,
    thumbHeight,
  } = req.body;

  // 1. 驗證必填欄位
  if (
    !fileName ||
    !fileSize ||
    !mimeType ||
    !checksum ||
    !receiverId ||
    !roomId ||
    !thumbWidth ||
    !thumbHeight
  ) {
    throw new AppError('MISSING_REQUIRED_FIELDS', 400);
  }

  // 1a. 驗證 thumbWidth / thumbHeight（正整數）
  if (
    !Number.isInteger(thumbWidth) ||
    thumbWidth <= 0 ||
    !Number.isInteger(thumbHeight) ||
    thumbHeight <= 0
  ) {
    throw new AppError('INVALID_DIMENSIONS', 400);
  }

  // 2. 驗證 mimeType
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new AppError('INVALID_FILE_TYPE', 400);
  }

  // 3. 驗證 fileSize
  if (fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
    throw new AppError('INVALID_FILE_SIZE', 400);
  }

  // 4. 正規化 fileName，防止路徑穿越（e.g. ../../etc/passwd）
  const safeFileName = path.basename(fileName);
  if (!safeFileName) throw new AppError('INVALID_FILE_NAME', 400);

  // 5. 驗證 checksum（64 位 hex）
  if (!/^[a-f0-9]{64}$/i.test(checksum)) {
    throw new AppError('INVALID_CHECKSUM', 400);
  }

  // 5. 產生 uploadId
  const uploadId = crypto.randomUUID();

  const expiresAt = new Date(
    Date.now() + UPLOAD_SESSION_TTL_SECONDS * 1000,
  ).toISOString();
  const userId = req.user?.uuid ?? '';

  // 6. 檢查用戶已上傳的照片總數是否達到上限
  const uploadedCount = await MessageImage.count({
    where: { userId, isExpired: false },
  });
  if (uploadedCount >= MAX_FILE_USER_CAN_UPLOAD) {
    throw new AppError('UPLOAD_LIMIT_EXCEEDED', 429);
  }

  // 7. 寫入 Redis（pipeline 批次執行，減少 round-trip）
  const initPipeline = redis.pipeline();
  initPipeline.hset(`upload:session:${uploadId}`, {
    userId,
    receiverId,
    roomId: String(roomId),
    fileName: safeFileName,
    fileSize: String(fileSize),
    mimeType,
    checksum,
    status: 'uploading',
    receivedBytes: '0',
    expiresAt,
    thumbWidth: String(thumbWidth),
    thumbHeight: String(thumbHeight),
  });
  initPipeline.expire(`upload:session:${uploadId}`, UPLOAD_SESSION_TTL_SECONDS);
  await initPipeline.exec();

  // 8. 回傳 201
  res.status(201).json({
    status: 'success',
    code: 201,
    data: {
      uploadId,
      expiresAt,
    },
  });
});

export const uploadChunk = catchAsyncController(async (req, res) => {
  const { uploadId, localId } = req.params;

  // 1. 從 Redis 取 session
  const session = await getSession(uploadId);
  if (!session) throw new AppError('UPLOAD_NOT_FOUND', 404);
  if (session.status === 'completed')
    throw new AppError('UPLOAD_ALREADY_COMPLETED', 409);

  // 2. 驗證 Content-Type
  if (
    !(req.headers['content-type'] ?? '').includes('application/octet-stream')
  ) {
    throw new AppError('INVALID_CONTENT_TYPE', 415);
  }

  // 3. 解析並驗證 Content-Range: bytes start-end/total
  const contentRange = req.headers['content-range'];
  if (!contentRange) throw new AppError('MISSING_CONTENT_RANGE', 400);
  const match = contentRange.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
  if (!match) throw new AppError('INVALID_CONTENT_RANGE', 400);

  const start = Number(match[1]);
  console.log(start, 'start');
  const end = Number(match[2]);
  const total = Number(match[3]);

  if (total !== session.fileSize)
    throw new AppError('INVALID_CONTENT_RANGE', 400);
  if (start !== session.receivedBytes)
    throw new AppError('INVALID_RANGE_START', 409);
  if (end >= total || start > end)
    throw new AppError('INVALID_CONTENT_RANGE', 400);

  // 4. 建立目錄與檔案（原子建立，避免並發覆蓋）
  const fileDir = path.join('public', 'messageImage', uploadId);
  const filePath = path.join(fileDir, session.fileName);

  await fsPromises.mkdir(fileDir, { recursive: true });
  try {
    const fh = await fsPromises.open(
      filePath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
    );
    // 預先分配完整檔案空間，確保任意 offset 寫入不越界
    await fh.truncate(session.fileSize);
    await fh.close();
  } catch (e: any) {
    if (e.code !== 'EEXIST') throw e;
  }

  // 5. 串流寫入指定 offset
  const fileHandle = await fsPromises.open(filePath, 'r+');
  const writeStream = fileHandle.createWriteStream({ start });
  let pipelineError: unknown = null;

  const monitor = new PassThrough();
  let chunkCount = 0;
  let monitoredBytes = 0;
  monitor.on('data', (chunk: Buffer) => {
    chunkCount++;
    monitoredBytes += chunk.length;
    console.log(
      `[upload:${uploadId}] chunk #${chunkCount} ${chunk.length}B  cumulative ${monitoredBytes}B`,
    );
  });

  const IDLE_TIMEOUT_MS = 10_000;
  const onSocketTimeout = () => req.socket.destroy();
  req.socket.setTimeout(IDLE_TIMEOUT_MS);
  req.socket.once('timeout', onSocketTimeout);

  try {
    await pipeline(req, monitor, writeStream);
  } catch (err: any) {
    pipelineError = err;
    console.log(pipelineError, 'pe');
  } finally {
    // 取消計時，防止 keep-alive socket 被下一個請求誤觸
    req.socket.setTimeout(0);
    req.socket.removeListener('timeout', onSocketTimeout);
    await fileHandle.close();
  }

  // req.complete 為 false：資料未完整送達就斷線
  if (!req.complete) {
    pipelineError = new Error('CLIENT_DISCONNECTED');
  }

  const newReceivedBytes = start + writeStream.bytesWritten;
  console.log(newReceivedBytes, 'newReceivedBytes');

  // 6. 無論是否斷線，都更新 Redis，保留斷點位置
  await redis.hset(
    SESSION_KEY(uploadId),
    'receivedBytes',
    String(newReceivedBytes),
  );

  // 前端已斷線：Redis 已更新，無法回應，直接結束
  if (pipelineError) return;

  // 7. 判斷是否傳輸完成
  if (newReceivedBytes >= session.fileSize) {
    // 分散式鎖：確保並發情況下 finalizeUpload 只被執行一次
    const lockKey = `upload:finalize:lock:${uploadId}`;
    const acquired = await redis.set(lockKey, '1', 'EX', 60, 'NX');
    if (!acquired) {
      res.status(202).json({
        status: 'success',
        code: 202,
        data: { uploadId },
      });
      return;
    }

    let message;
    try {
      message = await finalizeUpload(uploadId, localId, session, filePath);
    } finally {
      await redis.del(lockKey);
    }
    res.status(200).json({
      status: 'success',
      code: 200,
      data: message,
    });
    return;
  }

  // 8. 未完成：回 206，告知前端下次 Content-Range start 起點
  res.status(206).json({
    status: 'success',
    code: 206,
    data: {
      uploadId,
      nextStart: newReceivedBytes,
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

  // 2. 回傳 200，nextStart 為前端下次 Content-Range 的 start 起點
  res.status(200).json({
    status: 'success',
    code: 200,
    data: {
      uploadId,
      status: session.status,
      fileSize: session.fileSize,
      receivedBytes: session.receivedBytes,
      nextStart: session.receivedBytes,
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

  // 3. 刪除 Redis session key
  await redis.del(SESSION_KEY(uploadId));

  // 4. 刪除上傳目錄（若存在）
  const chunkDir = path.join('public', 'messageImage', uploadId);
  await fsPromises.rm(chunkDir, { recursive: true, force: true });

  // 5. 回傳 204
  res.status(204).send();
});
