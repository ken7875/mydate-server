import rateLimit from 'express-rate-limit';
import { Request } from 'express';

const keyGenerator = (req: Request) => req.user?.uuid ?? req.ip ?? 'unknown';

const rateLimitedResponse = {
  status: 'fail',
  code: 429,
  errorCode: 'RATE_LIMITED',
  message: 'Too many requests, please try again later.',
};

export const initUploadLimiter = rateLimit({
  windowMs: 60000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: (_req, res) => {
    res.status(429).json(rateLimitedResponse);
  },
});

export const chunkUploadLimiter = rateLimit({
  windowMs: 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: (_req, res) => {
    res.status(429).json(rateLimitedResponse);
  },
});

export const imageReadLimiter = rateLimit({
  windowMs: 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: (_req, res) => {
    res.status(429).json(rateLimitedResponse);
  },
});
