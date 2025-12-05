import { Request, Response } from 'express';
// import jwt from 'jsonwebtoken';
import { errorHandler } from '@/utils/errorHandler';
import { catchAsyncController } from '@/utils/catchAsync';
import Users from '@/model/authModel';
import { Op } from 'sequelize';
// import sequelize from '../config/mysql';
import Friendship from '@/model/friendModal';

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

    const friendList = await Friendship.findAll({
      where: {
        [Op.or]: [{ userId: req.user?.uuid }, { friendId: req.user?.uuid }],
      },
    });

    const friendsUUID = new Set();
    friendList.forEach((friend) => {
      if (friend.dataValues.userId !== userUUID)
        friendsUUID.add(friend.dataValues.userId);
      if (friend.dataValues.friendId !== userUUID)
        friendsUUID.add(friend.dataValues.friendId);
    });

    const [minAge, maxAge] = age as string[];
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

    // TODO for test
    // const usercc = await Users.findOne({
    //   where: {
    //     uuid: '1181516f-28a9-4337-8d47-e132d12b8316'
    //   }
    // })
    // users.unshift(usercc!)
    setTimeout(() => {
      res.status(200).json({
        status: 'success',
        message: 'success',
        code: 200,
        data: {
          list: users,
        },
      });
    }, 2000);
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
