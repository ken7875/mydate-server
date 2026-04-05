// import 'module-alias/register';
import express from 'express';
import {
  loginMethods,
  loginWithEmail,
  setUserPassword,
  setUserInfo,
  getUserInfo,
  verifyToken,
} from '@/controller/authController';

// import { setCode, veriyfyCodeHandler, sendVcodeToMail } from '@/controller/registerCodeController'

const router = express.Router();

router.get('/userInfo', verifyToken, getUserInfo);
router.post('/loginMethods', loginMethods);
router.post('/loginWithEmail', loginWithEmail);
router.put('/password', verifyToken, setUserPassword);
router.put('/userInfo', verifyToken, setUserInfo);

// router.post('/signMail', checkEmailRepeat, setCode, sendVcodeToMail)
// router.post('/verfiyCode', veriyfyCodeHandler)
// router.post('/register', veriyfyCodeHandler, register)

export default router;
