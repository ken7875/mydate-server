import { Server } from 'http';
import WebsocketInstance from './instance';
import ffmpegTool from '@/utils/ffmpeg';
import type { CustomWebsocket } from './types';
import { closeStream } from '@/controller/stream';

export default class StreamWebsocket extends WebsocketInstance {
  constructor(server: Server | null, path: string) {
    super(server, path);
  }

  private closeStreamHandler(ws: CustomWebsocket) {
    ffmpegTool.end({ uuid: ws.uuid });
    this.clientsMap.delete(ws.uuid);
    closeStream(ws.uuid);
  }

  private handleCloseStream(ws: CustomWebsocket) {
    // 處理前端用戶手動關閉直播
    try {
      this.closeStreamHandler(ws);
      this.sendToSpecifyUser({
        data: '成功關閉直播',
        code: 'SUCCESS',
        type: 'closeVideo',
        uuid: [ws.uuid],
      });
      ws.close();
    } catch (error) {
      this.sendToSpecifyUser({
        data: '直播關閉失敗',
        code: 'FAIL',
        type: 'closeVideo',
        uuid: [ws.uuid],
      });
    }
  }

  async onconnect() {
    this.baseConnect();
  }

  onmessage(ws: CustomWebsocket): void {
    ws.on('message', async (data: Buffer) => {
      if (data.toString() === 'ping') {
        ws.send('pong');
        // this.closeIfNoHeartBeat(ws)

        return;
      }

      try {
        this.notify({
          type: 'video',
          uuid: ws.uuid,
          data,
        });
      } catch (error) {
        console.log(error, 'not valid websocket message');
      }
    });
  }

  onclose(ws: CustomWebsocket) {
    ws.on('close', () => {
      // 處理前端關閉視窗或是斷線造成直播關閉, 若為點擊關播會先送closeVideo事件
      this.closeStreamHandler(ws);
    });
  }

  closeSingleConnect(ws: CustomWebsocket): void {
    ws.close();
    this.handleCloseStream(ws);
  }
}
