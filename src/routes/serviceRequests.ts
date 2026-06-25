import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma';
import { validateIdParam, validatePagination } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

function generateRequestNumber(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

function handleValidation(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    return;
  }
  next();
}

const validatePestManagement = [
  body('title').notEmpty().isLength({ max: 200 }).withMessage('Title is required and must be < 200 chars'),
  body('description').notEmpty().isLength({ max: 1000 }).withMessage('Description is required'),
  body('location.province').notEmpty().withMessage('Province is required'),
  body('pest_management_details.pests_diseases').isArray({ min: 1 }).withMessage('At least one pest/disease required'),
  body('pest_management_details.severity_level').isIn(['low', 'medium', 'high', 'critical']),
  body('farmer_info.name').notEmpty().withMessage('Farmer name is required'),
  body('farmer_info.phone').notEmpty().withMessage('Farmer phone is required'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  handleValidation,
];

const validateHarvest = [
  body('workersNeeded').isInt({ min: 1 }).withMessage('Workers needed must be a positive integer'),
  body('treesToHarvest').isInt({ min: 1 }).withMessage('Trees to harvest must be a positive integer'),
  body('harvestDateFrom').isISO8601().withMessage('Harvest start date must be valid'),
  body('harvestDateTo').isISO8601().withMessage('Harvest end date must be valid'),
  body('location.province').notEmpty().withMessage('Province is required'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  handleValidation,
];

// Build role-based where clause for service requests
function buildRequestWhere(req: AuthenticatedRequest, serviceType?: string): any {
  const where: any = {};
  if (serviceType) where.service_type = serviceType as any;

  if (req.user?.role === 'farmer') {
    where.farmer_id = req.user.id;
  } else if (req.user?.role === 'agent') {
    // Agents see assigned + unassigned
    where.OR = [{ agent_id: req.user.id }, { agent_id: null }];
  }

  if (req.query.status) where.status = req.query.status as any;
  if (req.query.priority) where.priority = req.query.priority as any;

  return where;
}

// POST /api/service-requests/pest-management
router.post('/pest-management', authenticate, authorize('farmer'), validatePestManagement, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { title, description, priority = 'medium', preferred_date, location, pest_management_details, farmer_info, attachments, notes } = req.body;

  const serviceRequest = await prisma.serviceRequest.create({
    data: {
      farmer_id: req.user!.id,
      service_type: 'pest_control',
      title,
      description,
      request_number: generateRequestNumber('PC'),
      status: 'pending',
      priority: priority as any,
      requested_date: new Date(),
      scheduled_date: preferred_date ? new Date(preferred_date) : null,
      location,
      pest_management_details,
      farmer_info,
      attachments: attachments || [],
      notes: notes || '',
    },
  });

  sendCreated(res, serviceRequest, 'Pest management request submitted successfully');
}));

// POST /api/service-requests/property-evaluation
router.post('/property-evaluation', authenticate, authorize('farmer'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { irrigationSource, irrigationTiming, soilTesting, visitStartDate, visitEndDate, evaluationPurpose, priority = 'medium', notes, location } = req.body;

  if (!irrigationSource || !visitStartDate || !visitEndDate || !location?.province) {
    sendError(res, 'Irrigation source, visit dates, and province are required', 400);
    return;
  }

  if (irrigationSource === 'Yes' && !irrigationTiming) {
    sendError(res, 'Irrigation timing is required when irrigation source is Yes', 400);
    return;
  }

  const startDate = new Date(visitStartDate);
  const endDate = new Date(visitEndDate);
  const diffDays = Math.ceil(Math.abs(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays !== 4) {
    sendError(res, 'Visit date range must be exactly 5 days', 400);
    return;
  }

  const serviceRequest = await prisma.serviceRequest.create({
    data: {
      farmer_id: req.user!.id,
      service_type: 'other',
      title: 'Property Evaluation Request',
      description: `Property evaluation for ${irrigationSource === 'Yes' ? 'irrigation upgrade' : 'general evaluation'}`,
      request_number: generateRequestNumber('PROP'),
      status: 'pending',
      priority: priority as any,
      requested_date: new Date(),
      location: {
        province: location?.province || 'Unknown',
        district: location?.district || '',
        farm_name: location?.farm_name || '',
        sector: location?.sector || '',
        cell: location?.cell || '',
        village: location?.village || '',
      },
      pest_management_details: {
        irrigation_source: irrigationSource,
        irrigation_timing: irrigationSource === 'Yes' ? irrigationTiming : null,
        soil_testing: soilTesting || '',
        visit_start_date: startDate,
        visit_end_date: endDate,
        evaluation_purpose: evaluationPurpose || '',
      },
      notes: notes || '',
    },
  });

  sendCreated(res, serviceRequest, 'Property evaluation request submitted successfully');
}));

// POST /api/service-requests/harvest
router.post('/harvest', authenticate, authorize('farmer', 'agent'), validateHarvest, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { workersNeeded, equipmentNeeded, treesToHarvest, harvestDateFrom, harvestDateTo, harvestImages, hassBreakdown, location, priority = 'medium', notes, farmer_id } = req.body;

  let farmerId: string;

  if (req.user?.role === 'farmer') {
    farmerId = req.user.id;
  } else {
    if (!farmer_id) {
      sendError(res, 'farmer_id is required when agent creates a harvest request', 400);
      return;
    }
    const farmer = await prisma.user.findUnique({ where: { id: farmer_id } });
    if (!farmer || farmer.role !== 'farmer') {
      sendError(res, 'Invalid farmer_id provided', 400);
      return;
    }
    farmerId = farmer_id;
  }

  const serviceRequest = await prisma.serviceRequest.create({
    data: {
      farmer_id: farmerId,
      agent_id: req.user?.role === 'agent' ? req.user.id : null,
      service_type: 'harvest',
      title: 'Harvest Request',
      description: `Harvest request for ${treesToHarvest} trees requiring ${workersNeeded} workers`,
      request_number: generateRequestNumber('HRV'),
      status: 'pending',
      priority: priority as any,
      requested_date: new Date(),
      location,
      harvest_details: {
        workers_needed: parseInt(workersNeeded),
        equipment_needed: equipmentNeeded || [],
        trees_to_harvest: parseInt(treesToHarvest),
        harvest_date_from: new Date(harvestDateFrom),
        harvest_date_to: new Date(harvestDateTo),
        harvest_images: harvestImages || [],
        hass_breakdown: hassBreakdown || {},
      },
      notes: notes || '',
    },
  });

  sendCreated(res, serviceRequest, 'Harvest request submitted successfully');
}));

// GET /api/service-requests/pest-management
router.get('/pest-management', authenticate, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const where = buildRequestWhere(req, 'pest_control');

  const [requests, total] = await Promise.all([
    prisma.serviceRequest.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.serviceRequest.count({ where }),
  ]);

  sendPaginatedResponse(res, requests, total, page, limit, 'Pest management requests retrieved successfully');
}));

// GET /api/service-requests/property-evaluation
router.get('/property-evaluation', authenticate, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const where = buildRequestWhere(req, 'other');

  const [requests, total] = await Promise.all([
    prisma.serviceRequest.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.serviceRequest.count({ where }),
  ]);

  sendPaginatedResponse(res, requests, total, page, limit, 'Property evaluation requests retrieved successfully');
}));

// GET /api/service-requests/harvest/agent/me
router.get('/harvest/agent/me', authenticate, authorize('agent'), validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  const where: any = { agent_id: req.user!.id, service_type: 'harvest' };

  if (req.query.status) where.status = req.query.status as any;

  const [requests, total] = await Promise.all([
    prisma.serviceRequest.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.serviceRequest.count({ where }),
  ]);

  sendPaginatedResponse(res, requests, total, page, limit, 'Harvest requests retrieved successfully');
}));

// GET /api/service-requests/harvest
router.get('/harvest', authenticate, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const where = buildRequestWhere(req, 'harvest');

  const [requests, total] = await Promise.all([
    prisma.serviceRequest.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.serviceRequest.count({ where }),
  ]);

  sendPaginatedResponse(res, requests, total, page, limit, 'Harvest requests retrieved successfully');
}));

// PUT /api/service-requests/:id/approve-harvest
router.put('/:id/approve-harvest', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agent_id, scheduled_date, cost_estimate, notes, approved_workers, approved_equipment } = req.body;

  const existing = await prisma.serviceRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendNotFound(res, 'Service request not found'); return; }
  if (existing.service_type !== 'harvest') { sendError(res, 'This endpoint is only for harvest requests', 400); return; }

  if (agent_id) {
    const agent = await prisma.user.findFirst({ where: { id: agent_id, role: 'agent', status: 'active' } });
    if (!agent) { sendError(res, 'Invalid or inactive agent', 400); return; }
  }

  const harvestDetails: any = { ...(existing.harvest_details as any || {}) };
  if (approved_workers) harvestDetails.approved_workers = parseInt(approved_workers);
  if (approved_equipment) harvestDetails.approved_equipment = approved_equipment;

  const updated = await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: {
      status: 'approved',
      approved_at: new Date(),
      approved_by: req.user!.id,
      agent_id: agent_id || existing.agent_id,
      scheduled_date: scheduled_date ? new Date(scheduled_date) : existing.scheduled_date,
      cost_estimate: cost_estimate ?? existing.cost_estimate,
      notes: notes || existing.notes,
      harvest_details: harvestDetails,
    },
  });

  sendSuccess(res, updated, 'Harvest request approved successfully');
}));

// PUT /api/service-requests/:id/complete-harvest
router.put('/:id/complete-harvest', authenticate, authorize('admin', 'agent'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { completion_notes, actual_workers_used, actual_harvest_amount, harvest_quality_notes, completion_images } = req.body;

  const existing = await prisma.serviceRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendNotFound(res, 'Service request not found'); return; }
  if (existing.service_type !== 'harvest') { sendError(res, 'This endpoint is only for harvest requests', 400); return; }
  if (req.user?.role === 'agent' && existing.agent_id !== req.user.id) {
    sendError(res, 'You can only complete your assigned requests', 403); return;
  }

  const harvestDetails: any = { ...(existing.harvest_details as any || {}) };
  if (actual_workers_used) harvestDetails.actual_workers_used = parseInt(actual_workers_used);
  if (actual_harvest_amount) harvestDetails.actual_harvest_amount = actual_harvest_amount;
  if (harvest_quality_notes) harvestDetails.harvest_quality_notes = harvest_quality_notes;
  if (completion_images) harvestDetails.completion_images = completion_images;

  const updated = await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: {
      status: 'completed',
      completed_at: new Date(),
      completed_by: req.user!.id,
      completion_notes: completion_notes || existing.completion_notes,
      harvest_details: harvestDetails,
    },
  });

  sendSuccess(res, updated, 'Harvest request completed successfully');
}));

// PUT /api/service-requests/:id/approve-pest-management
router.put('/:id/approve-pest-management', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agent_id, scheduled_date, cost_estimate, notes } = req.body;

  const existing = await prisma.serviceRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendNotFound(res, 'Service request not found'); return; }
  if (existing.service_type !== 'pest_control') { sendError(res, 'This endpoint is only for pest management requests', 400); return; }

  if (agent_id) {
    const agent = await prisma.user.findFirst({ where: { id: agent_id, role: 'agent', status: 'active' } });
    if (!agent) { sendError(res, 'Invalid or inactive agent', 400); return; }
  }

  const updated = await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: {
      status: 'approved',
      approved_at: new Date(),
      approved_by: req.user!.id,
      agent_id: agent_id || existing.agent_id,
      scheduled_date: scheduled_date ? new Date(scheduled_date) : existing.scheduled_date,
      cost_estimate: cost_estimate ?? existing.cost_estimate,
      notes: notes || existing.notes,
    },
  });

  sendSuccess(res, updated, 'Pest management request approved successfully');
}));

// PUT /api/service-requests/:id/approve-property-evaluation
router.put('/:id/approve-property-evaluation', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agent_id, scheduled_date, cost_estimate, notes } = req.body;

  const existing = await prisma.serviceRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendNotFound(res, 'Service request not found'); return; }
  if (existing.service_type !== 'other') { sendError(res, 'This endpoint is only for property evaluation requests', 400); return; }

  if (agent_id) {
    const agent = await prisma.user.findFirst({ where: { id: agent_id, role: 'agent', status: 'active' } });
    if (!agent) { sendError(res, 'Invalid or inactive agent', 400); return; }
  }

  const updated = await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: {
      status: 'approved',
      approved_at: new Date(),
      approved_by: req.user!.id,
      agent_id: agent_id || existing.agent_id,
      scheduled_date: scheduled_date ? new Date(scheduled_date) : existing.scheduled_date,
      cost_estimate: cost_estimate ?? existing.cost_estimate,
      notes: notes || existing.notes,
    },
  });

  sendSuccess(res, updated, 'Property evaluation request approved successfully');
}));

// GET /api/service-requests/:id
router.get('/:id', authenticate, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const request = await prisma.serviceRequest.findUnique({
    where: { id: req.params.id },
    include: {
      farmer: { select: { id: true, full_name: true, email: true, phone: true } },
      agent:  { select: { id: true, full_name: true, email: true, phone: true } },
    },
  });

  if (!request) {
    sendNotFound(res, 'Service request not found');
    return;
  }

  const role = req.user?.role;
  const userId = req.user?.id;

  if (role === 'farmer' && request.farmer_id !== userId) {
    sendError(res, 'Access denied', 403);
    return;
  }
  if (role === 'agent' && request.agent_id !== userId && request.agent_id !== null) {
    sendError(res, 'Access denied', 403);
    return;
  }

  sendSuccess(res, request, 'Service request retrieved successfully');
}));

// PUT /api/service-requests/:id/reject
router.put('/:id/reject', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { rejection_reason } = req.body;

  if (!rejection_reason) {
    sendError(res, 'Rejection reason is required', 400);
    return;
  }

  const existing = await prisma.serviceRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendNotFound(res, 'Service request not found'); return; }

  if (!['pending', 'approved'].includes(existing.status)) {
    sendError(res, `Cannot reject a request with status "${existing.status}"`, 400);
    return;
  }

  const updated = await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: {
      status: 'rejected',
      rejected_at: new Date(),
      rejected_by: req.user!.id,
      rejection_reason,
    },
  });

  sendSuccess(res, updated, 'Service request rejected');
}));

// PUT /api/service-requests/:id/assign
router.put('/:id/assign', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agent_id, scheduled_date } = req.body;

  if (!agent_id) {
    sendError(res, 'agent_id is required', 400);
    return;
  }

  const [existing, agent] = await Promise.all([
    prisma.serviceRequest.findUnique({ where: { id: req.params.id } }),
    prisma.user.findFirst({ where: { id: agent_id, role: 'agent', status: 'active' } }),
  ]);

  if (!existing) { sendNotFound(res, 'Service request not found'); return; }
  if (!agent) { sendError(res, 'Invalid or inactive agent', 400); return; }

  if (['completed', 'cancelled', 'rejected'].includes(existing.status)) {
    sendError(res, `Cannot assign an agent to a "${existing.status}" request`, 400);
    return;
  }

  const updated = await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: {
      agent_id,
      status: 'assigned',
      scheduled_date: scheduled_date ? new Date(scheduled_date) : existing.scheduled_date,
    },
  });

  sendSuccess(res, updated, 'Agent assigned successfully');
}));

// PUT /api/service-requests/:id/start
router.put('/:id/start', authenticate, authorize('admin', 'agent'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { start_notes } = req.body;

  const existing = await prisma.serviceRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendNotFound(res, 'Service request not found'); return; }

  if (req.user?.role === 'agent' && existing.agent_id !== req.user.id) {
    sendError(res, 'You can only start your assigned requests', 403);
    return;
  }

  if (!['approved', 'assigned'].includes(existing.status)) {
    sendError(res, `Cannot start a request with status "${existing.status}"`, 400);
    return;
  }

  const updated = await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: {
      status: 'in_progress',
      started_at: new Date(),
      start_notes: start_notes || existing.start_notes,
    },
  });

  sendSuccess(res, updated, 'Service request started');
}));

// PUT /api/service-requests/:id/cancel
router.put('/:id/cancel', authenticate, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { notes } = req.body;
  const existing = await prisma.serviceRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendNotFound(res, 'Service request not found'); return; }

  const role = req.user?.role;
  const userId = req.user?.id;

  if (role === 'farmer' && existing.farmer_id !== userId) {
    sendError(res, 'Access denied', 403);
    return;
  }

  if (role === 'farmer' && !['pending'].includes(existing.status)) {
    sendError(res, 'Farmers can only cancel pending requests', 400);
    return;
  }

  if (['completed', 'cancelled'].includes(existing.status)) {
    sendError(res, `Cannot cancel a "${existing.status}" request`, 400);
    return;
  }

  const updated = await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: {
      status: 'cancelled',
      notes: notes ? `${existing.notes || ''} | Cancellation: ${notes}`.trim() : existing.notes,
    },
  });

  sendSuccess(res, updated, 'Service request cancelled');
}));

// POST /api/service-requests/:id/feedback
router.post('/:id/feedback', authenticate, authorize('farmer'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { rating, comment } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    sendError(res, 'Rating must be between 1 and 5', 400);
    return;
  }

  const existing = await prisma.serviceRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendNotFound(res, 'Service request not found'); return; }

  if (existing.farmer_id !== req.user!.id) {
    sendError(res, 'Access denied', 403);
    return;
  }

  if (existing.status !== 'completed') {
    sendError(res, 'Feedback can only be submitted for completed requests', 400);
    return;
  }

  if (existing.feedback) {
    sendError(res, 'Feedback has already been submitted for this request', 400);
    return;
  }

  const updated = await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: {
      feedback: {
        rating,
        comment: comment || '',
        submitted_at: new Date().toISOString(),
      },
    },
  });

  sendSuccess(res, updated, 'Feedback submitted successfully');
}));

export default router;
