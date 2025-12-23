// import { NextFunction, Request, Response } from "express";
// import { errorHandler } from '@/utils/errorHandler'
import { catchAsyncController } from '@/utils/catchAsync';
import Message from '@/model/messageModel';
import { MessageData } from '@/types/message';
import moment from 'moment';
import sequelize from '../config/mysql';
import { Op, QueryTypes } from 'sequelize';
import { errorHandler } from '@/utils/errorHandler';
import { WebSocketServer } from '@/server';

export const getMessage = catchAsyncController(async (req, res) => {
  const { senderId, receiverId, page = 1, pageSize = 100 } = req.query;

  const messages = await Message.findAll({
    where: {
      [Op.or]: [
        { senderId, receiverId }, // 自己傳給對方的訊息
        { senderId: receiverId, receiverId: senderId }, // 對方傳給自己的訊息
      ],
    },
    order: [['sendTime', 'ASC']], // 按 sendTime 降序排列
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
    data: {
      data: formatDataTime,
    },
  });
});

export const setMessage = async ({
  data: messageData,
  uuid,
}: {
  data: MessageData[];
  uuid: string;
}) => {
  try {
    const filterNeedData = messageData.map((data) => ({
      senderId: uuid,
      receiverId: data.receiverId,
      message: data.message,
      sendTime: moment(data.sendTime).format('YYYY-MM-DD HH:mm:ss'),
    }));

    await Message.bulkCreate(filterNeedData);
    WebSocketServer.sendToSpecifyUser({
      uuid: messageData.map((data) => data.receiverId),
      data: messageData,
      type: 'chatRoom',
      code: 'SUCCESS',
    });
  } catch (error) {
    console.log(error);
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
        ORDER BY sendTime DESC
      ) AS rn
    FROM message
    WHERE senderId = :userId OR receiverId = :userId
  ) t
  WHERE rn = 1
  ORDER BY sendTime DESC
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
