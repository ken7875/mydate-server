// redis.js
import Redis from 'ioredis';

// 建立 Redis 連線
export const redis = new Redis({
  host: process.env.REDIS_HOST, // Redis server 地址
  port: Number(process.env.REDIS_PORT) || 6379, // Redis 預設端口
  password: process.env.REDIS_PASSWORD || '', // 如果有密碼，填在這裡
  db: 0, // 使用第 0 個資料庫
});

redis.on('connect', () => console.log('Redis connected'));
redis.on('error', (err) => console.error('Redis error:', err));

export default redis;
