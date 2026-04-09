import express from 'express';
import { verifyToken } from '@/controller/authController';
import { getImageMeta } from '@/controller/imageController';
import { imageReadLimiter } from '@/middleware/rateLimiters';

const router = express.Router();

router.get('/:imageId/meta', verifyToken, imageReadLimiter, getImageMeta);

export default router;
