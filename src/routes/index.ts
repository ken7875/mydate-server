// import group from './groupRoutes'
import auth from './authRoutes';
import user from './usersRoutes';
import friend from './friendRoutes';
import message from './messageRoute';
import express from 'express';
import stream from './streamRoutes';

const router = express.Router();

// router.use('/group', group)
router.use('/auth', auth);
router.use('/user', user);
router.use('/friends', friend);
router.use('/message', message);
router.use('/stream', stream);

export default router;
