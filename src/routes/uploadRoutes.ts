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

router.post('/init', verifyToken, initUpload);
router.put('/:uploadId/:localId/chunk', verifyToken, uploadChunk);
router.get('/:uploadId/status', verifyToken, getUploadStatus);
router.delete('/:uploadId', verifyToken, cancelUpload);

export default router;
