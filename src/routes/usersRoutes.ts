// import 'module-alias/register';
import express from 'express';
import {
  getUserByCondition,
  uploadUserPhoto,
  reseizePhoto,
  saveAvatars,
  getAvatars,
  changeAvatarsOrder,
} from '@/controller/userController';
import { verifyToken } from '@/controller/authController';

// import { setCode, veriyfyCodeHandler, sendVcodeToMail } from '@/controller/registerCodeController'

const router = express.Router();

router.get('/', verifyToken, getUserByCondition);

router.post(
  '/:userId/avatars',
  verifyToken,
  uploadUserPhoto,
  reseizePhoto,
  saveAvatars,
);

router.get('/:userId/avatars', verifyToken, getAvatars);
router.put('/:userId/avatars/order', verifyToken, changeAvatarsOrder);

// router.post('/signMail', checkEmailRepeat, setCode, sendVcodeToMail)
// router.post('/verfiyCode', veriyfyCodeHandler)
// router.post('/register', veriyfyCodeHandler, register)

export default router;
