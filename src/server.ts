import dotenv from 'dotenv';
import moduleAlias from 'module-alias';

if (process.env.NODE_ENV === 'production') {
  moduleAlias.addAlias('@', __dirname);
  dotenv.config({ path: './config.prod.env' });
} else {
  moduleAlias.addAlias('@', __dirname);
  dotenv.config({ path: './config.dev.env' });
}

import app from './app';
import appStream from '@/streamApp';

import { baseWebsocket, streamWebsocket } from './websocket/server';
import {
  subscribeWebsocketOnmessageHandler,
  subscribeStreamWebsocketOnmessageHandler,
} from '@/websocket/subscriber';

const port = 3001;
const streamPort = 3002;
export const server = app.listen(port, '0.0.0.0', () => {
  console.log(`the server is listen on ${port}`);
});

export const StreamServer = appStream.listen(streamPort, '0.0.0.0', () => {
  console.log(`the server is listen on ${streamPort}`);
});

export const WebSocketServer = baseWebsocket(server, '/notificationWs');
subscribeWebsocketOnmessageHandler(WebSocketServer);

//直播websocket
export const streamWebSocketServer = streamWebsocket(StreamServer, '/streamWs');
subscribeStreamWebsocketOnmessageHandler(streamWebSocketServer);

WebSocketServer.init();
WebSocketServer.onconnect();
streamWebSocketServer.init();
streamWebSocketServer.onconnect();

const handleUncaughtExceptionOrRejection = (err: Error) => {
  console.log('Uncaughted Exception or Unhandled Rejection happens!');
  // 記錄錯誤下來，等到所有其他服務處理完成，然後停掉當前進程。
  console.log(err, 'handleUncaughtExceptionOrRejection in server');
  // server.close(() => {
  //   process.exit(1);
  // });
};

process.on('unhandledRejection', handleUncaughtExceptionOrRejection);
process.on('uncaughtException', handleUncaughtExceptionOrRejection);
