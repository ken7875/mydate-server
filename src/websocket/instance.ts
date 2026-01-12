/* eslint-disable @typescript-eslint/no-explicit-any */
import { WebSocket, WebSocketServer } from 'ws';
import type { CustomWebsocket } from './types';
import { toBuffer } from '@/utils/dataTransfer';
import http from 'http';
import jwt from 'jsonwebtoken';
import url from 'url';
// import { fileTypeFromBuffer } from 'file-type';

// 用extends擴充video websocket
class WebsocketInstance {
  private wss: WebSocketServer;
  private path: string;
  #messageDeps: Map<string, ((...args: any[]) => any)[]>;
  // private clients: Map<string, any>;
  private server: http.Server | null;
  clientsMap: Map<string, CustomWebsocket>;
  noServer: boolean;

  constructor(
    server: http.Server | null,
    path: string,
    noServer: boolean = false,
  ) {
    this.path = path;
    this.#messageDeps = new Map();
    this.server = server;
    this.noServer = noServer;
    // host: '0.0.0.0'
    const websocketServerOption: {
      path: string;
      noServer: boolean;
      host: string;
      port?: number;
    } = {
      path,
      host: '0.0.0.0',
      noServer: server ? true : false,
    };
    this.wss = new WebSocketServer(websocketServerOption);
    this.clientsMap = new Map();
  }

  private async verifyToken(token: string): Promise<any> {
    // const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET as string);
    const decoded = await jwt.verify(token, process.env.JWT_SECRET as string);
    return decoded;
  }

  // setTime(data: any[]) {
  //   data;
  // }

  get messageDeps() {
    return this.#messageDeps;
  }

  init() {
    if (!this.server) return;

    this.server.on('upgrade', async (request, socket, head) => {
      try {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      } catch (error) {
        socket.destroy();
      }
    });
  }

  onListener(ws: CustomWebsocket) {
    this.onmessage(ws);
    this.onclose(ws);
  }

  baseConnect() {
    this.wss.on('connection', async (ws: CustomWebsocket, request) => {
      ws.binaryType = 'nodebuffer';
      const { query } = url.parse(request.url!, true);
      const token = query?.token as string;
      try {
        const decoded = await this.verifyToken(token);
        if (!token || !decoded) {
          ws.send('Authentication failed!');
          return;
        }
        if (this.clientsMap.has(decoded.uuid)) {
          this.clientsMap.get(decoded.uuid)?.close();
          this.clientsMap.delete(decoded.uuid);
        }
        this.clientsMap.set(decoded.uuid, ws);
        ws.uuid = decoded.uuid;
        this.onListener(ws);
        const messageBuffer = toBuffer({
          type: 'global',
          data: `${this.path} connect success!!`,
          code: 'SUCCESS',
        });
        ws.send(messageBuffer);
        // resolve(ws);
      } catch (error) {
        console.log(error, 'websocket token valid failed!!');
        const messageBuffer = toBuffer({
          type: 'global',
          data: 'Authentication failed!',
          code: 'UNAUTHORIZATION',
        });
        console.log('Authentication failed:', error);
        // reject(`user id ${ws.uuid} Authentication failed`);
        ws.send(messageBuffer);
        ws.close();
        // socket.write( // not work
        //   'HTTP/1.1 401 Unauthorized\r\n' +
        //   'Content-Type: application/json\r\n' +
        //   'Connection: close\r\n' +
        //   '\r\n' +
        //   JSON.stringify({ message: 'Token is invalid or expired' })
        // );
      }
    });
  }

  onconnect() {
    this.baseConnect();
  }

  onclose(ws: CustomWebsocket) {
    ws.on('close', () => {
      console.log(ws.uuid, 'onclose uuid');
      this.clientsMap.delete(ws.uuid);
    });
  }

  onmessage(ws: CustomWebsocket) {
    //對 message 設定監聽，接收從 Client 發送的訊息
    ws.on('message', async (data: Buffer) => {
      if (data.toString() === 'ping') {
        ws.send('pong');
        // this.closeIfNoHeartBeat(ws);

        return;
      }

      // TODO 處理未知type類型
      // TODO 避免重複傳資料給自己
      try {
        if (!Buffer.isBuffer(data)) {
          const errorRes = Buffer.from(
            JSON.stringify({
              type: 'error',
              code: 'INVALID_PAYLOAD',
              message: 'Payload 格式不正確',
            }),
          );
          ws.send(errorRes);
          return;
        }

        const parseData = JSON.parse(data.toString());

        if (parseData.type) {
          this.notify({
            type: parseData.type,
            data: parseData.data,
            uuid: ws.uuid,
          });
        }
      } catch (error) {
        console.log(error, 'not valid websocket message');
      }
    });
  }

  closeSingleConnect(ws: CustomWebsocket) {
    ws.close();
  }

  handleClose(code = 1001) {
    this.wss.clients.forEach((ws) => {
      ws.close(code, 'close connect');
    });
    this.wss.close();
  }

  sendToAllUser(message: Buffer): void {
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  sendToSpecifyUser({
    uuid,
    data,
    type,
    code,
  }: {
    uuid: string[];
    data: any;
    type: string;
    code: string;
  }) {
    if (!data) {
      console.log('data not defined!!!');
      return;
    }

    const msgToString = JSON.stringify({ data, type, code });
    const messageToBuffer = Buffer.from(msgToString);

    uuid.forEach((clientId) => {
      const client = this.clientsMap.get(clientId);
      if (!client) return;
      console.log(`send to ${uuid}`, data);
      client.send(messageToBuffer);
    });
  }

  // TODO 獨立成訂閱者模式工具
  subscribe({
    type,
    fnAry,
  }: {
    type: string;
    fnAry: ((...args: any[]) => any)[];
  }) {
    if (!this.#messageDeps.has(type)) {
      this.#messageDeps.set(type, []);
    }

    const deps = this.#messageDeps.get(type);
    deps?.push(...fnAry);
  }

  // TODO 獨立成訂閱者模式工具
  // 通知有訂閱的function
  notify({ type, data, uuid }: { type: string; data: any; uuid: string }) {
    if (!this.#messageDeps.has(type)) {
      console.error(
        `easy-booking-websocket: you do not have subscribe type **${type}**!!`,
      );

      return;
    }

    const deps = this.#messageDeps.get(type);
    deps?.forEach((fn) => {
      fn({ data, uuid });
    });
  }

  resetHeartBeatTimer(ws: CustomWebsocket) {
    clearTimeout(ws.waitClientHeartBeatTimeout!);
  }

  closeIfNoHeartBeat(ws: CustomWebsocket) {
    console.log('closeIfNoHeartBeat');
    this.resetHeartBeatTimer(ws);

    ws.waitClientHeartBeatTimeout = setTimeout(() => {
      this.closeSingleConnect(ws);
    }, 5000) as unknown as number;
  }
}

export default WebsocketInstance;
