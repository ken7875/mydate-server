import fs from 'fs/promises';
import path from 'path';

const avatarsFolder = 'avatars';

const avatarsDir = path.join(process.cwd(), 'public', avatarsFolder);

// 確保目錄存在
fs.mkdir(avatarsDir, { recursive: true }).catch(() => {});

/**
 * 儲存 buffer 到本地 public 目錄
 * @returns 可公開存取的相對 URL
 */
export const saveLocalFile = async (
  buffer: Buffer,
  fileName: string,
  _contentType: string = 'image/jpeg',
): Promise<string> => {
  const filePath = path.join(avatarsDir, fileName);
  await fs.writeFile(filePath, buffer);
  return `${avatarsFolder}/${fileName}`;
};

/**
 * 從本地刪除檔案
 */
export const deleteLocalFile = async (fileName: string): Promise<void> => {
  const filePath = path.join(avatarsDir, fileName);
  await fs.unlink(filePath).catch(() => {});
};
