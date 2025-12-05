// redis.js
import Redis from 'ioredis';

// 建立 Redis 連線
export const redis = new Redis({
  host: process.env.REDIS_HOST, // Redis server 地址
  port: 6379, // Redis 預設端口
  password: '', // 如果有密碼，填在這裡
  db: 0, // 使用第 0 個資料庫
});

redis.on('connect', () => console.log('Redis connected'));
redis.on('error', (err) => console.error('Redis error:', err));

export default redis;
