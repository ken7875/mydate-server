import express from 'express';
import {
  getMessage,
  getPreviewMessage,
  markAsRead,
  getUnreadCount,
  getUnreadTotal,
} from '@/controller/messageController';
import { verifyToken } from '@/controller/authController';

const router = express.Router();

router.get('/', verifyToken, getMessage);
router.get('/previewMessage', verifyToken, getPreviewMessage);
router.put('/read', verifyToken, markAsRead);
router.get('/unReadCount', verifyToken, getUnreadCount);
router.get('/unreadTotal', verifyToken, getUnreadTotal);

export default router;
