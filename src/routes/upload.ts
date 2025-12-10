import { Router, Response } from 'express';
import { upload } from '../middleware/upload';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

/**
 * @route   POST /api/upload
 * @desc    Upload a single file (image or PDF)
 * @access  Private
 */
router.post('/', authenticate, upload.single('file'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!req.file) {
            sendError(res, 'No file uploaded', 400);
            return;
        }

        sendSuccess(res, {
            url: req.file.path,
            filename: req.file.filename,
            mimetype: req.file.mimetype,
            size: req.file.size
        }, 'File uploaded successfully');
    } catch (error) {
        sendError(res, 'File upload failed', 500);
    }
}));

/**
 * @route   POST /api/upload/multiple
 * @desc    Upload multiple files (max 5)
 * @access  Private
 */
router.post('/multiple', authenticate, upload.array('files', 5), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
            sendError(res, 'No files uploaded', 400);
            return;
        }

        const files = (req.files as Express.Multer.File[]).map(file => ({
            url: file.path,
            filename: file.filename,
            mimetype: file.mimetype,
            size: file.size
        }));

        sendSuccess(res, { files }, 'Files uploaded successfully');
    } catch (error) {
        sendError(res, 'File upload failed', 500);
    }
}));

export default router;
