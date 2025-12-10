import winston from 'winston';
import { env } from './environment';

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const level = () => {
  return env.NODE_ENV === 'development' ? 'debug' : 'warn';
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`,
  ),
);

const transports = [
  new winston.transports.Console(),
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
  }),
  new winston.transports.File({ filename: 'logs/all.log' }),
];

// MongoDB Transport
import Log from '../models/Log';
import TransportStream from 'winston-transport';

class MongoDBTransport extends TransportStream {
  constructor(opts?: TransportStream.TransportStreamOptions) {
    super(opts);
  }

  log(info: any, callback: () => void) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    // Create log entry in MongoDB
    try {
      const { level, message, ...meta } = info;
      const logEntry = new Log({
        level,
        message,
        meta,
        timestamp: new Date()
      });
      logEntry.save().catch(err => {
        console.error('Error saving log to MongoDB:', err);
      });
    } catch (err) {
      console.error('Error in MongoDB transport:', err);
    }

    callback();
  }
}

transports.push(new MongoDBTransport() as any);

const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
});

export default logger;
