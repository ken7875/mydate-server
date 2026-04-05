import { Storage } from '@google-cloud/storage';

const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  keyFilename: process.env.GCS_KEY_FILE,
});

const bucket = storage.bucket(process.env.GCS_BUCKET_NAME as string);

/**
 * 上傳 buffer 到 GCS
 * @returns 公開存取的 URL
 */
export const uploadToGCS = async (
  buffer: Buffer,
  fileName: string,
  contentType: string = 'image/jpeg',
): Promise<string> => {
  const file = bucket.file(`avatars/${fileName}`);
  await file.save(buffer, {
    metadata: { contentType },
    resumable: false,
  });
  // 設定公開讀取（或改用 Signed URL）
  await file.makePublic();
  return `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/avatars/${fileName}`;
};

/**
 * 從 GCS 刪除檔案
 */
export const deleteFromGCS = async (fileName: string): Promise<void> => {
  const file = bucket.file(`avatars/${fileName}`);
  await file.delete({ ignoreNotFound: true });
};

export { bucket };
