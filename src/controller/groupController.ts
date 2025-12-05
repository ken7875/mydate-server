// import { Request, Response, NextFunction } from "express";
// import crypto from 'crypto';
// import { errorHandler } from '@/utils/errorHandler'
// import { catchAsyncController } from '@/utils/catchAsync';
// import * as Group from '@/model/groupModel'
// import * as Auth from '@/model/authModel';
// export const setGroup = catchAsyncController(async (req: Request, res: Response, next: NextFunction) => {
//   const { name, member, avatars } = req.body
//   const id = crypto.randomUUID();
//   const group = await Group.setGroup({ id, name, member, avatars })
//   console.log(group)
//   res.status(200).json({
//     status: 'success',
//     message: 'login success',
//     code: 200,
//     data: {
//       id,
//       name,
//       member,
//       avatars
//     },
//   })
// })

// export const getGroup = catchAsyncController(async (req: Request, res: Response, next: NextFunction) => {
//   const { uuid } = req.query
//   const gorup = await Group.getGroup({ uuid } as { uuid: string })

//   res.status(200).json({
//     status: 'success',
//     message: 'login success',
//     code: 200,
//     data: gorup,
//   })
// })
