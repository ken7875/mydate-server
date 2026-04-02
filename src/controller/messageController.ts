// import { NextFunction, Request, Response } from "express";
import { catchAsyncController } from '@/utils/catchAsync';
import Message from '@/model/messageModel';
import { MessageData } from '@/types/message';
import moment from 'moment';
import sequelize from '../config/mysql';
import { Op, QueryTypes } from 'sequelize';
import { errorHandler } from '@/utils/errorHandler';
import { WebSocketServer } from '@/server';
import Friendship from '@/model/friendModal';
import Users from '@/model/authModel';
import { updateFriend } from '@/controller/friendControll';

export const getMessage = catchAsyncController(async (req, res) => {
  const { senderId, receiverId, page = 1, pageSize = 100 } = req.query;

  // 可用 cursor 游標分頁取代 offset 偏移分頁，效能更好
  const messages = await Message.findAll({
    where: {
      [Op.or]: [
        { senderId, receiverId }, // 自己傳給對方的訊息
        { senderId: receiverId, receiverId: senderId }, // 對方傳給自己的訊息
      ],
    },
    order: [
      ['sendTime', 'DESC'],
      ['seq', 'DESC'], // sendTime 相同時以寫入順序穩定排序
    ],
    limit: Number(pageSize), // 只取25筆
    offset: (Number(page) - 1) * Number(pageSize),
  });

  const MessageTotal = await Message.count({
    where: {
      [Op.or]: [
        { senderId, receiverId }, // 自己傳給對方的訊息
        { senderId: receiverId, receiverId: senderId }, // 對方傳給自己的訊息
      ],
    },
  });

  const formatDataTime = messages.map((message) => ({
    ...message.dataValues,
    sendTime: +message.dataValues.sendTime / 1000,
  }));

  res.status(200).json({
    status: 'success',
    message: 'get message success',
    code: 200,
    total: MessageTotal,
    page: Number(page),
    pageSize: Number(pageSize),
    data: {
      data: formatDataTime,
    },
  });
});

// TODO test data
// const a = [];
// for (let i = 1; i <= 100; i++) {
//   a.push({
//     senderId: 'e48cc509-e81f-4dac-8156-ebf246833562',
//     receiverId: '1181516f-28a9-4337-8d47-e132d12b8316',
//     message: i,
//     sendTime: moment(Date.now()).format('YYYY-MM-DD HH:mm:ss'),
//     status: 'success',
//     localId: crypto.randomUUID(),
//   });
// }
// Message.bulkCreate(a);

// TODO 實作收到新訊息後更改好友順序功能
export const setMessage = async ({
  data: messageData,
  uuid,
}: {
  data: MessageData[];
  uuid: string;
}) => {
  const filterNeedData = messageData.map((data) => ({
    senderId: uuid,
    receiverId: data.receiverId,
    message: data.message,
    sendTime: moment(data.sendTime).format('YYYY-MM-DD HH:mm:ss'),
    status: data.status,
    localId: data.localId,
  }));

  const filterNeedDataForClient = filterNeedData.map((data) => ({
    ...data,
    sendTime: moment(data.sendTime).unix(),
  }));

  let friend: Awaited<ReturnType<typeof Friendship.findOne>> = null;

  try {
    friend = await Friendship.findOne({
      where: {
        [Op.or]: [
          { userId: messageData[0].receiverId, friendId: uuid },
          { userId: uuid, friendId: messageData[0].receiverId },
        ],
      },
      attributes: ['status', 'id'],
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

    await Message.bulkCreate(filterNeedData);

    // 傳給接收者
    WebSocketServer.sendToSpecifyUser({
      uuid: messageData.map((data) => data.receiverId),
      data: {
        roomId: friend?.dataValues.id,
        user: {
          status: friend?.dataValues.status,
          ...(friend?.dataValues.requester.uuid === uuid
            ? friend?.dataValues.requester.dataValues
            : friend?.dataValues.receiver.dataValues),
        },
        message: filterNeedDataForClient.map((message) => ({
          ...message,
          status: 'success',
        })),
      },
      type: 'chatRoom',
      code: 'SUCCESS',
    });

    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    updateFriend({
      userId: uuid,
      friendId: messageData[0].receiverId,
      column: {
        messageUpdatedAt: now,
      },
    });

    // 傳給傳送者(告訴他訊息發送成功或失敗)
    WebSocketServer.sendToSpecifyUser({
      uuid: [uuid],
      type: 'chatRoom',
      code: 'SUCCESS',
      data: {
        roomId: friend?.dataValues.id,
        user: {
          status: friend?.dataValues.status,
          ...(friend?.dataValues.requester.uuid === uuid
            ? friend?.dataValues.requester.dataValues
            : friend?.dataValues.receiver.dataValues),
        },
        message: filterNeedDataForClient.map((message) => ({
          ...message,
          status: 'success',
        })),
      },
    });
  } catch (error) {
    console.log(error);
    WebSocketServer.sendToSpecifyUser({
      uuid: [uuid],
      type: 'chatRoom',
      code: 'FAIL',
      data: {
        roomId: friend?.dataValues.id,
        user: {
          status: friend?.dataValues.status,
          ...(friend?.dataValues.requester.uuid === uuid
            ? friend?.dataValues.requester.dataValues
            : friend?.dataValues.receiver.dataValues),
        },
        message: filterNeedDataForClient.map((message) => ({
          ...message,
          status: 'failed',
        })),
      },
    });
  }
};

export const getPreviewMessage = catchAsyncController(async (req, res) => {
  const userId = req.user.uuid;

  const sql = `
  SELECT
    senderId,
    receiverId,
    message,
    sendTime,
    CASE
      WHEN senderId = :userId THEN receiverId
      ELSE senderId
    END AS friendId
  FROM (
    SELECT *,
      LEAST(senderId, receiverId) AS user1,
      GREATEST(senderId, receiverId) AS user2,
      ROW_NUMBER() OVER (
        PARTITION BY LEAST(senderId, receiverId), GREATEST(senderId, receiverId)
        ORDER BY sendTime DESC, seq DESC
      ) AS rn
    FROM message
    WHERE senderId = :userId OR receiverId = :userId
  ) t
  WHERE rn = 1
  ORDER BY sendTime DESC, seq DESC
`;
  const messages: MessageData[] = await sequelize.query(sql, {
    replacements: { userId },
    type: QueryTypes.SELECT,
  });

  const groupByFriendId = Object.fromEntries(
    messages.map((msg) => {
      const friendId = msg.senderId === userId ? msg.receiverId : msg.senderId;
      return [friendId, { ...msg, sendTime: +msg.sendTime / 1000 }];
    }),
  );

  res.status(200).json({
    status: 'success',
    message: 'get message success',
    code: 200,
    data: groupByFriendId,
  });
});

export const markAsRead = catchAsyncController(async (req, res) => {
  const receiverId = req?.user?.uuid;
  const { senderId, sendTime } = req.body;
  // 2. 把比它早的訊息設為已讀（雙方對話）
  await Message.update(
    { isRead: true },
    {
      where: {
        receiverId, // 你是接收者
        senderId,
        isRead: false,
        sendTime: {
          [Op.lte]: new Date(sendTime * 1000), // ✅ JS timestamp 轉 Date
        },
      },
    },
  );

  res.status(200).json({
    status: 'success',
    message: 'success',
    code: 200,
    data: null,
  });
});

export const getUnreadCount = catchAsyncController(async (req, res) => {
  const { friendIds } = req.query;

  if (!friendIds?.length) {
    errorHandler({
      res,
      info: {
        code: 400,
        message: '請提供要查詢的用戶ID',
      },
      sendType: 'json',
    });

    return;
  }

  const unreadMessages = await Message.findAll({
    where: {
      receiverId: req?.user?.uuid,
      senderId: {
        [Op.in]: !Array.isArray(friendIds) ? [friendIds] : friendIds,
      },
      isRead: false,
    },
    order: [['sendTime', 'DESC']], // 可選：排序
  });

  const unReadMessageCountObj = unreadMessages.reduce(
    (acc, cur) => {
      const { senderId } = cur;
      acc[senderId] = acc[senderId] || { count: 0 };
      acc[senderId].count++;

      return acc;
    },
    {} as Record<string, { count: number }>,
  );

  res.status(200).json({
    status: 'success',
    message: 'success',
    code: 200,
    data: unReadMessageCountObj,
  });
});
