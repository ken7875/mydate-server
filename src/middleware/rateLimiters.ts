import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request } from 'express';

const keyGenerator = (req: Request) =>
  req.user?.uuid ?? ipKeyGenerator(req.ip) ?? 'unknown';

const rateLimitedResponse = {
  status: 'fail',
  code: 429,
  errorCode: 'RATE_LIMITED',
  message: 'Too many requests, please try again later.',
};

export const defaultLomiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  handler: (_req, res) => {
    res.status(429).json(rateLimitedResponse);
  },
});

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
