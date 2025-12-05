import Users from '@/model/authModel';
// import jwt from 'jsonwebtoken';
import { errorHandler } from '@/utils/errorHandler';
import { catchAsyncController } from '@/utils/catchAsync';
// import ffmpegTool from '@/utils/ffmpeg';
// import redis from '@/config/redis';
import moment from 'moment';
import { WebSocketServer } from '@/server';
import Ffmpeg from '@/utils/ffmpeg';
import { watch, FSWatcher, promises as fsPromises, existsSync } from 'fs';
import { join } from 'path';
import RoomModel from '@/model/roomModel';

interface StreamRoomData {
  title: string;
  description: string;
  image: string;
  uuid: string;
  startTime: string;
}

const roomBoardcast = <T>({
  data,
  uuid,
  type,
}: {
  data: T;
  uuid: string;
  type: string;
}) => {
  const audiences = [...WebSocketServer.clientsMap.keys()].filter(
    (clientId) => clientId !== uuid,
  );
  WebSocketServer.broadcast(
    Buffer.from(JSON.stringify({ type, data })),
    audiences,
  );
};

// const getAllRoomInRedis = async () => {
//   // TODO 之後改為取redis資料
//   const cursor = '0';
//   const [currentCursor, roomKeys] = await redis.scan(
//     cursor,
//     'MATCH',
//     'liveRoom:*',
//     'COUNT',
//     20,
//   );

//   const data = rooms.map((room) => room.split(':')[1]);
//   const rooms = await redis.mget(...roomKeys);
//   const data = rooms.map((room) => JSON.parse(room!));
// }

const getAllRoomInMySql = async () => {
  const data = await RoomModel.findAll();
  return data;
};

export const getAllRoom = catchAsyncController(async (req, res) => {
  if (!req?.user?.uuid) {
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
  // const { uuid } = req.query;
  const data = await getAllRoomInMySql();

  res.status(200).json({
    status: 'success',
    data,
  });
});

// const createRoomDataInDb = async (req) => {
//   const { title, description, image } = req.body;
//   const key = `liveRoom:${req.user?.uuid}`;
//   // 存成 JSON 字串
//   const data = {
//     title,
//     description,
//     image,
//     uuid: req?.user?.uuid,
//     startTime: moment().format('YYYY-MM-DD HH:mm:ss'),
//   };

//   return await redis.set(key, JSON.stringify(data), 'EX', 60 * 60 * 2); // 設定 2 小時過期
// }

const createRoomDataInDb = async (data: StreamRoomData) => {
  const room = await RoomModel.create({
    ...data,
  });

  return room;
};

const checkAndBroadcastRoom = async (
  m3u8Folder: string,
  broadcastData: { data: StreamRoomData; type: string; uuid: string },
) => {
  try {
    const files = await fsPromises.readdir(m3u8Folder);
    const tsFiles = files.filter((f) => f.endsWith('.ts'));

    if (tsFiles.length >= 2) {
      roomBoardcast(broadcastData);
      return true; // 表示已廣播
    }
    return false; // 表示尚未廣播
  } catch (error) {
    // 如果資料夾不存在或讀取失敗，也視為尚未準備好
    console.error(`Error reading m3u8 folder: ${m3u8Folder}`, error);
    return false;
  }
};

let watcher: FSWatcher | null = null;
const waitForHlsAndBroadcast = async (
  m3u8Folder: string,
  broadcastData: { data: StreamRoomData; type: string; uuid: string },
) => {
  const isReady = await checkAndBroadcastRoom(m3u8Folder, broadcastData);
  if (isReady) {
    return;
  }

  // 如果尚未準備好，則設定監聽器
  watcher = watch(m3u8Folder, async (eventType) => {
    if (eventType === 'rename') {
      const done = await checkAndBroadcastRoom(m3u8Folder, broadcastData);
      if (done) {
        watcher?.close?.();
      }
    }
  });
};

export const createStreamRoom = catchAsyncController(async (req, res) => {
  const uuid = req?.user?.uuid;
  if (!uuid) {
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

  const user = Users.findOne({
    where: {
      uuid,
    },
  });

  if (!user) {
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

  const { title, description, image } = req.body;
  const data = {
    title,
    description,
    image,
    uuid: req?.user?.uuid,
    startTime: moment().format('YYYY-MM-DD HH:mm:ss'),
  };

  Ffmpeg.start(req?.user?.uuid);

  // setRoomInRedis
  const room = await createRoomDataInDb(data);

  const m3u8Folder = join(
    __dirname,
    '../../public/source-m3u8',
    req?.user?.uuid,
  );

  // 將檢查與廣播邏輯移交給非同步函式，不阻塞當前請求的回應
  waitForHlsAndBroadcast(m3u8Folder, {
    data,
    type: 'addRoom',
    uuid,
  });

  res.status(200).json({
    status: 'success',
    roomId: room.uuid,
  });
});

// const deleteRoomInRedis = async (uuid: string) => {
//   try {
//     const key = `liveRoom:${uuid}`;
//     ffmpegTool.end({ uuid });
//     const result = await redis.del(key);
//     if (result === 1) {
//       console.log(`delete room success! ${key}`);
//     } else {
//       console.log(`delete room failed! ${key}`);
//     }
//   } catch (error) {
//     console.log(error, 'error');
//   }
// }

const deleteHlsFolder = async (uuid: string) => {
  const folderPath = join(__dirname, '../../public/source-m3u8', uuid);

  try {
    // 檢查資料夾是否存在
    if (existsSync(folderPath)) {
      // 遞迴刪除資料夾及其所有內容
      await fsPromises.rm(folderPath, { recursive: true, force: true });
      console.log(`Successfully deleted HLS folder: ${folderPath}`);
    } else {
      console.log(`HLS folder not found, skipping deletion: ${folderPath}`);
    }
  } catch (error) {
    console.error(`Error deleting HLS folder for uuid ${uuid}:`, error);
    // 即使刪除失敗，也應該繼續執行，不要中斷關閉直播的流程
  }
};

const deleteRoomInMySql = async (uuid: string) => {
  try {
    await RoomModel.destroy({
      where: {
        uuid,
      },
    });

    await deleteHlsFolder(uuid);

    roomBoardcast<{ uuid: string }>({
      data: { uuid },
      type: 'deleteRoom',
      uuid,
    });
    watcher?.close?.();
  } catch (error) {
    console.log(error, 'error');
  }
};

export const closeStream = async (uuid: string) => {
  await deleteRoomInMySql(uuid);
};

// export const openStream = catchAsyncController(async (req, res) => {
//   const { uuid } = req.query;

//   const user = Users.findOne({
//     where: {
//       uuid,
//     },
//   });

//   if (!user) {
//     errorHandler({
//       res,
//       info: {
//         code: 400,
//         message: '沒有這個用戶',
//       },
//       sendType: 'json',
//     });
//   }

//   res.status(200).json({
//     status: 'success',
//   });
// });
