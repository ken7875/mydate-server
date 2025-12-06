import { setMessage } from '@/controller/messageController';
import WebsocketInstance from './instance';
import ffmpegTool from '@/utils/ffmpeg';
// import { closeStream } from '@/controller/stream';

export const subscribeWebsocketOnmessageHandler = (
  WebSocketServer: WebsocketInstance,
) => {
  WebSocketServer.subscribe({ type: 'chatRoom', fnAry: [setMessage] });
};

export const subscribeStreamWebsocketOnmessageHandler = async (
  WebSocketServer: WebsocketInstance,
) => {
  WebSocketServer.subscribe({ type: 'video', fnAry: [ffmpegTool.write] });
};
