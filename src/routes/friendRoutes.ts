import express from 'express';
import {
  getFriends,
  inviteFriends,
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
router.route('/inviteFriends').post(verifyToken, inviteFriends);
router.route('/dislikeUser').post(verifyToken, dislikeUser);
router.route('/setFriendStatus').put(verifyToken, setFriendStatus);

export default router;
