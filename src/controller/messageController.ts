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
  const { roomId, page = 1, pageSize = 100 } = req.query;

  // 可用 cursor 游標分頁取代 offset 偏移分頁，效能更好
  const messages = await Message.findAll({
    where: {
      roomId,
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
      roomId,
    },
  });

  const formatDataTime = messages.map((message) => ({
    ...message.dataValues,
    sendTime: +message.dataValues.sendTime,
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
// for (let i = 1; i <= 500; i++) {
//   a.push({
//     senderId: 'e48cc509-e81f-4dac-8156-ebf246833562',
//     receiverId: '1181516f-28a9-4337-8d47-e132d12b8316',
//     message: i,
//     sendTime: moment(Date.now()).format('YYYY-MM-DD HH:mm:ss'),
//     status: 'success',
//     localId: crypto.randomUUID(),
//     roomId: '101',
//   });
// }
// Message.bulkCreate(a);

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
    sendTime: moment(Number(data.sendTime) * 1000).format(
      'YYYY-MM-DD HH:mm:ss',
    ),
    status: data.status,
    localId: data.localId,
    roomId: data.roomId,
  }));

  const filterNeedDataForClient = filterNeedData.map((data) => ({
    ...data,
    sendTime: moment(Number(data.sendTime) * 1000).unix(),
  }));

  let friend: Awaited<ReturnType<typeof Friendship.findOne>> = null;

  try {
    friend = await Friendship.findOne({
      where: {
        id: messageData[0].roomId,
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

    await Message.bulkCreate(
      filterNeedData.map((d) => ({ ...d, roomId: friend?.dataValues.id })),
    );

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
          type: 'text',
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
          type: 'text',
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
          type: 'text',
          status: 'failed',
        })),
      },
    });
  }
};

export const getPreviewMessage = catchAsyncController(async (req, res) => {
  const userId = req.user.uuid;

  const friendships = await Friendship.findAll({
    where: {
      [Op.or]: [{ userId }, { friendId: userId }],
    },
    attributes: ['id'],
  });

  if (!friendships.length) {
    return res.status(200).json({
      status: 'success',
      message: 'get message success',
      code: 200,
      data: {},
    });
  }

  const roomIds = friendships.map((f) => f.id);

  const messages: MessageData[] = await sequelize.query(
    `SELECT m.*
     FROM message m
     INNER JOIN (
       SELECT roomId, MAX(seq) AS maxSeq
       FROM message
       WHERE roomId IN (:roomIds)
       GROUP BY roomId
     ) t ON m.roomId = t.roomId AND m.seq = t.maxSeq
     ORDER BY m.sendTime DESC, m.seq DESC`,
    {
      replacements: { roomIds },
      type: QueryTypes.SELECT,
    },
  );

  const groupByRoomId = Object.fromEntries(
    messages.map((msg) => [
      msg.roomId,
      { ...msg, sendTime: +msg.sendTime / 1000 },
    ]),
  );

  res.status(200).json({
    status: 'success',
    message: 'get message success',
    code: 200,
    data: groupByRoomId,
  });
});

export const markAsRead = catchAsyncController(async (req, res) => {
  const { roomId, sendTime } = req.body;
  // 2. 把比它早的訊息設為已讀（雙方對話）
  await Message.update(
    { isRead: true },
    {
      where: {
        roomId,
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

export const getUnreadTotal = catchAsyncController(async (req, res) => {
  const userId = req.user.uuid;

  const friendships = await Friendship.findAll({
    where: {
      [Op.or]: [{ userId }, { friendId: userId }],
    },
    attributes: ['id'],
  });

  if (!friendships.length) {
    return res.status(200).json({
      status: 'success',
      message: 'success',
      code: 200,
      data: { total: 0 },
    });
  }

  const roomIds = friendships.map((f) => f.id);

  const total = await Message.count({
    where: {
      roomId: { [Op.in]: roomIds },
      isRead: false,
      senderId: { [Op.ne]: userId },
    },
  });

  res.status(200).json({
    status: 'success',
    message: 'success',
    code: 200,
    data: { total },
  });
});

export const getUnreadCount = catchAsyncController(async (req, res) => {
  const { roomIds } = req.query;
  const userId = req.user.uuid;

  if (!roomIds?.length) {
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
      roomId: {
        [Op.in]: !Array.isArray(roomIds) ? [roomIds] : roomIds,
      },
      isRead: false,
      senderId: { [Op.ne]: userId },
    },
    order: [['sendTime', 'DESC']],
  });

  const unReadMessageCountObj = unreadMessages.reduce(
    (acc, cur) => {
      const { roomId } = cur;
      acc[roomId] = acc[roomId] || { count: 0 };
      acc[roomId].count++;

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
