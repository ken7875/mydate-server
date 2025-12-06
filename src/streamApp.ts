import express from 'express';
// import routes from '@/routes/index';
import { errorHandler } from '@/utils/errorHandler';
import ffmpegTools from './utils/ffmpeg';
import { catchAsyncController } from './utils/catchAsync';
const app = express();

app.post(
  '/start',
  catchAsyncController(async (req, res) => {
    const { uuid } = req.body;

    if (!uuid) {
      errorHandler({
        res,
        info: {
          code: 400,
          message: '沒有這個好友',
        },
        sendType: 'json',
      });

      return;
    }

    ffmpegTools.start(uuid);

    res.status(200).json({
      status: 'success',
      message: 'get message success',
      code: 200,
    });
  }),
);

app.post('/end', (req, res) => {
  const { uuid } = req.body;

  if (!uuid) {
    errorHandler({
      res,
      info: {
        code: 400,
        message: '沒有這個好友',
      },
      sendType: 'json',
    });

    return;
  }

  ffmpegTools.end({ uuid });
  res.json({
    status: 'success',
    message: 'get message success',
    code: 200,
  });
});

export default app;
