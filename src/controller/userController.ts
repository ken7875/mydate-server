import { Request, Response, NextFunction } from 'express';
// import jwt from 'jsonwebtoken';
import { errorHandler } from '@/utils/errorHandler';
import { catchAsyncController } from '@/utils/catchAsync';
import Users from '@/model/authModel';
import { Op } from 'sequelize';
// import sequelize from '../config/mysql';
import Friendship from '@/model/friendModal';
import redis from '@/config/redis';
import multer from 'multer';
import sharp from 'sharp';
import AppError from '@/utils/appError';
import { saveLocalFile } from '@/config/localStorage';

export const getUserByMail = async (email: string) => {
  // @mail.com會造曾mysql語法錯誤所以不能用樣板字面直
  // await sequelize.sync()

  const user = await Users.findOne({
    where: {
      email,
    },
  });

  return user;
};

export const findUserById = async (uuid: string) => {
  // const queryString = `SELECT * FROM users WHERE id=${id}`
  // const rows = await sql<GetUserResponse>(queryString);

  const user = await Users.findOne({
    where: {
      uuid,
    },
  });

  return user;
};

export const getUserByCondition = catchAsyncController(
  async (req: Request, res: Response) => {
    const { gender, age, limit = 10 } = req.query;
    const userUUID = req.user?.uuid;
    const formatGender = Number(gender);
    if (formatGender < 0 || formatGender > 1) {
      errorHandler({
        res,
        info: {
          code: 400,
          message: '性別輸入錯誤',
        },
        sendType: 'json',
      });

      return;
    }

    if (Array.isArray(age) && age?.length < 2) {
      errorHandler({
        res,
        info: {
          code: 400,
          message: '請輸入正確年齡區間',
        },
        sendType: 'json',
      });

      return;
    }

    const [minAge, maxAge] = age as string[];
    const cacheKey = `user:recommend:${userUUID}:${gender}:${minAge}:${maxAge}:${limit}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.status(200).json({
        status: 'success',
        message: 'success',
        code: 200,
        data: { list: JSON.parse(cached) },
      });
    }

    const friendList = await Friendship.findAll({
      where: {
        [Op.or]: [{ userId: req.user?.uuid }, { friendId: req.user?.uuid }],
      },
    });

    // 找出所有好友
    const friendsUUID = new Set();
    friendList.forEach((friend) => {
      // 好友列表內不包含自己的資料
      if (friend.dataValues.userId !== userUUID)
        friendsUUID.add(friend.dataValues.userId);
      if (friend.dataValues.friendId !== userUUID)
        friendsUUID.add(friend.dataValues.friendId);
    });
    const usersTotal = await Users.count({
      where: {
        uuid: {
          [Op.notIn]: Array.from(friendsUUID).concat(userUUID),
        },
        gender,
        age: {
          [Op.between]: [Number(minAge), Number(maxAge)],
        },
      },
    });

    const offset =
      usersTotal <= Number(limit)
        ? 0
        : Math.floor(Math.random() * (usersTotal - Number(limit) + 1));
    const users = await Users.findAll({
      where: {
        uuid: {
          [Op.notIn]: Array.from(friendsUUID).concat(userUUID),
        },
        gender,
        age: {
          [Op.between]: [Number(minAge), Number(maxAge)],
        },
      },
      offset,
      limit: Number(limit), // 只取25筆
    });

    await redis.set(cacheKey, JSON.stringify(users), 'EX', 300);

    res.status(200).json({
      status: 'success',
      message: 'success',
      code: 200,
      data: {
        list: users,
      },
    });
  },
);

export const uploadUserPhoto = (() => {
  const multerStorage = multer.memoryStorage();
  const upload = multer({
    storage: multerStorage,
    limits: {
      fileSize: 2 * 1024 * 1024, // 限制 2MB
    },
    fileFilter: (req, file, cb) => {
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new AppError('僅支援 JPG、PNG、WebP 格式', 400));
      }
    },
  });

  return upload.fields([
    { name: 'photo1', maxCount: 1 },
    { name: 'photo2', maxCount: 1 },
    { name: 'photo3', maxCount: 1 },
  ]);
})();

type PhotoFiles = {
  photo1?: Express.Multer.File[];
  photo2?: Express.Multer.File[];
  photo3?: Express.Multer.File[];
};

const PHOTO_SLOTS = [
  { key: 'photo1' as const, position: 0 },
  { key: 'photo2' as const, position: 1 },
  { key: 'photo3' as const, position: 2 },
];

export const reseizePhoto = catchAsyncController(
  async (req: Request, res: Response, next: NextFunction) => {
    const files = req.files as PhotoFiles;
    console.log(req.files, 'req.files');

    const activeSlots = PHOTO_SLOTS.filter(({ key }) => files[key]?.length);

    if (activeSlots.length === 0) {
      errorHandler({
        res,
        info: {
          code: 400,
          message: '請上傳至少一張照片',
        },
        sendType: 'json',
      });

      return;
    }

    // 取得或產生 uploadId（用於冪等上傳）
    const uploadId =
      (req.headers['x-upload-id'] as string) || `${req.user?.uuid}`;

    req.body.images = [];
    await Promise.all(
      activeSlots.map(async ({ key, position }) => {
        const photo = files[key]![0];
        // 檔名使用 uploadId + position，重試時會覆蓋同一檔案
        const fileName = `${uploadId}-${position}`;

        // sharp 圖片處理
        let buffer: Buffer;
        try {
          buffer = await sharp(photo.buffer)
            .resize(500, 750)
            .toFormat('jpeg')
            .jpeg({ quality: 90 })
            .toBuffer();
        } catch {
          throw new AppError(
            `photo${position + 1} 圖片處理失敗，請確認檔案是否損壞`,
            400,
          );
        }

        try {
          const url = await saveLocalFile(buffer, fileName);
          req.body.images.push({ position, url });
          return { position, url };
        } catch (err) {
          console.log(err, 'err');
          throw new AppError('圖片上傳失敗，請稍後重試', 502);
        }
      }),
    );

    next();
  },
);

export const saveAvatars = catchAsyncController(
  async (req: Request, res: Response) => {
    // 驗證 userId 參數（若存在）
    if (req.params.userId && req.params.userId !== req.user?.uuid) {
      return errorHandler({
        res,
        info: { code: 403, message: '無權限操作此用戶' },
        sendType: 'json',
      });
    }

    const user = await Users.findByPk(req.user?.uuid, {
      attributes: ['avatars'],
    });

    const avatars: string[] = Array.isArray(user?.avatars)
      ? [...user!.avatars]
      : ['', '', ''];

    // 依照 position 更新對應位置（支援部分更新與重試覆蓋）
    for (const { position, url } of req.body.images as {
      position: number;
      url: string;
    }[]) {
      avatars[position] = url;
    }

    await Users.update({ avatars }, { where: { uuid: req.user?.uuid } });

    res.status(200).json({
      status: 'success',
      message: 'set avatars success',
      avatarUrl: req.body.images.map(
        ({ url }: { position: number; url: string }) => url,
      ),
    });
  },
);

export const getAvatars = catchAsyncController(
  async (req: Request, res: Response) => {
    const userId = req.params.userId || req.user?.uuid;
    const user = await Users.findByPk(userId, {
      attributes: ['avatars'],
    });

    if (!user) {
      return res.status(400).json({
        status: 'fail',
        message: '找不到該使用者',
      });
    }

    const { avatars } = user.dataValues;

    res.status(200).json({
      status: 'success',
      data: avatars || [],
    });
  },
);

export const changeAvatarsOrder = catchAsyncController(
  async (req: Request, res: Response) => {
    if (req.params.userId && req.params.userId !== req.user?.uuid) {
      return errorHandler({
        res,
        info: { code: 403, message: '無權限操作此用戶' },
        sendType: 'json',
      });
    }

    const { order }: { order: number[] } = req.body;

    if (!Array.isArray(order) || order.length === 0) {
      return errorHandler({
        res,
        info: { code: 400, message: 'order 至少需包含一個元素' },
        sendType: 'json',
      });
    }

    const user = await Users.findByPk(req.user?.uuid, {
      attributes: ['avatars'],
    });

    const avatars: string[] = Array.isArray(user?.avatars)
      ? user!.avatars
      : ['', '', ''];

    const reordered = order.map((i) => avatars[i] ?? '');

    await Users.update(
      { avatars: reordered },
      { where: { uuid: req.user?.uuid } },
    );

    res.status(200).json({
      status: 'success',
      message: 'change avatars order success',
      data: { avatars: reordered },
    });
  },
);

// for(let i = 0; i < 200; i++) {
//   const age = Math.floor(18 + Math.random() * (55 - 18 + 1));
//   const uuid = crypto.randomUUID();
//   Users.create({
//     email: `testv${i}@mail.com`,
//     userName: `testvvv${i}`,
//     gender: Math.round(Math.random() * 1),
//     age,
//     password: 'Qq111111',
//     uuid,
//     isPasswordSign: true,
//     avatars: []
//   })
// }
