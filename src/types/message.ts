export type MessageStatus = 'sending' | 'success' | 'failed';

export interface MessageData {
  messageId: string;
  localId?: string;
  senderId: string;
  receiverId: string;
  message: string;
  sendTime: string;
  status?: MessageStatus;
  roomId: number;
}

export type MessageType = 'text' | 'image';
