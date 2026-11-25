import winston from 'winston';
import { env } from './environment';

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

const isProd = env.NODE_ENV === 'production';

// Development: coloured, human-readable. Production: one JSON object per line
// on stdout (what Docker/Coolify log collectors expect), no ANSI codes.
const consoleFormat = isProd
  ? winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json())
  : winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
      winston.format.colorize({ all: true }),
      winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`),
    );
const fileFormat = winston.format.combine(winston.format.timestamp(), winston.format.json());

const transports: winston.transport[] = [new winston.transports.Console({ format: consoleFormat })];

// Optional rotating log files (LOG_TO_FILE=true). Off by default in containers.
if (process.env.LOG_TO_FILE === 'true' || (!isProd && process.env.LOG_TO_FILE !== 'false')) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs');
  if (!fs.existsSync('logs')) fs.mkdirSync('logs', { recursive: true });
  const rotate = { maxsize: 10 * 1024 * 1024, maxFiles: 5, tailable: true, format: fileFormat };
  transports.push(
    new winston.transports.File({ filename: 'logs/error.log', level: 'error', ...rotate }),
    new winston.transports.File({ filename: 'logs/all.log', ...rotate }),
  );
}

// Persist error/warn/info entries to the Log table so admins can read them in
// the dashboard (Logs / Monitoring pages). Per-request `http` logs stay on
// stdout only. Prisma is required lazily to avoid an import cycle, and write
// failures are swallowed — logging must never take the API down.
import Transport from 'winston-transport';
class DatabaseTransport extends Transport {
  log(info: any, callback: () => void) {
    setImmediate(() => this.emit('logged', info));
    if (process.env.LOG_TO_DB === 'false' || process.env.NODE_ENV === 'test') return callback();
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { prisma } = require('../lib/prisma');
      const { level, message, timestamp, ...meta } = info;
      const clean = String(level).replace(/\u001b\[[0-9;]*m/g, '');
      prisma.log
        .create({ data: { level: clean, message: String(message).slice(0, 5000), meta: Object.keys(meta).length ? JSON.parse(JSON.stringify(meta)) : undefined } })
        .catch(() => undefined);
    } catch {
      /* ignore */
    }
    callback();
  }
}
transports.push(new DatabaseTransport({ level: 'info' }));

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  levels,
  transports,
});

export default logger;
