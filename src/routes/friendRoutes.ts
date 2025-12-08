import express from 'express';
import {
  getFriends,
  inviteFriend,
  dislikeUser,
  setFriendStatus,
  getFriend,
  getRequestUsers,
} from '@/controller/friendControll';
import { verifyToken } from '@/controller/authController';

const router = express.Router();

router.route('/').get(verifyToken, getFriends);
router.route('/requestUsers').get(verifyToken, getRequestUsers);
router.route('/:uuid').get(verifyToken, getFriend);
router.route('/inviteFriend').post(verifyToken, inviteFriend);
router.route('/dislikeUser').post(verifyToken, dislikeUser);
router.route('/setFriendStatus').put(verifyToken, setFriendStatus);

export default router;
