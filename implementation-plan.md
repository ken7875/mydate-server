# 實作計畫：使用者照片上傳功能

## 設計決策

- **上傳方式**：分片上傳（Chunked Upload）。前端將檔案切成最大 2MB 的 chunks，依序透過多次 PUT 請求傳送，每次帶上 `chunkIndex`（0-based）與 `totalChunks`
- **斷線續傳**：客戶端斷線後呼叫 GET status 取得已接收的 chunkIndex 清單，重新傳送缺少的 chunks
- **Redis**：儲存 upload session（uploadId → metadata + receivedChunks 數量），以及 `upload:chunks:{uploadId}` Set 記錄已接收的 chunkIndex，TTL 24h
- **MySQL**：`message_image` 儲存最終圖片 metadata；`message` table 新增 `type` / `imageId` 欄位
- **本地檔案系統**：每個 chunk 暫存為 `tmp/uploads/{uploadId}/{chunkIndex}.chunk`，所有 chunks 接收完畢後合併輸出至 `public/images/messageImage/{imageId}/original.webp` & `thumb.webp`

---

## 套件安裝

```bash
yarn add blurhash node-cron
yarn add -D @types/node-cron
```

> `sharp`、`express-rate-limit`、`file-type` 已在 package.json，無需重複安裝。

---

## Redis 資料結構

```
upload:session:{uploadId}  →  Hash（TTL: 86400s）
  userId          string
  fileName        string
  fileSize        number（bytes）
  mimeType        string
  checksum        string（整個檔案的 SHA-256 hex）
  status          'uploading' | 'completed' | 'cancelled'
  totalChunks     number（前端切分的 chunk 總數）
  receivedChunks  number（已成功接收的 chunk 數量）
  expiresAt       ISO 8601 string

upload:chunks:{uploadId}  →  Set of chunkIndex（已接收的 chunk index，TTL: 86400s）
```

---

## 資料庫 Schema 異動

### 新增：`message_image` table

| 欄位 | 型別 | 說明 |
|------|------|------|
| imageId | UUID PK | 圖片唯一 ID |
| userId | STRING | 上傳者 |
| originalUrl | STRING | 原始圖片路徑 |
| thumbnailUrl | STRING | 縮圖路徑 |
| blurHash | STRING | BlurHash 字串 |
| width | INTEGER | 圖片寬度 |
| height | INTEGER | 圖片高度 |
| fileSize | INTEGER | 檔案大小（bytes）|
| mimeType | STRING | 固定 image/webp |
| isExpired | BOOLEAN | 是否已過期（預設 false）|
| expireAt | DATE | 過期時間（createdAt + 24h）|
| createdAt | DATE | 建立時間（timestamps: false 手動設定）|

### 修改：`message` table

新增欄位：
- `type` STRING NOT NULL DEFAULT `'text'`（`'text'` \| `'image'`）
- `imageId` UUID NULLABLE

---

## API 端點設計（簡化版）

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/uploads/init` | 建立 upload session，回傳 uploadId（需帶 totalChunks）|
| PUT | `/api/uploads/:uploadId/chunks/:chunkIndex` | 上傳單一 chunk（application/octet-stream）|
| GET | `/api/uploads/:uploadId/status` | 查詢已接收的 chunkIndex 清單（斷線重連用）|
| DELETE | `/api/uploads/:uploadId` | 取消上傳 |
| GET | `/api/images/:imageId/meta` | 取得圖片 metadata |

> `complete` 步驟由後端在接收到最後一個 chunk（`receivedChunks === totalChunks`）後自動觸發，不需要獨立端點。
> 前端檔案大於 2MB 時切分為多個 ≤ 2MB 的 chunks，小於等於 2MB 則 totalChunks=1。

---

## 新增/修改檔案清單

### 新增

| 檔案路徑 | 說明 |
|---------|------|
| `src/model/messageImageModel.ts` | MessageImage Sequelize model |
| `src/types/upload.ts` | TypeScript interface 與常數定義 |
| `src/controller/uploadController.ts` | upload API handlers |
| `src/controller/imageController.ts` | GET /images/:imageId/meta |
| `src/routes/uploadRoutes.ts` | upload 路由定義 |
| `src/routes/imageRoutes.ts` | image 路由定義 |
| `src/services/imageProcessor.ts` | 圖片驗證、處理（sharp）、BlurHash |
| `src/middleware/rateLimiters.ts` | rate limit middleware 實例 |
| `src/jobs/cleanupExpiredUploads.ts` | Cron Job：每小時清理過期圖片 |

### 修改

| 檔案路徑 | 說明 |
|---------|------|
| `src/model/messageModel.ts` | 新增 type、imageId 欄位 |
| `src/routes/index.ts` | 掛載 uploadRoutes、imageRoutes |
| `src/server.ts` | 啟動 Cron Job |

---

## 分批實作 Tasks

---

### BATCH 1：套件安裝 + Model 定義

#### TASK-001：安裝新套件
- **動作**：`yarn add blurhash node-cron && yarn add -D @types/node-cron`
- **驗收**：package.json 出現 `blurhash`、`node-cron`

---

#### TASK-002：新增 MessageImage Model
- **新增**：`src/model/messageImageModel.ts`
- **參照**：`src/model/messageModel.ts` 的風格（`timestamps: false`，手動宣告 createdAt）
- **欄位**：imageId(UUID PK)、userId、originalUrl、thumbnailUrl、blurHash、width、height、fileSize、mimeType、isExpired(BOOLEAN default false)、expireAt(DATE)、createdAt(DATE)
- **驗收**：`yarn build` TypeScript 編譯無錯誤

---

#### TASK-003：修改 Message Model（新增 type + imageId）
- **修改**：`src/model/messageModel.ts`
- **新增欄位**：
  ```typescript
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'text',
  },
  imageId: {
    type: DataTypes.UUID,
    allowNull: true,
    defaultValue: null,
  },
  ```
- **驗收**：`yarn build` TypeScript 編譯無錯誤

---

### BATCH 2：類型定義 + 路由骨架

#### TASK-004：新增 TypeScript 類型
- **新增**：`src/types/upload.ts`
- **內容**：
  ```typescript
  export interface UploadSession {
    userId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    checksum: string;
    status: 'uploading' | 'completed' | 'cancelled';
    totalChunks: number;
    receivedChunks: number;
    expiresAt: string;
  }

  export const ALLOWED_MIME_TYPES = ['image/webp', 'image/jpeg', 'image/png'] as const;
  export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
  export const MAX_CHUNK_SIZE = 2 * 1024 * 1024; // 2MB per chunk
  ```
- **驗收**：`yarn build` 無錯誤

---

#### TASK-005：建立路由骨架並掛載
- **新增**：`src/routes/uploadRoutes.ts`、`src/routes/imageRoutes.ts`
- **修改**：`src/routes/index.ts`

`uploadRoutes.ts`：
```typescript
router.post('/init', verifyToken, initUploadLimiter, initUpload);
router.put('/:uploadId/chunks/:chunkIndex', verifyToken, chunkUploadLimiter, express.raw({ type: 'application/octet-stream', limit: '2mb' }), uploadChunk);
router.get('/:uploadId/status', verifyToken, getUploadStatus);
router.delete('/:uploadId', verifyToken, cancelUpload);
```

`imageRoutes.ts`：
```typescript
router.get('/:imageId/meta', verifyToken, imageReadLimiter, getImageMeta);
```

`index.ts` 新增：
```typescript
import upload from './uploadRoutes';
import image from './imageRoutes';
router.use('/uploads', upload);
router.use('/images', image);
```

- **驗收**：伺服器啟動無錯誤，路由可被 curl 訪問

---

### BATCH 3：初始化上傳 API

#### TASK-006：實作 POST /api/uploads/init
- **修改**：`src/controller/uploadController.ts`（新增 `initUpload`）
- **邏輯**：
  1. 驗證 `fileName`, `fileSize`, `mimeType`, `checksum`, `totalChunks` 必填
  2. 驗證 mimeType 在 `ALLOWED_MIME_TYPES`，否則 `new AppError('INVALID_FILE_TYPE', 400)`
  3. 驗證 `0 < fileSize <= 20971520`，否則 `new AppError('INVALID_FILE_SIZE', 400)`
  4. 驗證 checksum 為 64 位 hex（`/^[a-f0-9]{64}$/i`），否則 `new AppError('INVALID_CHECKSUM', 400)`
  5. 驗證 `totalChunks >= 1` 且 `totalChunks === Math.ceil(fileSize / MAX_CHUNK_SIZE)`（容許誤差 ±1），否則 `new AppError('INVALID_CHUNK_COUNT', 400)`
  6. `uploadId = crypto.randomUUID()`
  7. 以 `redis.hset` 寫入 `upload:session:{uploadId}`（含 totalChunks, receivedChunks=0），再 `redis.expire` 設 86400s
  8. 回傳 `201 { uploadId, totalChunks, expiresAt }`
- **驗收**：
  - 合法請求回傳 201 含 uploadId 與 totalChunks
  - 非法 mimeType 回傳 400 + `INVALID_FILE_TYPE`
  - Redis 有對應 key

---

### BATCH 4：上傳檔案 API（串流 + 斷線續傳）

#### TASK-007：實作 PUT /api/uploads/:uploadId/chunks/:chunkIndex
- **修改**：`src/controller/uploadController.ts`（新增 `uploadChunk`）
- **路由注意**：此端點在 `uploadRoutes.ts` 中已套用 `express.raw({ type: 'application/octet-stream', limit: '2mb' })`，**不使用 multer**
- **斷線續傳邏輯**：
  - 前端斷線後呼叫 GET status 取得已接收的 chunkIndex 清單
  - 前端重新傳送清單中缺少的 chunk
  - 後端以 `upload:chunks:{uploadId}` Set 記錄已接收的 index，重複傳送同一 chunk 直接回 200（幂等）
- **完整邏輯**：
  1. 從 Redis 取 session，不存在回 404 `UPLOAD_NOT_FOUND`
  2. 若 status 為 'completed' 回 409 `UPLOAD_ALREADY_COMPLETED`
  3. 解析 `chunkIndex`（path param，轉為數字），驗證 `0 <= chunkIndex < session.totalChunks`，否則回 400 `INVALID_CHUNK_INDEX`
  4. 驗證 `req.body`（Buffer）大小：非最後一個 chunk 不得超過 MAX_CHUNK_SIZE；最後一個 chunk 大小 = fileSize - (totalChunks - 1) * MAX_CHUNK_SIZE
  5. 若 `upload:chunks:{uploadId}` Set 已含此 chunkIndex，直接回 200（幂等處理）
  6. 將 `req.body` 寫入 `tmp/uploads/{uploadId}/{chunkIndex}.chunk`
  7. `redis.sadd('upload:chunks:{uploadId}', chunkIndex)`；`redis.hincrby(..., 'receivedChunks', 1)`
  8. 若 `receivedChunks === totalChunks`，自動觸發 `finalizeUpload(uploadId, session)`
  9. `finalizeUpload`：合併所有 chunk → 呼叫 imageProcessor → 寫 MySQL → 廣播 WebSocket → 更新 Redis status = 'completed'
  10. 未完成回 206 Partial Content `{ uploadId, chunkIndex, receivedChunks, totalChunks }`；完成回 200 含圖片資訊
- **驗收**：
  - 上傳一張 > 2MB 圖片（多個 chunks），收到 200 及圖片 URL
  - 重複傳送同一 chunkIndex 回 200（幂等）
  - 模擬中斷後呼叫 status、補傳缺少的 chunk，能完成上傳

---

### BATCH 5：查詢進度 API

#### TASK-008：實作 GET /api/uploads/:uploadId/status
- **修改**：`src/controller/uploadController.ts`（新增 `getUploadStatus`）
- **邏輯**：
  1. 從 Redis 取 session，不存在回 404
  2. 從 `upload:chunks:{uploadId}` Set 取已接收的 chunkIndex 清單
  3. 回傳 `200 { uploadId, status, fileSize, totalChunks, receivedChunks, receivedChunkIndices: number[], expiresAt }`
- **驗收**：回傳正確的 receivedChunkIndices，前端可據此判斷哪些 chunks 需要重傳，並計算已上傳百分比

---

### BATCH 6：圖片處理 Service

#### TASK-009：實作 `src/services/imageProcessor.ts`
- **新增**：`src/services/imageProcessor.ts`
- **匯出**：`processImage(uploadId: string, session: UploadSession): Promise<ProcessedImageResult>`
- **邏輯**：
  1. 按順序讀取 `tmp/uploads/{uploadId}/0.chunk` ~ `{totalChunks-1}.chunk`，合併成完整檔案 Buffer
  2. 用 `file-type` 驗證 magic bytes（必須為 jpeg/png/webp），否則拋出 `AppError('INVALID_IMAGE', 415)`
  3. 計算整個合併 Buffer 的 SHA-256，比對 session.checksum，不符拋出 `AppError('CHECKSUM_MISMATCH', 400)`
  4. `imageId = crypto.randomUUID()`
  5. 建立 `public/images/messageImage/{imageId}/`
  6. `sharp` 重新編碼（移除 EXIF, withMetadata(false)，轉 WebP）→ 輸出 `original.webp`
  7. `sharp` 產生縮圖（`.resize(400, 400, { fit: 'inside' })`）→ 輸出 `thumb.webp`
  8. 取得 width、height（從 sharp metadata）、fileSize（fs.stat）
  9. 用 `blurhash.encode` 計算 BlurHash（先用 sharp 轉 raw pixel buffer）
  10. 刪除整個 `tmp/uploads/{uploadId}/` 目錄
  11. 回傳 `{ imageId, originalUrl, thumbnailUrl, blurHash, width, height, fileSize }`

`ProcessedImageResult` 介面：
```typescript
interface ProcessedImageResult {
  imageId: string;
  originalUrl: string;
  thumbnailUrl: string;
  blurHash: string;
  width: number;
  height: number;
  fileSize: number;
}
```

- **驗收**：對一張測試圖片呼叫後，`public/images/messageImage/{imageId}/` 目錄存在 original.webp 與 thumb.webp，blurHash 非空字串

---

### BATCH 7：完成上傳（finalize）整合

#### TASK-010：實作 finalizeUpload 流程
- **修改**：`src/controller/uploadController.ts`（新增 `finalizeUpload` 內部函式）
- **此函式由 TASK-007 在串流接收完畢後自動呼叫**
- **邏輯**：
  1. 呼叫 `imageProcessor.processImage(uploadId, session)`，失敗拋出 `AppError('PROCESSING_FAILED', 422)`
  2. 寫入 `MessageImage` table（expireAt = now + 24h）
  3. 寫入 `Message` table（type='image', imageId, senderId=userId, receiverId, roomId, sendTime=now, message=''）
  4. 更新 Redis session status = 'completed'
  5. 透過 `WebSocketServer.sendToSpecifyUser` 廣播 `image_message` 事件

  廣播 payload：
  ```json
  {
    "type": "imageMessage",
    "code": "SUCCESS",
    "data": {
      "roomId": "...",
      "messageId": "...",
      "senderId": "...",
      "imageId": "...",
      "thumbnailUrl": "...",
      "blurHash": "...",
      "width": 1920,
      "height": 1080,
      "timestamp": "..."
    }
  }
  ```

- **驗收**：
  - MySQL message_image 有新紀錄
  - MySQL message 有 type='image' 的新紀錄
  - WebSocket 收到 imageMessage 事件

---

### BATCH 8：取消上傳 + 圖片 Metadata

#### TASK-011：實作 DELETE /api/uploads/:uploadId
- **修改**：`src/controller/uploadController.ts`（新增 `cancelUpload`）
- **邏輯**：
  1. 從 Redis 取 session，不存在回 404
  2. 若 status = 'completed' 回 409 `UPLOAD_ALREADY_COMPLETED`
  3. 刪除 Redis key（`upload:session:{uploadId}` 與 `upload:chunks:{uploadId}`）
  4. 刪除 `tmp/uploads/{uploadId}/` 目錄（若存在）
  5. 回傳 204
- **驗收**：取消後 Redis key 不存在，tmp 目錄清除

---

#### TASK-012：實作 GET /api/images/:imageId/meta
- **新增**：`src/controller/imageController.ts`（`getImageMeta`）
- **邏輯**：查 MySQL MessageImage，不存在回 404，否則回傳 200 + metadata（含 isExpired）
- **驗收**：正確回傳資料，isExpired 圖片標示為 true

---

### BATCH 9：速率限制

#### TASK-013：建立 Rate Limiters
- **新增**：`src/middleware/rateLimiters.ts`
- **三個 limiter**（參照現有 express-rate-limit 語法）：
  - `initUploadLimiter`：每用戶每分鐘 10 次（windowMs: 60000, max: 10）
  - `chunkUploadLimiter`：每用戶每秒 20 次（windowMs: 1000, max: 20）
  - `imageReadLimiter`：每用戶每秒 60 次（windowMs: 1000, max: 60）
  - keyGenerator 使用 `req.user?.uuid ?? req.ip`
  - 超限 handler：回傳 `429 { status: 'fail', code: 429, errorCode: 'RATE_LIMITED', message: '...' }`
  - 設定 `standardHeaders: true`（自動加 Retry-After, X-RateLimit-* headers）
- **修改**：`src/routes/uploadRoutes.ts`、`src/routes/imageRoutes.ts` 套用各自的 limiter
- **驗收**：短時間內大量請求回傳 429，response header 含 `Retry-After`

---

### BATCH 10：Cron Job 過期清理

#### TASK-014：實作 Cron Job
- **新增**：`src/jobs/cleanupExpiredUploads.ts`
- **邏輯**：
  ```typescript
  import cron from 'node-cron';
  import MessageImage from '@/model/messageImageModel';
  import { Op } from 'sequelize';
  import fs from 'fs/promises';
  import path from 'path';

  export const startCleanupJob = () => {
    cron.schedule('0 * * * *', async () => {
      // 1. 查詢 isExpired=false 且 expireAt <= now 的紀錄
      const expiredImages = await MessageImage.findAll({
        where: { isExpired: false, expireAt: { [Op.lte]: new Date() } },
      });

      for (const img of expiredImages) {
        // 2. 刪除實體檔案目錄
        const dir = path.join('public/images/messageImage', img.imageId);
        await fs.rm(dir, { recursive: true, force: true });
        // 3. 更新 DB flag
        await img.update({ isExpired: true });
      }
    });
  };
  ```
- **修改**：`src/server.ts` 在伺服器啟動後呼叫 `startCleanupJob()`
- **驗收**：
  - 手動呼叫 callback，確認過期圖片目錄被刪除
  - MySQL isExpired 更新為 true
  - message 紀錄保留（前端可顯示「圖片已過期」）

---

## Progress Tracking

| Task | 狀態 | 說明 |
|------|------|------|
| TASK-001 | ✅ done | 安裝套件（2026-04-09）|
| TASK-002 | ✅ done | MessageImage Model（2026-04-09）|
| TASK-003 | ✅ done | Message Model 修改（2026-04-09）|
| TASK-004 | ✅ done | TypeScript 類型定義（2026-04-09）|
| TASK-005 | ✅ done | 路由骨架 + 掛載（2026-04-09）|
| TASK-006 | ✅ done | POST /uploads/init（2026-04-09）|
| TASK-007 | ✅ done | PUT /uploads/:uploadId（串流上傳）（2026-04-09）|
| TASK-008 | ✅ done | GET /uploads/:uploadId/status（2026-04-09）|
| TASK-009 | ✅ done | imageProcessor service（2026-04-09）|
| TASK-010 | ✅ done | finalizeUpload 整合（2026-04-09）|
| TASK-011 | ⬜ pending | DELETE /uploads/:uploadId |
| TASK-012 | ⬜ pending | GET /images/:imageId/meta |
| TASK-013 | ⬜ pending | Rate Limiters |
| TASK-014 | ⬜ pending | Cron Job 清理 |
