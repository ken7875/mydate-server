import Users from '@/model/authModel';
// import jwt from 'jsonwebtoken';
import { errorHandler } from '@/utils/errorHandler';
import { catchAsyncController } from '@/utils/catchAsync';
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

const operateRoomBroadcast = <T>({
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

  WebSocketServer.sendToSpecifyUser({
    data,
    code: 'SUCCESS',
    type,
    uuid: audiences,
  });
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

const isReady = async (m3u8Folder: string) => {
  try {
    const files = await fsPromises.readdir(m3u8Folder);
    const tsFiles = files.filter((f) => f.endsWith('.ts'));

    // 前端設定會從第三段開始播放, 所以延後三個檔案開始, 確保前端一定可以抓到segment
    if (tsFiles.length >= 3) {
      return true; // 表示已廣播
    }
    return false; // 表示尚未廣播
  } catch (error) {
    // 如果資料夾不存在或讀取失敗，也視為尚未準備好
    console.error(`Error reading m3u8 folder: ${m3u8Folder}`, error);
    return false;
  }
};

/**
 * 設定方間狀態並回傳給前端
 * @param uuid 房間io
 */
const setRoomStatusToReadyAndNotifyClient = async (uuid: string) => {
  await RoomModel.update(
    {
      status: true,
    },
    {
      where: {
        uuid,
      },
    },
  );

  const audiences = [...WebSocketServer.clientsMap.keys()].filter(
    (clientId) => clientId !== uuid,
  );

  console.log('set room status to Ready!!');

  WebSocketServer.sendToSpecifyUser({
    uuid: audiences,
    data: {
      uuid,
      status: true,
    },
    type: 'streamRoomStatus',
    code: 'SUCCESS',
  });
};

let watcher: FSWatcher | null = null;
const checkHlsReady = async (m3u8Folder: string, uuid: string) => {
  const done = await isReady(m3u8Folder);
  if (done) {
    setRoomStatusToReadyAndNotifyClient(uuid);
    return;
  }

  // 如果尚未準備好，則設定監聽器
  let timer: NodeJS.Timeout | null = null;
  watcher = watch(m3u8Folder, async (eventType, filename) => {
    if (filename === 'output.m3u8' && eventType === 'rename') {
      clearTimeout(timer!);
      timer = setTimeout(async () => {
        const done = await isReady(m3u8Folder);
        if (done) {
          setRoomStatusToReadyAndNotifyClient(uuid);
          watcher?.close?.();
        }
      }, 100);
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

  // 已交由stream server處理
  Ffmpeg.start(req?.user?.uuid);

  // setRoomInRedis
  const room = await createRoomDataInDb(data);

  const m3u8Folder = join(
    __dirname,
    '../../public/source-m3u8',
    req?.user?.uuid,
  );

  // 將檢查與廣播邏輯移交給非同步函式，不阻塞當前請求的回應
  operateRoomBroadcast({
    data,
    type: 'addRoom',
    uuid,
  });
  checkHlsReady(m3u8Folder, uuid);

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

    operateRoomBroadcast<{ uuid: string }>({
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
