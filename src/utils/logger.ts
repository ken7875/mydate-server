import pino from 'pino';

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'error' : 'debug',
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
    },
  }),
});

export default logger;
