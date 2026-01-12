import { Server } from 'http';
import WebsocketInstance from './instance';
import streamWebsocketInstance from './streamInstance';
import '@/websocket/subscriber';

export const baseWebsocket = (server: Server | null, path: string) =>
  new WebsocketInstance(server, path, true);

export const streamWebsocket = (server: Server | null, path: string) =>
  new streamWebsocketInstance(server, path, true);
