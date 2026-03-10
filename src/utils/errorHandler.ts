import { Response } from 'express';

export const errorHandler = <T>({
  res,
  info,
  sendType,
}: {
  res: Response;
  info: {
    status?: 'fail';
    code: number;
    message: string | number;
    data?: T;
    errorCode?: string;
  };
  sendType: T extends string ? 'send' : 'json';
}) => {
  // res.status(info.code)[sendType](info.data)
  info.status = 'fail';
  res.status(info.code)[sendType](info);
};
