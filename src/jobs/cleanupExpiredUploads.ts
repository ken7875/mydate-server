import cron from 'node-cron';
import MessageImage from '@/model/messageImageModel';
import { Op } from 'sequelize';
import fs from 'fs/promises';
import path from 'path';

export const startCleanupJob = () => {
  cron.schedule('0 * * * *', async () => {
    // 1. 查詢 isExpired=false 且 expireAt <= now 的紀錄
    const expiredImages = await MessageImage.findAll({
      where: { isExpired: false, expireAt: { [Op.lte]: new Date() } },
    });

    for (const img of expiredImages) {
      // 2. 刪除實體檔案目錄
      const dir = path.join('public/images/messageImage', img.imageId);
      await fs.rm(dir, { recursive: true, force: true });
      // 3. 更新 DB flag
      await img.update({ isExpired: true });
    }
  });
};
