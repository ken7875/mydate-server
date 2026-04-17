import express from 'express';
import { verifyToken } from '@/controller/authController';
import {
  initUpload,
  uploadChunk,
  getUploadStatus,
  cancelUpload,
} from '@/controller/uploadController';
import {
  initUploadLimiter,
  chunkUploadLimiter,
} from '@/middleware/rateLimiters';

const router = express.Router();

router.post('/init', verifyToken, initUploadLimiter, initUpload);
router.put(
  '/:uploadId/:localId/chunks/:chunkIndex',
  verifyToken,
  chunkUploadLimiter,
  express.raw({ type: 'application/octet-stream', limit: '2mb' }),
  uploadChunk,
);
router.get('/:uploadId/status', verifyToken, getUploadStatus);
router.delete('/:uploadId', verifyToken, cancelUpload);

export default router;
