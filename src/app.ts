import express from 'express';
import { router } from '@/routes/index';
import { errorHandler } from '@/utils/errorHandler';
import { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

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

const app = express();
app.use(cors(corsConfig));
app.options('*', cors(corsConfig));
app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));
app.use(helmet());
app.use('/api', router);

// 將 public 資料夾設置為靜態資源
app.use('/public', express.static('public'));
app.all('*', (req, res) => {
  console.log('HOST:', req.headers.host);
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
