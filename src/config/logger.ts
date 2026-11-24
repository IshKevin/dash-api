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

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  levels,
  transports,
});

export default logger;
