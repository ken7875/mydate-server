import express from 'express';
// import routes from '@/routes/index';
import { errorHandler } from '@/utils/errorHandler';
import ffmpegTools from './utils/ffmpeg';
import { catchAsyncController } from './utils/catchAsync';
import { verifyToken } from './controller/authController';
import { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

const app = express();
const corsConfig =
  process.env.NODE_ENV === 'production'
    ? {
        origin: [process.env.FRONT_END_HOST as string, 'http://0.0.0.0:3000'],
        // credentials: true,
      }
    : {
        origin: '*',
        // origin: [process.env.FRONT_END_HOST as string],
        // credentials: true,
      };
app.use(cors(corsConfig));
app.options('*', cors(corsConfig));
app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));
app.use(helmet());

app.post(
  '/api/stream/start',
  verifyToken,
  catchAsyncController(async (req, res) => {
    const { uuid } = req.body;
    console.log(uuid, 'uuid');

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

app.post('/api/stream/end', verifyToken, (req, res) => {
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

// 將 public 資料夾設置為靜態資源
app.use('/public', express.static('public'));

app.all('*', (req, res) => {
  errorHandler({
    res,
    info: {
      code: 404,
      message: `Can't find ${req.originalUrl} on this server!`,
    },
    sendType: 'json',
  });
});

app.use((err: any, req: Request, res: Response) => {
  res.json({
    status: err.status,
    code: err.code,
    message: err.message,
  });
});

export default app;
