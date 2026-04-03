import { setMessage, markAsRead } from '@/controller/messageController';
import { setFriendStatus, inviteFriend } from '@/controller/friendControll';
import WebsocketInstance from './instance';
import ffmpegTool from '@/utils/ffmpeg';
// import { closeStream } from '@/controller/stream';

export const subscribeWebsocketOnmessageHandler = (
  WebSocketServer: WebsocketInstance,
) => {
  WebSocketServer.subscribe({ type: 'chatRoom', fnAry: [setMessage] });
  WebSocketServer.subscribe({ type: 'inviteFriend', fnAry: [inviteFriend] });
  WebSocketServer.subscribe({
    type: 'setFriendStatus',
    fnAry: [setFriendStatus],
  });
  WebSocketServer.subscribe({
    type: 'markAsRead',
    fnAry: [markAsRead],
  });
};

export const subscribeStreamWebsocketOnmessageHandler = async (
  WebSocketServer: WebsocketInstance,
) => {
  WebSocketServer.subscribe({ type: 'video', fnAry: [ffmpegTool.write] });
};
