import { Request, Response, NextFunction } from 'express';
import { errorHandler } from './errorHandler';
import AppError from './appError';

export const catchAsyncController =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next)?.catch((err) => {
      console.error(err);

      // AppError 為已知業務錯誤，直接傳遞訊息與狀態碼
      if (err instanceof AppError) {
        return errorHandler({
          res,
          info: {
            code: err.statusCode,
            message: err.message,
          },
          sendType: 'json',
        });
      }

      // 非預期錯誤：開發環境回傳原始訊息，生產環境回傳通用訊息
      const isDev = process.env.NODE_ENV !== 'production';
      errorHandler({
        res,
        info: {
          code: 500,
          message: isDev
            ? err.message || '伺服器內部錯誤'
            : '伺服器內部錯誤，請稍後再試',
          errorCode: 'INTERNAL_ERROR',
        },
        sendType: 'json',
      });
    });
  };

// export const catchAsyncSql = <T>(fn: () => Promise<T> | void, next: NextFunction): any => () => {
//     return fn()?.catch((err) => {
//         next(new AppError('server error!!', 500))
//         console.log(`sql error: ${err}`)

//         return
//     })
// }
