// import { catchAsyncController } from '@/utils/catchAsync';
// import { Request, Response } from "express";
import { errorHandler } from '@/utils/errorHandler';
// import { Op } from 'sequelize';
// import Users from '@/model/authModel';
import Friendship from '@/model/friendModal';
import Users from '@/model/authModel';
import { Request, Response } from 'express';
import { catchAsyncController } from '@/utils/catchAsync';
import { ValidationError, WhereOptions } from 'sequelize';
import { FriendStatus } from '@/enums/friends';
import { Op } from 'sequelize';
import { WebSocketServer } from '@/server';

// Friendship.truncate({ cascade: true });
// 好友系統相關函數
const createFriend = async ({
  userId,
  friendId,
  status,
}: {
  userId: string;
  friendId: string;
  status: FriendStatus;
}) => await Friendship.create({ userId, friendId, status });

// invite friends
export const inviteFriend = catchAsyncController(
  async (req: Request, res: Response) => {
    const { friendId, status }: { friendId: string; status: FriendStatus } =
      req.body;

    if (!friendId || friendId.length === 0) {
      errorHandler({
        res,
        info: {
          code: 400,
          message: '請輸入要加入好友的id',
        },
        sendType: 'json',
      });

      return;
    }

    if (status === undefined || !(status in FriendStatus)) {
      errorHandler({
        res,
        info: {
          code: 400,
          message: '請給予正確的好友狀態',
        },
        sendType: 'json',
      });
      return;
    }

    try {
      await createFriend({ userId: req.user?.uuid, friendId, status });
      const userData = await Users.findOne({
        where: {
          uuid: req.user?.uuid,
        },
      });

      WebSocketServer.sendToSpecifyUser({
        data: { ...userData?.dataValues, status },
        code: 'SUCCESS',
        type: 'inviteFriend',
        uuid: [friendId],
      });
    } catch (error) {
      if (
        (error as ValidationError).name === 'SequelizeUniqueConstraintError'
      ) {
        errorHandler({
          res,
          info: {
            code: 400,
            message: '此人已經是好友了',
          },
          sendType: 'json',
        });

        return;
      }
    }

    res.status(200).json({
      status: 'success',
      message: 'add friend success',
      code: 200,
    });
  },
);

// 非好友狀態不喜歡
export const dislikeUser = catchAsyncController(
  async (req: Request, res: Response) => {
    const { friendId } = req.body;

    await createFriend({
      userId: req.user?.uuid,
      friendId,
      status: 2,
    });

    res.status(200).json({
      status: 'success',
      message: 'reject invite success',
      code: 200,
    });
  },
);

// 設定好友狀態
export const setFriendStatus = catchAsyncController(
  async (req: Request, res: Response) => {
    const { status, friendId, userId } = req.body;
    if (status === FriendStatus.Pending) {
      errorHandler({
        res,
        info: {
          code: 400,
          message: '請設定正確的狀態',
        },
        sendType: 'json',
      });

      return;
    }

    if (status > 3) {
      errorHandler({
        res,
        info: {
          code: 400,
          message: '狀態錯誤',
        },
        sendType: 'json',
      });

      return;
    }

    // const searchQuery =
    //   status === FriendStatus.Success
    //     ? {
    //         userId: friendId as string,
    //         friendId: req.user?.uuid as string,
    //       }
    //     : {
    //         userId: req.user?.uuid as string,
    //         friendId: friendId as string,
    //       };

    const searchQuery = {
      userId: userId as string,
      friendId: friendId as string,
    };

    const friendData = await Friendship.findOne({
      where: searchQuery,
    });

    const userData = await Users.findOne({
      where: {
        uuid: searchQuery.userId,
      },
    });

    WebSocketServer.sendToSpecifyUser({
      data: { ...userData?.dataValues, status },
      type: 'setFriendStatus',
      code: 'SUCCESS',
      uuid: [friendId],
    });

    if (!friendData) {
      errorHandler({
        res,
        info: {
          code: 400,
          message: '沒有這個用戶',
        },
        sendType: 'json',
      });

      return;
    }

    await Friendship.update(
      {
        status,
      },
      {
        where: searchQuery,
      },
    );

    res.status(200).json({
      status: 'success',
      message: "set friend's status success",
      code: 200,
    });
  },
);

// 取得已加入的好友
export const getFriends = catchAsyncController(
  async (req: Request, res: Response) => {
    const { page = 1, pageSize = 25, userName = '' } = req.query;
    const myId = req.user!.uuid;
    const trimUserName = (userName as string)?.trim();
    const where: WhereOptions = {
      status: FriendStatus.Success,
      [Op.or]: [{ userId: myId }, { friendId: myId }],
      ...(trimUserName && {
        [Op.and]: [
          {
            [Op.or]: [
              {
                userId: myId,
                // $receiver.userName$, $為綁定到 JOIN 表欄位的正式通道
                // // %${trimUserName}%只要包含即可 ${trimUserName}%以trimUserName開頭 %以trimUserName結尾以trimUserName結尾
                '$receiver.userName$': { [Op.like]: `%${trimUserName}%` },
              },
              {
                friendId: myId,
                '$requester.userName$': { [Op.like]: `%${trimUserName}%` },
              },
            ],
          },
        ],
      }),
    };
    const friendData = await Friendship.findAll({
      where,
      include: [
        {
          model: Users,
          as: 'receiver',
          attributes: ['uuid', 'userName', 'avatars'],
          required: false,
        },
        {
          model: Users,
          as: 'requester',
          attributes: ['uuid', 'userName', 'avatars'],
          required: false,
        },
      ],
      order: [['messageUpdatedAt', 'DESC']],
      limit: Number(pageSize), // 只取25筆
      offset: (Number(page) - 1) * Number(pageSize),
    });

    const friendTotal = await Friendship.count({
      where: {
        [Op.or]: {
          userId: req.user?.uuid,
          friendId: req.user?.uuid,
        },
        status: FriendStatus.Success,
      },
    });

    const data = friendData.map((friend) => {
      const userData =
        friend.friendId === req.user?.uuid
          ? friend.dataValues.requester.dataValues
          : friend.dataValues.receiver.dataValues;

      return {
        ...userData,
        status: friend.dataValues.status,
        avatars: userData.avatars.map((avatar: string) => avatar + '.jpeg'),
      };
    });

    res.status(200).json({
      status: 'success',
      total: friendTotal,
      page: Number(page),
      pageSize: Number(pageSize),
      message: 'add friend success',
      code: 200,
      data: {
        data,
      },
    });
  },
);

export const getRequestUsers = catchAsyncController(
  async (req: Request, res: Response) => {
    const { page = 1, pageSize = 25 } = req.query;
    const friendData = await Friendship.findAll({
      where: {
        friendId: req.user?.uuid as string,
        status: 0,
      },
      attributes: ['status'],
      include: [
        {
          model: Users,
          as: 'requester',
          attributes: [
            'uuid',
            'userName',
            'age',
            'gender',
            'description',
            'avatars',
          ],
        },
        {
          model: Users,
          as: 'receiver',
          attributes: ['uuid', 'userName', 'avatars', 'avatars'],
        },
      ],
      limit: Number(pageSize), // 只取25筆
      offset: (Number(page) - 1) * Number(pageSize),
    });

    const data = friendData.map((friend) => ({
      status: friend.dataValues.status,
      ...friend.dataValues.requester.dataValues,
    }));

    res.status(200).json({
      status: 'success',
      message: 'add request user success',
      code: 200,
      data: {
        data,
      },
    });
  },
);

// 取得特定好友
export const getFriend = catchAsyncController(
  async (req: Request, res: Response) => {
    const { uuid } = req.params;

    const myId = req.user?.uuid as string;
    const friendData = await Friendship.findOne({
      where: {
        [Op.or]: [
          { userId: myId, friendId: uuid },
          { userId: uuid, friendId: myId },
        ],
      },
      attributes: ['status', 'userId', 'friendId'],
      include: [
        {
          model: Users,
          as: 'receiver',
          attributes: ['uuid', 'userName', 'avatars'],
        },
        {
          model: Users,
          as: 'requester',
          attributes: ['uuid', 'userName', 'avatars'],
        },
      ],
    });

    if (!friendData) {
      errorHandler({
        res,
        info: {
          code: 400,
          message: '沒有這個好友',
          errorCode: 'NO_THIS_FRIEND',
        },
        sendType: 'json',
      });

      return;
    }

    const userData =
      friendData.friendId === myId
        ? friendData.dataValues.requester.dataValues
        : friendData.dataValues.receiver.dataValues;

    res.status(200).json({
      status: 'success',
      message: 'add friend success',
      code: 200,
      data: {
        data: {
          status: friendData.dataValues.status,
          ...userData,
        },
      },
    });
  },
);

export const updateFriend = async ({
  userId,
  friendId,
  column,
}: {
  userId: string;
  friendId: string;
  column: Record<string, string>;
}) => {
  try {
    await Friendship.update(column, {
      where: {
        [Op.or]: [
          { userId, friendId },
          { userId: friendId, friendId: userId },
        ],
      },
    });
  } catch (error) {
    console.error('update friend fail!!:', error);
  }
};
