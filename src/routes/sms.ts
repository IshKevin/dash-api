import { Router, Response } from 'express';
import { body } from 'express-validator';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import { smsService } from '../services/smsService';

const router = Router();

router.post(
  '/send',
  authenticate,
  authorize('admin'),
  [
    body('to')
      .custom((value) => typeof value === 'string' || (Array.isArray(value) && value.every((v) => typeof v === 'string')))
      .withMessage('to must be a phone number string or an array of phone number strings'),
    body('message')
      .isString()
      .trim()
      .isLength({ min: 1, max: 1600 })
      .withMessage('message is required and must be 1-1600 characters'),
    validate,
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { to, message } = req.body;

    const result = await smsService.send(to, message);
    if (!result.sent) {
      sendError(res, result.error || 'SMS send failed', 502);
      return;
    }

    sendSuccess(res, result, 'SMS sent successfully');
  })
);

export default router;
