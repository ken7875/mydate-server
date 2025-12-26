import { Request, Response, NextFunction } from 'express';
import { errorHandler } from './errorHandler';

export const catchAsyncController =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next)?.catch(() => {
      errorHandler({
        res,
        info: {
          code: 400,
          message: '錯誤',
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
