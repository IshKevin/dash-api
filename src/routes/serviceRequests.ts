import { Router, Response } from 'express';
import { ServiceRequest } from '../models/ServiceRequest';
import { User } from '../models/User';
import { 
  validateIdParam, 
  validateServiceRequestCreation,
  validatePagination
} from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { 
  CreateServiceRequestRequest, 
  UpdateServiceRequestRequest, 
  AgentAssignmentRequest, 
  ServiceFeedbackRequest 
} from '../types/serviceRequest';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

/**
 * @route   GET /api/service-requests
 * @desc    Get all service requests
 * @access  Private (Admin, agents, and farmers can view relevant requests)
 */
router.get('/', authenticate, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    
    // Build filter object based on user role
    const filter: any = {};
    
    // Farmers can only see their own requests
    if (req.user?.role === 'farmer') {
      filter.farmer_id = req.user.id;
    }
    // Agents can only see requests assigned to them or unassigned requests
    else if (req.user?.role === 'agent') {
      filter.$or = [
        { agent_id: req.user.id },
        { agent_id: { $exists: false } },
        { agent_id: null }
      ];
    }
    // Admins can see all requests
    
    // Add farmer filter if provided (admin/agent only)
    if (req.query.farmer_id && req.user?.role !== 'farmer') {
      filter.farmer_id = req.query.farmer_id;
    }
    
    // Add agent filter if provided (admin only)
    if (req.query.agent_id && req.user?.role === 'admin') {
      filter.agent_id = req.query.agent_id;
    }
    
    // Add service type filter if provided
    if (req.query.service_type) {
      filter.service_type = req.query.service_type;
    }
    
    // Add status filter if provided
    if (req.query.status) {
      filter.status = req.query.status;
    }
    
    // Add priority filter if provided
    if (req.query.priority) {
      filter.priority = req.query.priority;
    }
    
    // Add location filters if provided (admin/agent only)
    if (req.user?.role !== 'farmer') {
      if (req.query.province) {
        filter['location.province'] = req.query.province;
      }
      
      if (req.query.city) {
        filter['location.city'] = req.query.city;
      }
    }
    
    // Add date range filters if provided
    if (req.query.date_from || req.query.date_to) {
      filter.requested_date = {};
      if (req.query.date_from) {
        filter.requested_date.$gte = new Date(req.query.date_from as string);
      }
      if (req.query.date_to) {
        filter.requested_date.$lte = new Date(req.query.date_to as string);
      }
    }
    
    // Add search filter if provided
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search as string, 'i');
      filter.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { request_number: searchRegex },
      ];
    }
    
    // Get service requests with pagination
    const requests = await ServiceRequest.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 });
    
    // Get total count for pagination
    const total = await ServiceRequest.countDocuments(filter);
    
    // Transform requests to public JSON
    const requestData = requests.map(request => request.toPublicJSON());
    
    sendPaginatedResponse(res, requestData, total, page, limit, 'Service requests retrieved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to retrieve service requests', 500);
    return;
  }
}));

/**
 * @route   GET /api/service-requests/:id
 * @desc    Get service request by ID
 * @access  Private (Request owner, assigned agent, or admin)
 */
router.get('/:id', authenticate, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = req.params.id;
    
    const request = await ServiceRequest.findById(requestId);
    if (!request) {
      sendNotFound(res, 'Service request not found');
      return;
    }
    
    // Check permissions
    if (req.user?.role !== 'admin' && 
        req.user?.id !== request.farmer_id && 
        req.user?.id !== request.agent_id) {
      sendError(res, 'Access denied', 403);
      return;
    }

    sendSuccess(res, request.toPublicJSON(), 'Service request retrieved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to retrieve service request', 500);
    return;
  }
}));

/**
 * @route   POST /api/service-requests
 * @desc    Create new service request (farmers only)
 * @access  Private (Farmers only)
 */
router.post('/', authenticate, authorize('farmer'), validateServiceRequestCreation, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestData: CreateServiceRequestRequest = req.body;
    
    // Set farmer ID to authenticated user
    requestData.farmer_id = req.user?.id as string;
    
    // Create service request
    const serviceRequest = new ServiceRequest(requestData);
    await serviceRequest.save();

    sendCreated(res, serviceRequest.toPublicJSON(), 'Service request created successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to create service request', 500);
    return;
  }
}));

/**
 * @route   PUT /api/service-requests/:id
 * @desc    Update service request (owner or admin)
 * @access  Private (Request owner or admin)
 */
router.put('/:id', authenticate, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = req.params.id;
    const updateData: UpdateServiceRequestRequest = req.body;
    
    // Find service request
    const serviceRequest = await ServiceRequest.findById(requestId);
    if (!serviceRequest) {
      sendNotFound(res, 'Service request not found');
      return;
    }
    
    // Check permissions
    if (req.user?.role !== 'admin' && req.user?.id !== serviceRequest.farmer_id) {
      sendError(res, 'Access denied', 403);
      return;
    }
    
    // Prevent certain updates based on status
    if (serviceRequest.status !== 'pending' && updateData.service_type) {
      sendError(res, 'Cannot change service type after request is assigned', 400);
      return;
    }
    
    // Update service request
    Object.assign(serviceRequest, updateData);
    await serviceRequest.save();

    sendSuccess(res, serviceRequest.toPublicJSON(), 'Service request updated successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to update service request', 500);
    return;
  }
}));

/**
 * @route   DELETE /api/service-requests/:id
 * @desc    Delete service request (owner or admin)
 * @access  Private (Request owner or admin)
 */
router.delete('/:id', authenticate, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = req.params.id;
    
    // Find service request
    const serviceRequest = await ServiceRequest.findById(requestId);
    if (!serviceRequest) {
      sendNotFound(res, 'Service request not found');
      return;
    }
    
    // Check permissions
    if (req.user?.role !== 'admin' && req.user?.id !== serviceRequest.farmer_id) {
      sendError(res, 'Access denied', 403);
      return;
    }
    
    // Prevent deletion of assigned or in-progress requests
    if (['assigned', 'in_progress'].includes(serviceRequest.status)) {
      sendError(res, 'Cannot delete assigned or in-progress service requests', 400);
      return;
    }
    
    // Delete service request
    await ServiceRequest.findByIdAndDelete(requestId);

    sendSuccess(res, null, 'Service request deleted successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to delete service request', 500);
    return;
  }
}));

/**
 * @route   PUT /api/service-requests/:id/assign
 * @desc    Assign agent to service request (admin only)
 * @access  Private (Admin only)
 */
router.put('/:id/assign', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = req.params.id;
    const { agent_id, scheduled_date, cost_estimate, notes }: AgentAssignmentRequest = req.body;
    
    // Find service request
    const serviceRequest = await ServiceRequest.findById(requestId);
    if (!serviceRequest) {
      sendNotFound(res, 'Service request not found');
      return;
    }
    
    // Verify agent exists and is active
    const agent = await User.findOne({ _id: agent_id, role: 'agent', status: 'active' });
    if (!agent) {
      sendError(res, 'Invalid or inactive agent', 400);
      return;
    }
    
    // Update service request
    serviceRequest.agent_id = agent_id;
    serviceRequest.status = 'assigned';
    if (scheduled_date) serviceRequest.scheduled_date = scheduled_date;
    if (cost_estimate) serviceRequest.cost_estimate = cost_estimate;
    if (notes) serviceRequest.notes = notes;
    
    await serviceRequest.save();

    sendSuccess(res, serviceRequest.toPublicJSON(), 'Service request assigned successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to assign service request', 500);
    return;
  }
}));

/**
 * @route   PUT /api/service-requests/:id/status
 * @desc    Update service request status
 * @access  Private (Request owner, assigned agent, or admin)
 */
router.put('/:id/status', authenticate, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = req.params.id;
    const { status, notes } = req.body;
    
    // Find service request
    const serviceRequest = await ServiceRequest.findById(requestId);
    if (!serviceRequest) {
      sendNotFound(res, 'Service request not found');
      return;
    }
    
    // Check permissions
    const isOwner = req.user?.id === serviceRequest.farmer_id;
    const isAgent = req.user?.id === serviceRequest.agent_id;
    // Remove the unused variable
    
    // Validate status transitions
    if (isOwner && !['pending', 'cancelled'].includes(status)) {
      sendError(res, 'Farmers can only cancel pending requests', 400);
      return;
    }
    
    if (isAgent && !['in_progress', 'completed', 'on_hold'].includes(status)) {
      sendError(res, 'Agents can only update to in_progress, completed, or on_hold', 400);
      return;
    }
    
    // Additional validation for cancellation
    // Check if the method exists before calling it
    if (status === 'cancelled' && typeof (serviceRequest as any).canBeCancelled === 'function') {
      if (!(serviceRequest as any).canBeCancelled()) {
        sendError(res, 'This service request cannot be cancelled', 400);
        return;
      }
    }
    
    // Update service request
    serviceRequest.status = status;
    if (notes) serviceRequest.notes = notes;
    
    // Auto-set completed date
    if (status === 'completed' && !serviceRequest.completed_date) {
      serviceRequest.completed_date = new Date();
    }
    
    await serviceRequest.save();

    sendSuccess(res, serviceRequest.toPublicJSON(), 'Service request status updated successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to update service request status', 500);
    return;
  }
}));

/**
 * @route   POST /api/service-requests/:id/feedback
 * @desc    Submit feedback for completed service request (farmers only)
 * @access  Private (Request owner only)
 */
router.post('/:id/feedback', authenticate, authorize('farmer'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = req.params.id;
    const feedbackData: ServiceFeedbackRequest = req.body;
    
    // Find service request
    const serviceRequest = await ServiceRequest.findById(requestId);
    if (!serviceRequest) {
      sendNotFound(res, 'Service request not found');
      return;
    }
    
    // Check if user is the owner
    if (req.user?.id !== serviceRequest.farmer_id) {
      sendError(res, 'Access denied', 403);
      return;
    }
    
    // Check if feedback can be submitted
    // Check if the method exists before calling it
    if (typeof (serviceRequest as any).canSubmitFeedback === 'function') {
      if (!(serviceRequest as any).canSubmitFeedback()) {
        sendError(res, 'Feedback can only be submitted for completed requests without existing feedback', 400);
        return;
      }
    }
    
    // Add feedback
    serviceRequest.feedback = {
      ...feedbackData,
      submitted_at: new Date()
    };
    
    await serviceRequest.save();

    sendSuccess(res, serviceRequest.toPublicJSON(), 'Feedback submitted successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to submit feedback', 500);
    return;
  }
}));

/**
 * @route   GET /api/service-requests/farmer/:farmerId
 * @desc    Get service requests for a specific farmer
 * @access  Private (Admin, agents, and the farmer themselves)
 */
router.get('/farmer/:farmerId', authenticate, validateIdParam, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const farmerId = req.params.farmerId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    
    // Check permissions
    if (req.user?.role !== 'admin' && req.user?.role !== 'agent' && req.user?.id !== farmerId) {
      sendError(res, 'Access denied', 403);
      return;
    }
    
    // Build filter
    const filter: any = { farmer_id: farmerId };
    
    // Add status filter if provided
    if (req.query.status) {
      filter.status = req.query.status;
    }
    
    // Add service type filter if provided
    if (req.query.service_type) {
      filter.service_type = req.query.service_type;
    }
    
    // Get service requests with pagination
    const requests = await ServiceRequest.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 });
    
    // Get total count for pagination
    const total = await ServiceRequest.countDocuments(filter);
    
    // Transform requests to public JSON
    const requestData = requests.map(request => request.toPublicJSON());
    
    sendPaginatedResponse(res, requestData, total, page, limit, 'Service requests retrieved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to retrieve service requests', 500);
    return;
  }
}));

/**
 * @route   GET /api/service-requests/agent/:agentId
 * @desc    Get service requests assigned to a specific agent
 * @access  Private (Admin and the agent themselves)
 */
router.get('/agent/:agentId', authenticate, validateIdParam, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const agentId = req.params.agentId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    
    // Check permissions
    if (req.user?.role !== 'admin' && req.user?.id !== agentId) {
      sendError(res, 'Access denied', 403);
      return;
    }
    
    // Build filter
    const filter: any = { agent_id: agentId };
    
    // Add status filter if provided
    if (req.query.status) {
      filter.status = req.query.status;
    }
    
    // Add service type filter if provided
    if (req.query.service_type) {
      filter.service_type = req.query.service_type;
    }
    
    // Get service requests with pagination
    const requests = await ServiceRequest.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 });
    
    // Get total count for pagination
    const total = await ServiceRequest.countDocuments(filter);
    
    // Transform requests to public JSON
    const requestData = requests.map(request => request.toPublicJSON());
    
    sendPaginatedResponse(res, requestData, total, page, limit, 'Service requests retrieved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to retrieve service requests', 500);
    return;
  }
}));

export default router;