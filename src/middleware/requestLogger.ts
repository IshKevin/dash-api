import { Response, NextFunction } from 'express';
import logger from '../config/logger';
import { AuthenticatedRequest } from '../types/auth';

export const requestLogger = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        const userId = req.user?.id || 'anonymous';
        const userRole = req.user?.role || 'guest';
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        // Log format for database
        const logData = {
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: ip,
            userId: userId,
            role: userRole,
            userAgent: req.headers['user-agent']
        };

        // Use winston logger which we configured to save to MongoDB
        logger.info(`Request: ${req.method} ${req.originalUrl}`, logData);
    });

    next();
};

export default requestLogger;
