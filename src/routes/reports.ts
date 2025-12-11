import { Router, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError, sendPaginatedResponse } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import Report from '../models/Report';
import { upload } from '../middleware/upload';

const router = Router();

/**
 * @route   GET /api/reports
 * @desc    Get all reports with pagination and filters
 * @access  Private (Admin, Agent)
 */
router.get('/', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            agent_id, 
            report_type, 
            status, 
            date_from, 
            date_to 
        } = req.query;

        const query: any = {};
        
        // If user is an agent, only show their reports
        if (req.user?.role === 'agent') {
            query.agent_id = req.user.id;
        } else if (agent_id) {
            query.agent_id = agent_id;
        }
        
        if (report_type) query.report_type = report_type;
        if (status) query.status = status;
        
        if (date_from || date_to) {
            query.scheduled_date = {};
            if (date_from) query.scheduled_date.$gte = new Date(date_from as string);
            if (date_to) query.scheduled_date.$lte = new Date(date_to as string);
        }

        const reports = await Report.find(query)
            .populate('agent_id', 'full_name email')
            .populate('farmer_id', 'full_name email')
            .sort({ created_at: -1 })
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit));

        const total = await Report.countDocuments(query);

        return sendPaginatedResponse(res, reports, total, Number(page), Number(limit), 'Reports retrieved successfully');
    } catch (error: any) {
        console.error('Get reports error:', error);
        return sendError(res, 'Failed to retrieve reports', 500);
    }
}));

/**
 * @route   GET /api/reports/:id
 * @desc    Get report by ID
 * @access  Private (Admin, Agent - own reports)
 */
router.get('/:id', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const report = await Report.findById(req.params.id)
            .populate('agent_id', 'full_name email')
            .populate('farmer_id', 'full_name email');
        
        if (!report) {
            return sendError(res, 'Report not found', 404);
        }

        // If user is an agent, ensure they can only access their own reports
        if (req.user?.role === 'agent' && report.agent_id.toString() !== req.user.id) {
            return sendError(res, 'Access denied', 403);
        }

        return sendSuccess(res, report, 'Report retrieved successfully');
    } catch (error: any) {
        console.error('Get report error:', error);
        return sendError(res, 'Failed to retrieve report', 500);
    }
}));

/**
 * @route   POST /api/reports
 * @desc    Create new report
 * @access  Private (Admin, Agent)
 */
router.post('/', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const reportData = {
            ...req.body,
            agent_id: req.user?.role === 'agent' ? req.user.id : req.body.agent_id
        };

        const report = new Report(reportData);
        await report.save();
        
        await report.populate('agent_id', 'full_name email');
        if (report.farmer_id) {
            await report.populate('farmer_id', 'full_name email');
        }

        return sendSuccess(res, report, 'Report created successfully', 201);
    } catch (error: any) {
        console.error('Create report error:', error);
        if (error.name === 'ValidationError') {
            return sendError(res, error.message, 400);
        }
        return sendError(res, 'Failed to create report', 500);
    }
}));

/**
 * @route   PUT /api/reports/:id
 * @desc    Update report
 * @access  Private (Admin, Agent - own reports)
 */
router.put('/:id', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const report = await Report.findById(req.params.id);
        if (!report) {
            return sendError(res, 'Report not found', 404);
        }

        // If user is an agent, ensure they can only update their own reports
        if (req.user?.role === 'agent' && report.agent_id.toString() !== req.user.id) {
            return sendError(res, 'Access denied', 403);
        }

        const updatedReport = await Report.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        ).populate('agent_id', 'full_name email')
         .populate('farmer_id', 'full_name email');

        return sendSuccess(res, updatedReport, 'Report updated successfully');
    } catch (error: any) {
        console.error('Update report error:', error);
        if (error.name === 'ValidationError') {
            return sendError(res, error.message, 400);
        }
        return sendError(res, 'Failed to update report', 500);
    }
}));

/**
 * @route   DELETE /api/reports/:id
 * @desc    Delete report
 * @access  Private (Admin only)
 */
router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const report = await Report.findById(req.params.id);
        if (!report) {
            return sendError(res, 'Report not found', 404);
        }

        await Report.findByIdAndDelete(req.params.id);
        return sendSuccess(res, null, 'Report deleted successfully');
    } catch (error: any) {
        console.error('Delete report error:', error);
        return sendError(res, 'Failed to delete report', 500);
    }
}));

/**
 * @route   POST /api/reports/:id/attachments
 * @desc    Upload report attachments
 * @access  Private (Admin, Agent - own reports)
 */
router.post('/:id/attachments', authenticate, authorize('admin', 'agent'), upload.array('files', 5), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const report = await Report.findById(req.params.id);
        if (!report) {
            return sendError(res, 'Report not found', 404);
        }

        // If user is an agent, ensure they can only update their own reports
        if (req.user?.role === 'agent' && report.agent_id.toString() !== req.user.id) {
            return sendError(res, 'Access denied', 403);
        }

        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
            return sendError(res, 'No files uploaded', 400);
        }

        // In a real implementation, you would upload files to cloud storage
        // For now, we'll just store the file paths
        const attachmentUrls = files.map(file => `/uploads/${file.filename}`);
        
        report.attachments.push(...attachmentUrls);
        await report.save();

        return sendSuccess(res, { attachments: attachmentUrls }, 'Attachments uploaded successfully');
    } catch (error: any) {
        console.error('Upload attachments error:', error);
        return sendError(res, 'Failed to upload attachments', 500);
    }
}));

/**
 * @route   GET /api/reports/statistics
 * @desc    Get report statistics
 * @access  Private (Admin, Agent)
 */
router.get('/statistics', authenticate, authorize('admin', 'agent'), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    try {
        // If user is an agent, only show their report statistics
        // TODO: Implement agent-specific statistics filtering
        
        const statistics = await Report.getStatistics();

        return sendSuccess(res, statistics, 'Report statistics retrieved successfully');
    } catch (error: any) {
        console.error('Get report statistics error:', error);
        return sendError(res, 'Failed to retrieve report statistics', 500);
    }
}));

export default router;