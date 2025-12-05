// import 'module-alias/register';
import express from 'express';
import { createStreamRoom, getAllRoom } from '@/controller/stream';
import { verifyToken } from '@/controller/authController';

// import { setCode, veriyfyCodeHandler, sendVcodeToMail } from '@/controller/registerCodeController'

const router = express.Router();

router.get('/getRooms', verifyToken, getAllRoom);
router.post('/createRoom', verifyToken, createStreamRoom);
// router.get('/close', verifyToken, closeStream);

// router.post('/signMail', checkEmailRepeat, setCode, sendVcodeToMail)
// router.post('/verfiyCode', veriyfyCodeHandler)
// router.post('/register', veriyfyCodeHandler, register)

export default router;
