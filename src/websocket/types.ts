import type { WebSocket } from 'ws';

export interface CustomWebsocket extends WebSocket {
  uuid: string;
  waitClientHeartBeatTimeout: number | null;
}
