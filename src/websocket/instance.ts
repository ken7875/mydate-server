/* eslint-disable @typescript-eslint/no-explicit-any */
import { WebSocket, WebSocketServer } from 'ws';
import type { CustomWebsocket, WebSocketMessageType } from './types';
import { toBuffer } from '@/utils/dataTransfer';
import http from 'http';
import jwt from 'jsonwebtoken';
import logger from '@/utils/logger';
// import { fileTypeFromBuffer } from 'file-type';

const OUTGOING_BACKPRESSURE_THRESHOLD = 1024 * 1024; // 1MB
const MAX_INCOMING_QUEUE_SIZE = 100;

// 用extends擴充video websocket
class WebsocketInstance {
  private wss: WebSocketServer;
  private path: string;
  #messageDeps: Map<string, ((...args: any[]) => any)[]>;
  // private clients: Map<string, any>;
  private server: http.Server | null;
  clientsMap: Map<string, CustomWebsocket>;
  noServer: boolean;
  heartBeatTimeout: number;
  private pendingMessages: Map<string, Buffer[]>;
  private readonly MAX_PENDING_PER_USER = 50;

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
      maxPayload: number;
    } = {
      path,
      host: '0.0.0.0',
      noServer: server ? true : false,
      maxPayload: 1024 * 1024,
    };
    this.wss = new WebSocketServer(websocketServerOption);
    this.clientsMap = new Map();
    this.heartBeatTimeout = 30000;
    this.pendingMessages = new Map();
  }

  private verifyToken(token: string): any {
    return jwt.verify(token, process.env.JWT_SECRET as string);
  }

  // setTime(data: any[]) {
  //   data;
  // }

  get messageDeps() {
    return this.#messageDeps;
  }

  init() {
    if (!this.server) return;

    this.server.on('upgrade', (request, socket, head) => {
      try {
        const protocols = request.headers['sec-websocket-protocol'];
        const protocolList = protocols
          ? protocols.split(',').map((p) => p.trim())
          : [];
        const bearerProtocol = protocolList.find((p) =>
          p.startsWith('bearer-'),
        );
        const token = bearerProtocol ? bearerProtocol.slice(7) : null;

        if (!token) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        const decoded = this.verifyToken(token);
        (request as any).decoded = decoded;

        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      } catch (error) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
      }
    });
  }

  onListener(ws: CustomWebsocket) {
    this.onmessage(ws);
    this.onclose(ws);
  }

  baseConnect() {
    this.wss.on('connection', (ws: CustomWebsocket, request) => {
      ws.binaryType = 'nodebuffer';
      const { decoded } = request as any;

      if (!decoded) {
        ws.close(1008, 'Unauthorized');
        return;
      }

      // if (this.clientsMap.has(decoded.uuid)) {
      //   this.clientsMap
      //     .get(decoded.uuid)
      //     ?.close(4001, 'replaced by new connection');
      //   this.clientsMap.delete(decoded.uuid);
      // }

      this.clientsMap.set(decoded.uuid, ws);
      ws.uuid = decoded.uuid;
      this.onListener(ws);

      const messageBuffer = toBuffer({
        type: 'global',
        data: `${this.path} connect success!!`,
        code: 'SUCCESS',
      });
      ws.send(messageBuffer);

      // 補發重連期間積壓的訊息
      const pending = this.pendingMessages.get(decoded.uuid);
      if (pending?.length) {
        pending.forEach((msg) => ws.send(msg));
        this.pendingMessages.delete(decoded.uuid);
        logger.debug(
          { uuid: decoded.uuid, count: pending.length },
          'flushed pending messages',
        );
      }

      logger.debug('onconnection');
    });
  }

  onconnect() {
    this.baseConnect();
  }

  onclose(ws: CustomWebsocket) {
    ws.on('close', () => {
      // 1. 瀏覽器關閉舊連線，同時發起新連線
      // 2. 新連線通過驗證，baseConnect() 關閉舊連線、從 clientsMap 刪除、寫入新連線
      // 3. 舊連線的 close 事件延遲觸發 → onclose 把 uuid 從 clientsMap 刪除

      // 問題在第 3 步：onclose 刪除的其實是新連線，因為此時 clientsMap 裡的 uuid 已經指向新的 ws 了。
      this.resetHeartBeatTimer(ws);
      if (this.clientsMap.get(ws.uuid) === ws) {
        this.clientsMap.delete(ws.uuid);
      }
    });
  }

  onmessage(ws: CustomWebsocket) {
    ws.processingQueue = Promise.resolve();
    ws.queueSize = 0;

    //對 message 設定監聽，接收從 Client 發送的訊息
    ws.on('message', (data: Buffer) => {
      if (ws.queueSize >= MAX_INCOMING_QUEUE_SIZE) {
        logger.warn({ uuid: ws.uuid }, 'backpressure: drop incoming message');
        return;
      }

      ws.queueSize++;
      // 將每筆訊息串進隊列，確保同一連線的訊息循序處理
      // 避免高速發送時產生大量並發 Promise（DB 寫入 / WS 推送）
      ws.processingQueue = ws.processingQueue
        .then(() => this.handleMessage(ws, data))
        .catch(() => {})
        .finally(() => {
          ws.queueSize--;
        });
    });
  }

  private async handleMessage(ws: CustomWebsocket, data: Buffer) {
    const str = data.toString();

    if (str === 'ping') {
      ws.send('pong');
      this.heartBeatHandler(ws);
      return;
    }

    // TODO 處理未知type類型
    // TODO 避免重複傳資料給自己
    try {
      const parseData = JSON.parse(str);

      if (parseData.type) {
        await this.notify({
          type: parseData.type,
          data: parseData.data,
          uuid: ws.uuid,
        });
      }
    } catch (error) {
      logger.warn({ error, data: str }, 'not valid websocket message');
    }
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
    this.clientsMap.forEach((client) => {
      if (client.readyState !== WebSocket.OPEN) return;
      if (client.bufferedAmount > OUTGOING_BACKPRESSURE_THRESHOLD) {
        logger.warn(
          { uuid: client.uuid },
          'backpressure: drop broadcast message',
        );
        return;
      }
      client.send(message);
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
    type: WebSocketMessageType;
    code: string;
  }) {
    if (!data) {
      logger.warn('data not defined');
      return;
    }

    const msgToString = JSON.stringify({ data, type, code });
    const messageToBuffer = Buffer.from(msgToString);

    uuid.forEach((clientId) => {
      const client = this.clientsMap.get(clientId);
      if (!client) {
        // 用戶不在線或正在重連，加入待發送佇列
        if (!this.pendingMessages.has(clientId)) {
          this.pendingMessages.set(clientId, []);
        }
        const queue = this.pendingMessages.get(clientId)!;
        if (queue.length < this.MAX_PENDING_PER_USER) {
          queue.push(messageToBuffer);
          logger.debug({ uuid: clientId }, 'queued pending message');
        } else {
          logger.warn({ uuid: clientId }, 'pending queue full: drop message');
        }
        return;
      }
      if (client.bufferedAmount > OUTGOING_BACKPRESSURE_THRESHOLD) {
        logger.warn({ uuid: clientId }, 'backpressure: drop outgoing message');
        return;
      }
      logger.debug({ uuid: clientId, data }, 'send to user');
      client.send(messageToBuffer);
    });
  }

  // TODO 獨立成訂閱者模式工具
  subscribe({
    type,
    fnAry,
  }: {
    type: WebSocketMessageType;
    fnAry: ((...args: any[]) => any)[];
  }) {
    if (!this.#messageDeps.has(type)) {
      this.#messageDeps.set(type, []);
    }

    const deps = this.#messageDeps.get(type);
    deps?.push(...fnAry);
  }

  // 通知有訂閱的function
  async notify({
    type,
    data,
    uuid,
  }: {
    type: WebSocketMessageType;
    data: any;
    uuid: string;
  }) {
    if (!this.#messageDeps.has(type)) {
      logger.debug({ type }, 'unsubscribed message type');

      return;
    }

    const deps = this.#messageDeps.get(type);
    for (const fn of deps ?? []) {
      await fn({ data, uuid });
    }
  }

  resetHeartBeatTimer(ws: CustomWebsocket) {
    clearTimeout(ws.waitClientHeartBeatTimeout!);
  }

  heartBeatHandler(ws: CustomWebsocket) {
    logger.debug({ uuid: ws.uuid }, 'heartbeat');
    this.resetHeartBeatTimer(ws);

    ws.waitClientHeartBeatTimeout = setTimeout(() => {
      ws.close(4000, 'heartbeat timeout');
    }, this.heartBeatTimeout) as unknown as number;
  }
}

export default WebsocketInstance;
