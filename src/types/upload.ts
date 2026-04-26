export interface UploadSession {
  userId: string;
  receiverId: string;
  roomId: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
  checksum: string;
  status: 'uploading' | 'completed' | 'cancelled';
  receivedBytes: number;
  expiresAt: string;
  thumbWidth: number;
  thumbHeight: number;
}

export const ALLOWED_MIME_TYPES = [
  'image/webp',
  'image/jpeg',
  'image/png',
] as const;
export const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5MB
export const MAX_CHUNK_SIZE = 2 * 1024 * 1024; // 2MB per chunk
