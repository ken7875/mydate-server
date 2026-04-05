import type { WebSocket } from 'ws';

export interface CustomWebsocket extends WebSocket {
  uuid: string;
  waitClientHeartBeatTimeout: number | null;
  processingQueue: Promise<void>;
  queueSize: number;
}

export type WebSocketMessageType =
  | 'global'
  | 'chatRoom'
  | 'inviteFriend'
  | 'setFriendStatus'
  | 'markAsRead'
  | 'video'
  | 'closeVideo'
  | 'streamRoomStatus'
  | 'addRoom'
  | 'deleteRoom';
