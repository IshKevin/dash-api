import { Router, Response } from 'express';
import { ServiceRequest } from '../models/ServiceRequest';
import { User } from '../models/User';
import { 
  validateIdParam, 
  validateServiceRequestCreation,
  validatePagination,
  validateHarvestRequestCreation
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
 * @route   POST /api/service-requests/harvest
 * @desc    Create harvest request (farmers only)
 * @access  Private (Farmers only)
 */
router.post('/harvest', authenticate, authorize('farmer'), validateHarvestRequestCreation, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      workersNeeded,
      equipmentNeeded,
      treesToHarvest,
      harvestDateFrom,
      harvestDateTo,
      harvestImages,
      hassBreakdown,
      location,
      priority = 'medium',
      notes
    } = req.body;

    // Generate unique request number
    const requestNumber = `HRV-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    const harvestRequestData = {
      farmer_id: req.user?.id,
      service_type: 'harvest',
      title: 'Harvest Request',
      description: `Harvest request for ${treesToHarvest} trees requiring ${workersNeeded} workers`,
      request_number: requestNumber,
      status: 'pending',
      priority: priority,
      requested_date: new Date(),
      location: location,
      
      // Harvest specific data
      harvest_details: {
        workers_needed: parseInt(workersNeeded),
        equipment_needed: equipmentNeeded || [],
        trees_to_harvest: parseInt(treesToHarvest),
        harvest_date_from: new Date(harvestDateFrom),
        harvest_date_to: new Date(harvestDateTo),
        harvest_images: harvestImages || [],
        hass_breakdown: hassBreakdown || {
          selectedSizes: [],
          c12c14: '',
          c16c18: '',
          c20c24: ''
        }
      },
      
      notes: notes || '',
      created_at: new Date(),
      updated_at: new Date()
    };

    const serviceRequest = new ServiceRequest(harvestRequestData);
    await serviceRequest.save();

    sendCreated(res, serviceRequest.toPublicJSON(), 'Harvest request submitted successfully');
    return;
  } catch (error) {
    console.error('Error creating harvest request:', error);
    sendError(res, 'Failed to create harvest request', 500);
    return;
  }
}));

/**
 * @route   GET /api/service-requests/harvest
 * @desc    Get all harvest requests (filtered by role)
 * @access  Private
 */
router.get('/harvest', authenticate, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    
    // Build filter object based on user role
    const filter: any = { service_type: 'harvest' };
    
    // Farmers can only see their own requests
    if (req.user?.role === 'farmer') {
      filter.farmer_id = req.user.id;
    }
    // Agents can see assigned requests and unassigned ones
    else if (req.user?.role === 'agent') {
      filter.$or = [
        { agent_id: req.user.id },
        { agent_id: { $exists: false } },
        { agent_id: null }
      ];
    }
    // Admins can see all requests
    
    // Add additional filters
    if (req.query.status) {
      filter.status = req.query.status;
    }
    
    if (req.query.priority) {
      filter.priority = req.query.priority;
    }

    // Date range filter for harvest dates
    if (req.query.harvest_date_from || req.query.harvest_date_to) {
      filter['harvest_details.harvest_date_from'] = {};
      if (req.query.harvest_date_from) {
        filter['harvest_details.harvest_date_from'].$gte = new Date(req.query.harvest_date_from as string);
      }
      if (req.query.harvest_date_to) {
        filter['harvest_details.harvest_date_to'] = { 
          $lte: new Date(req.query.harvest_date_to as string) 
        };
      }
    }
    
    // Get harvest requests with pagination
    const requests = await ServiceRequest.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 })
      .populate('farmer_id', 'full_name email phone')
      .populate('agent_id', 'full_name email phone');
    
    const total = await ServiceRequest.countDocuments(filter);
    
    const requestData = requests.map(request => request.toPublicJSON());
    
    sendPaginatedResponse(res, requestData, total, page, limit, 'Harvest requests retrieved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to retrieve harvest requests', 500);
    return;
  }
}));

/**
 * @route   PUT /api/service-requests/:id/approve
 * @desc    Approve harvest request (admin only)
 * @access  Private (Admin only)
 */
router.put('/:id/approve', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = req.params.id;
    const { 
      agent_id, 
      scheduled_date, 
      cost_estimate, 
      notes,
      approved_workers,
      approved_equipment
    } = req.body;
    
    const serviceRequest = await ServiceRequest.findById(requestId);
    if (!serviceRequest) {
      sendNotFound(res, 'Service request not found');
      return;
    }

    if (serviceRequest.service_type !== 'harvest') {
      sendError(res, 'This endpoint is only for harvest requests', 400);
      return;
    }
    
    // Verify agent exists and is active if provided
    if (agent_id) {
      const agent = await User.findOne({ _id: agent_id, role: 'agent', status: 'active' });
      if (!agent) {
        sendError(res, 'Invalid or inactive agent', 400);
        return;
      }
      serviceRequest.agent_id = agent_id;
    }
    
    // Update request status and details
    serviceRequest.status = 'approved';
    serviceRequest.approved_at = new Date();
    if (req.user?.id) {
      serviceRequest.approved_by = req.user.id;
    }
    
    if (scheduled_date) {
      serviceRequest.scheduled_date = new Date(scheduled_date);
    }
    
    if (cost_estimate) {
      serviceRequest.cost_estimate = cost_estimate;
    }
    
    if (notes) {
      serviceRequest.notes = notes;
    }

    // Update harvest-specific approved details
    if (serviceRequest.harvest_details) {
      if (approved_workers) {
        serviceRequest.harvest_details.approved_workers = parseInt(approved_workers);
      }
      if (approved_equipment) {
        serviceRequest.harvest_details.approved_equipment = approved_equipment;
      }
    }
    
    await serviceRequest.save();

    sendSuccess(res, serviceRequest.toPublicJSON(), 'Harvest request approved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to approve harvest request', 500);
    return;
  }
}));

/**
 * @route   PUT /api/service-requests/:id/reject
 * @desc    Reject harvest request (admin only)
 * @access  Private (Admin only)
 */
router.put('/:id/reject', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = req.params.id;
    const { rejection_reason, notes } = req.body;
    
    if (!rejection_reason) {
      sendError(res, 'Rejection reason is required', 400);
      return;
    }
    
    const serviceRequest = await ServiceRequest.findById(requestId);
    if (!serviceRequest) {
      sendNotFound(res, 'Service request not found');
      return;
    }

    if (serviceRequest.service_type !== 'harvest') {
      sendError(res, 'This endpoint is only for harvest requests', 400);
      return;
    }
    
    serviceRequest.status = 'rejected';
    serviceRequest.rejected_at = new Date();
    if (req.user?.id) {
      serviceRequest.rejected_by = req.user.id;
    }
    serviceRequest.rejection_reason = rejection_reason;
    
    if (notes) {
      serviceRequest.notes = notes;
    }
    
    await serviceRequest.save();

    sendSuccess(res, serviceRequest.toPublicJSON(), 'Harvest request rejected');
    return;
  } catch (error) {
    sendError(res, 'Failed to reject harvest request', 500);
    return;
  }
}));

/**
 * @route   PUT /api/service-requests/:id/start
 * @desc    Start harvest request (assigned agent only)
 * @access  Private (Assigned agent only)
 */
router.put('/:id/start', authenticate, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = req.params.id;
    const { start_notes, actual_start_date } = req.body;
    
    const serviceRequest = await ServiceRequest.findById(requestId);
    if (!serviceRequest) {
      sendNotFound(res, 'Service request not found');
      return;
    }

    if (serviceRequest.service_type !== 'harvest') {
      sendError(res, 'This endpoint is only for harvest requests', 400);
      return;
    }
    
    // Check permissions - must be assigned agent
    if (req.user?.id !== serviceRequest.agent_id) {
      sendError(res, 'Only assigned agent can start the harvest', 403);
      return;
    }
    
    // Can only start approved requests
    if (serviceRequest.status !== 'approved') {
      sendError(res, 'Only approved requests can be started', 400);
      return;
    }
    
    serviceRequest.status = 'in_progress';
    serviceRequest.started_at = actual_start_date ? new Date(actual_start_date) : new Date();
    
    if (start_notes) {
      serviceRequest.start_notes = start_notes;
    }
    
    await serviceRequest.save();

    sendSuccess(res, serviceRequest.toPublicJSON(), 'Harvest request started');
    return;
  } catch (error) {
    sendError(res, 'Failed to start harvest request', 500);
    return;
  }
}));

/**
 * @route   PUT /api/service-requests/:id/complete
 * @desc    Mark harvest request as completed
 * @access  Private (Admin or assigned agent)
 */
router.put('/:id/complete', authenticate, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = req.params.id;
    const { 
      completion_notes,
      actual_workers_used,
      actual_harvest_amount,
      harvest_quality_notes,
      completion_images
    } = req.body;
    
    const serviceRequest = await ServiceRequest.findById(requestId);
    if (!serviceRequest) {
      sendNotFound(res, 'Service request not found');
      return;
    }

    if (serviceRequest.service_type !== 'harvest') {
      sendError(res, 'This endpoint is only for harvest requests', 400);
      return;
    }
    
    // Check permissions - admin or assigned agent
    if (req.user?.role !== 'admin' && req.user?.id !== serviceRequest.agent_id) {
      sendError(res, 'Access denied', 403);
      return;
    }
    
    // Can only complete approved or in-progress requests
    if (!['approved', 'in_progress'].includes(serviceRequest.status)) {
      sendError(res, 'Only approved or in-progress requests can be completed', 400);
      return;
    }
    
    serviceRequest.status = 'completed';
    serviceRequest.completed_at = new Date();
    if (req.user?.id) {
      serviceRequest.completed_by = req.user.id;
    }
    
    if (completion_notes) {
      serviceRequest.completion_notes = completion_notes;
    }

    // Update harvest-specific completion details
    if (serviceRequest.harvest_details) {
      if (actual_workers_used) {
        serviceRequest.harvest_details.actual_workers_used = parseInt(actual_workers_used);
      }
      if (actual_harvest_amount) {
        serviceRequest.harvest_details.actual_harvest_amount = actual_harvest_amount;
      }
      if (harvest_quality_notes) {
        serviceRequest.harvest_details.harvest_quality_notes = harvest_quality_notes;
      }
      if (completion_images) {
        serviceRequest.harvest_details.completion_images = completion_images;
      }
    }
    
    await serviceRequest.save();

    sendSuccess(res, serviceRequest.toPublicJSON(), 'Harvest request marked as completed');
    return;
  } catch (error) {
    sendError(res, 'Failed to complete harvest request', 500);
    return;
  }
}));

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
    if (status === 'completed' && !serviceRequest.completed_at) {
      serviceRequest.completed_at = new Date();
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