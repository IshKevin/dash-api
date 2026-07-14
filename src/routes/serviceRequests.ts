import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma';
import { validateIdParam, validatePagination } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import { notifyAllAdmins, notifyAgentAssignment, notifyFarmerServiceUpdate } from '../utils/notificationService';
import { documentService } from '../services/documentService';
import { putObject, PRIVATE_PREFIX } from '../config/minio';
import logger from '../config/logger';

const router = Router();

function generateRequestNumber(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

// SLA windows used to set ServiceRequest.due_date on assignment. Requests past
// their due_date are picked up by src/jobs/escalationJob.ts and escalated to
// urgent priority.
const SERVICE_TYPE_SLA_HOURS: Record<string, number> = {
  harvest: 72,
  planting: 96,
  maintenance: 96,
  consultation: 48,
  pest_control: 48,
  harvesting_plan: 96,
  ipm_routine: 48,
  other: 96,
};

function computeDueDate(serviceType: string): Date {
  const hours = SERVICE_TYPE_SLA_HOURS[serviceType] ?? 96;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

// Best-effort: renders a filled-in IPM form PDF for an approved IPM routine
// request and stores it as a Document. Failure here doesn't block approval.
async function generateIPMFormDocument(serviceRequest: { id: string; farmer_id: string; request_number: string; title: string; ipm_routine_details: unknown }): Promise<void> {
  try {
    const pdfBytes = await documentService.generateIPMForm(serviceRequest as any);
    const key = `${PRIVATE_PREFIX}/ipm-form-${serviceRequest.id}-${Date.now()}.pdf`;
    await putObject(key, pdfBytes, 'application/pdf');

    await prisma.document.create({
      data: {
        owner_id: serviceRequest.farmer_id,
        type: 'ipm_form',
        service_request_id: serviceRequest.id,
        file_url: key,
        file_key: key,
        mimetype: 'application/pdf',
      },
    });
  } catch (error) {
    logger.error(`Failed to generate IPM form document for service request ${serviceRequest.id}: ${error}`);
  }
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

const validateHarvestingPlan = [
  body('plannedHarvestDate').notEmpty().withMessage('Planned harvest date is required'),
  body('estimatedYield').notEmpty().withMessage('Estimated yield is required'),
  body('farmSize').notEmpty().withMessage('Farm size is required'),
  body('laborRequirement').notEmpty().withMessage('Labor requirement is required'),
  body('marketTarget').notEmpty().withMessage('Market target is required'),
  body('location').notEmpty().withMessage('Location is required'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  handleValidation,
];

const validateIPMRoutine = [
  body('scheduledDate').notEmpty().withMessage('Scheduled date is required'),
  body('farmSize').notEmpty().withMessage('Farm size is required'),
  body('pestType').isArray({ min: 1 }).withMessage('At least one pest type is required'),
  body('ipmMethod').isArray({ min: 1 }).withMessage('At least one IPM method is required'),
  body('laborRequired').notEmpty().withMessage('Labor required is required'),
  body('targetArea').notEmpty().withMessage('Target area is required'),
  body('location').notEmpty().withMessage('Location is required'),
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
  if (req.query.escalated === 'true') where.is_escalated = true;

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

  await notifyAllAdmins('info', 'New Service Request', 'A new service request has been submitted: ' + serviceRequest.title, serviceRequest.id);

  sendCreated(res, serviceRequest, 'Pest management request submitted successfully');
}));

// POST /api/service-requests/property-evaluation
router.post('/property-evaluation', authenticate, authorize('farmer'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { irrigationSource, irrigationTiming, soilTesting, visitStartDate, visitEndDate, evaluationPurpose, priority = 'medium', notes, location, property_details, certified_valuation_requested } = req.body;

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
        property_details: property_details || {},
        certified_valuation_requested: certified_valuation_requested || false,
      },
      notes: notes || '',
    },
  });

  await notifyAllAdmins('info', 'New Service Request', 'A new service request has been submitted: ' + serviceRequest.title, serviceRequest.id);

  sendCreated(res, serviceRequest, 'Property evaluation request submitted successfully');
}));

// PUT /api/service-requests/property-evaluation/:id
router.put('/property-evaluation/:id', authenticate, authorize('farmer'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { irrigationSource, irrigationTiming, soilTesting, visitStartDate, visitEndDate, evaluationPurpose, priority, notes, location, property_details, certified_valuation_requested } = req.body;

  const existing = await prisma.serviceRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendNotFound(res, 'Service request not found'); return; }
  if (existing.service_type !== 'other') { sendError(res, 'This endpoint is only for property evaluation requests', 400); return; }
  if (existing.farmer_id !== req.user!.id) { sendError(res, 'Access denied', 403); return; }
  if (existing.status !== 'pending') { sendError(res, 'Only pending requests can be edited', 400); return; }

  if (irrigationSource === 'Yes' && !irrigationTiming) {
    sendError(res, 'Irrigation timing is required when irrigation source is Yes', 400);
    return;
  }

  let startDate: Date | undefined;
  let endDate: Date | undefined;
  if (visitStartDate && visitEndDate) {
    startDate = new Date(visitStartDate);
    endDate = new Date(visitEndDate);
    const diffDays = Math.ceil(Math.abs(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays !== 4) {
      sendError(res, 'Visit date range must be exactly 5 days', 400);
      return;
    }
  }

  const existingDetails: any = existing.pest_management_details || {};

  const updated = await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: {
      priority: priority ? (priority as any) : existing.priority,
      notes: notes !== undefined ? notes : existing.notes,
      location: location || existing.location,
      pest_management_details: {
        ...existingDetails,
        irrigation_source: irrigationSource ?? existingDetails.irrigation_source,
        irrigation_timing: irrigationSource === 'Yes' ? irrigationTiming : (irrigationSource === 'No' ? null : existingDetails.irrigation_timing),
        soil_testing: soilTesting !== undefined ? soilTesting : existingDetails.soil_testing,
        visit_start_date: startDate || existingDetails.visit_start_date,
        visit_end_date: endDate || existingDetails.visit_end_date,
        evaluation_purpose: evaluationPurpose !== undefined ? evaluationPurpose : existingDetails.evaluation_purpose,
        property_details: property_details !== undefined ? property_details : existingDetails.property_details,
        certified_valuation_requested: certified_valuation_requested !== undefined ? certified_valuation_requested : existingDetails.certified_valuation_requested,
      },
    },
  });

  sendSuccess(res, updated, 'Property evaluation request updated successfully');
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

  await notifyAllAdmins('info', 'New Service Request', 'A new service request has been submitted: ' + serviceRequest.title, serviceRequest.id);

  sendCreated(res, serviceRequest, 'Harvest request submitted successfully');
}));

// POST /api/service-requests/harvesting-plan
router.post('/harvesting-plan', authenticate, authorize('farmer', 'agent'), validateHarvestingPlan, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    plannedHarvestDate, estimatedYield, farmSize, laborRequirement, marketTarget,
    location, priority = 'medium', notes, farmer_id, farmerInfo,
  } = req.body;

  let farmerId: string;
  if (req.user?.role === 'farmer') {
    farmerId = req.user.id;
  } else {
    if (!farmer_id) {
      sendError(res, 'farmer_id is required when agent creates a harvesting plan request', 400);
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
      service_type: 'harvesting_plan',
      title: 'Harvesting Plan Request',
      description: `Harvesting plan for ${farmSize} targeting ${marketTarget}`,
      request_number: generateRequestNumber('HP'),
      status: 'pending',
      priority: priority as any,
      requested_date: new Date(),
      location,
      harvesting_plan_details: { plannedHarvestDate, estimatedYield, farmSize, laborRequirement, marketTarget },
      farmer_info: farmerInfo,
      notes: notes || '',
    },
  });

  await notifyAllAdmins('info', 'New Service Request', 'A new service request has been submitted: ' + serviceRequest.title, serviceRequest.id);

  sendCreated(res, serviceRequest, 'Harvesting plan request submitted successfully');
}));

// POST /api/service-requests/ipm-routine
router.post('/ipm-routine', authenticate, authorize('farmer', 'agent'), validateIPMRoutine, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    scheduledDate, farmSize, pestType, ipmMethod, chemicalsNeeded, equipmentNeeded,
    laborRequired, targetArea, severity, preventiveMeasures, followUpDate, specialInstructions,
    location, priority, notes, farmer_id, farmerInfo,
  } = req.body;

  let farmerId: string;
  if (req.user?.role === 'farmer') {
    farmerId = req.user.id;
  } else {
    if (!farmer_id) {
      sendError(res, 'farmer_id is required when agent creates an IPM routine request', 400);
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
      service_type: 'ipm_routine',
      title: 'IPM Routine Request',
      description: `IPM routine for ${farmSize} hectares targeting ${Array.isArray(pestType) ? pestType.join(', ') : pestType}`,
      request_number: generateRequestNumber('IPM'),
      status: 'pending',
      priority: (priority || severity || 'medium') as any,
      requested_date: new Date(),
      location,
      ipm_routine_details: {
        scheduledDate, farmSize, pestType, ipmMethod, chemicalsNeeded, equipmentNeeded,
        laborRequired, targetArea, severity, preventiveMeasures, followUpDate, specialInstructions,
      },
      farmer_info: farmerInfo,
      notes: notes || '',
    },
  });

  await notifyAllAdmins('info', 'New Service Request', 'A new service request has been submitted: ' + serviceRequest.title, serviceRequest.id);

  sendCreated(res, serviceRequest, 'IPM routine request submitted successfully');
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

// GET /api/service-requests/harvesting-plan/agent/me
router.get('/harvesting-plan/agent/me', authenticate, authorize('agent'), validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  const where: any = { agent_id: req.user!.id, service_type: 'harvesting_plan' };

  if (req.query.status) where.status = req.query.status as any;

  const [requests, total] = await Promise.all([
    prisma.serviceRequest.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.serviceRequest.count({ where }),
  ]);

  sendPaginatedResponse(res, requests, total, page, limit, 'Harvesting plan requests retrieved successfully');
}));

// GET /api/service-requests/ipm-routine/agent/me
router.get('/ipm-routine/agent/me', authenticate, authorize('agent'), validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  const where: any = { agent_id: req.user!.id, service_type: 'ipm_routine' };

  if (req.query.status) where.status = req.query.status as any;

  const [requests, total] = await Promise.all([
    prisma.serviceRequest.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.serviceRequest.count({ where }),
  ]);

  sendPaginatedResponse(res, requests, total, page, limit, 'IPM routine requests retrieved successfully');
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

// GET /api/service-requests/harvesting-plan
router.get('/harvesting-plan', authenticate, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const where = buildRequestWhere(req, 'harvesting_plan');

  const [requests, total] = await Promise.all([
    prisma.serviceRequest.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.serviceRequest.count({ where }),
  ]);

  sendPaginatedResponse(res, requests, total, page, limit, 'Harvesting plan requests retrieved successfully');
}));

// GET /api/service-requests/ipm-routine
router.get('/ipm-routine', authenticate, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const where = buildRequestWhere(req, 'ipm_routine');

  const [requests, total] = await Promise.all([
    prisma.serviceRequest.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.serviceRequest.count({ where }),
  ]);

  sendPaginatedResponse(res, requests, total, page, limit, 'IPM routine requests retrieved successfully');
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

  await notifyFarmerServiceUpdate(updated.farmer_id, updated.id, 'Service Request Completed', 'Your service request has been completed: ' + updated.title);

  sendSuccess(res, updated, 'Harvest request completed successfully');
}));

// PUT /api/service-requests/:id/approve-harvesting-plan
router.put('/:id/approve-harvesting-plan', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agent_id, scheduled_date, cost_estimate, notes } = req.body;

  const existing = await prisma.serviceRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendNotFound(res, 'Service request not found'); return; }
  if (existing.service_type !== 'harvesting_plan') { sendError(res, 'This endpoint is only for harvesting plan requests', 400); return; }

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

  sendSuccess(res, updated, 'Harvesting plan request approved successfully');
}));

// PUT /api/service-requests/:id/complete-harvesting-plan
router.put('/:id/complete-harvesting-plan', authenticate, authorize('admin', 'agent'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { completion_notes, actual_yield, completion_images } = req.body;

  const existing = await prisma.serviceRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendNotFound(res, 'Service request not found'); return; }
  if (existing.service_type !== 'harvesting_plan') { sendError(res, 'This endpoint is only for harvesting plan requests', 400); return; }
  if (req.user?.role === 'agent' && existing.agent_id !== req.user.id) {
    sendError(res, 'You can only complete your assigned requests', 403); return;
  }

  const planDetails: any = { ...(existing.harvesting_plan_details as any || {}) };
  if (actual_yield) planDetails.actual_yield = actual_yield;
  if (completion_images) planDetails.completion_images = completion_images;

  const updated = await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: {
      status: 'completed',
      completed_at: new Date(),
      completed_by: req.user!.id,
      completion_notes: completion_notes || existing.completion_notes,
      harvesting_plan_details: planDetails,
    },
  });

  await notifyFarmerServiceUpdate(updated.farmer_id, updated.id, 'Service Request Completed', 'Your service request has been completed: ' + updated.title);

  sendSuccess(res, updated, 'Harvesting plan request completed successfully');
}));

// PUT /api/service-requests/:id/approve-ipm-routine
router.put('/:id/approve-ipm-routine', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agent_id, scheduled_date, cost_estimate, notes } = req.body;

  const existing = await prisma.serviceRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendNotFound(res, 'Service request not found'); return; }
  if (existing.service_type !== 'ipm_routine') { sendError(res, 'This endpoint is only for IPM routine requests', 400); return; }

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

  await generateIPMFormDocument(updated);

  sendSuccess(res, updated, 'IPM routine request approved successfully');
}));

// PUT /api/service-requests/:id/complete-ipm-routine
router.put('/:id/complete-ipm-routine', authenticate, authorize('admin', 'agent'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { completion_notes, treatment_outcome, completion_images } = req.body;

  const existing = await prisma.serviceRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendNotFound(res, 'Service request not found'); return; }
  if (existing.service_type !== 'ipm_routine') { sendError(res, 'This endpoint is only for IPM routine requests', 400); return; }
  if (req.user?.role === 'agent' && existing.agent_id !== req.user.id) {
    sendError(res, 'You can only complete your assigned requests', 403); return;
  }

  const ipmDetails: any = { ...(existing.ipm_routine_details as any || {}) };
  if (treatment_outcome) ipmDetails.treatment_outcome = treatment_outcome;
  if (completion_images) ipmDetails.completion_images = completion_images;

  const updated = await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: {
      status: 'completed',
      completed_at: new Date(),
      completed_by: req.user!.id,
      completion_notes: completion_notes || existing.completion_notes,
      ipm_routine_details: ipmDetails,
    },
  });

  await notifyFarmerServiceUpdate(updated.farmer_id, updated.id, 'Service Request Completed', 'Your service request has been completed: ' + updated.title);

  sendSuccess(res, updated, 'IPM routine request completed successfully');
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

// PUT /api/service-requests/:id/complete-pest-management
router.put('/:id/complete-pest-management', authenticate, authorize('admin', 'agent'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { completion_notes, treatment_applied, completion_images } = req.body;

  const existing = await prisma.serviceRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendNotFound(res, 'Service request not found'); return; }
  if (existing.service_type !== 'pest_control') { sendError(res, 'This endpoint is only for pest management requests', 400); return; }
  if (req.user?.role === 'agent' && existing.agent_id !== req.user.id) {
    sendError(res, 'You can only complete your assigned requests', 403); return;
  }

  const pestDetails: any = { ...(existing.pest_management_details as any || {}) };
  if (treatment_applied) pestDetails.treatment_applied = treatment_applied;
  if (completion_images) pestDetails.completion_images = completion_images;

  const updated = await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: {
      status: 'completed',
      completed_at: new Date(),
      completed_by: req.user!.id,
      completion_notes: completion_notes || existing.completion_notes,
      pest_management_details: pestDetails,
    },
  });

  await notifyFarmerServiceUpdate(updated.farmer_id, updated.id, 'Service Request Completed', 'Your service request has been completed: ' + updated.title);

  sendSuccess(res, updated, 'Pest management request completed successfully');
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

// PUT /api/service-requests/:id/complete-property-evaluation
router.put('/:id/complete-property-evaluation', authenticate, authorize('admin', 'agent'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { completion_notes, evaluation_report, follow_up_required, follow_up_date, attachments } = req.body;

  const existing = await prisma.serviceRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendNotFound(res, 'Service request not found'); return; }
  if (existing.service_type !== 'other') { sendError(res, 'This endpoint is only for property evaluation requests', 400); return; }
  if (req.user?.role === 'agent' && existing.agent_id !== req.user.id) {
    sendError(res, 'You can only complete your assigned requests', 403); return;
  }

  const pestDetails: any = { ...(existing.pest_management_details as any || {}) };
  if (evaluation_report) pestDetails.evaluation_report = evaluation_report;
  if (follow_up_required !== undefined) pestDetails.follow_up_required = follow_up_required;
  if (follow_up_date) pestDetails.follow_up_date = follow_up_date;

  const updated = await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: {
      status: 'completed',
      completed_at: new Date(),
      completed_by: req.user!.id,
      completion_notes: completion_notes || existing.completion_notes,
      attachments: attachments || existing.attachments,
      pest_management_details: pestDetails,
    },
  });

  await notifyFarmerServiceUpdate(updated.farmer_id, updated.id, 'Service Request Completed', 'Your service request has been completed: ' + updated.title);

  sendSuccess(res, updated, 'Property evaluation request completed successfully');
}));

// PUT /api/service-requests/:id/schedule-visit
router.put('/:id/schedule-visit', authenticate, authorize('admin', 'agent'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { visit_date, visit_time, estimated_duration, preparation_notes, farmer_instructions } = req.body;

  if (!visit_date || !visit_time) {
    sendError(res, 'visit_date and visit_time are required', 400);
    return;
  }

  const existing = await prisma.serviceRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendNotFound(res, 'Service request not found'); return; }
  if (existing.service_type !== 'other') { sendError(res, 'This endpoint is only for property evaluation requests', 400); return; }
  if (req.user?.role === 'agent' && existing.agent_id !== req.user.id) {
    sendError(res, 'You can only schedule visits for your assigned requests', 403); return;
  }

  const updated = await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: {
      scheduled_date: new Date(visit_date),
      visit_details: { visit_date, visit_time, estimated_duration, preparation_notes, farmer_instructions },
    },
  });

  await notifyFarmerServiceUpdate(updated.farmer_id, updated.id, 'Visit Scheduled', 'A visit has been scheduled for your service request: ' + updated.title);

  sendSuccess(res, updated, 'Visit scheduled successfully');
}));

// PUT /api/service-requests/:id/reschedule-visit
router.put('/:id/reschedule-visit', authenticate, authorize('admin', 'agent'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { new_visit_date, new_visit_time, reason } = req.body;

  if (!new_visit_date || !reason) {
    sendError(res, 'new_visit_date and reason are required', 400);
    return;
  }

  const existing = await prisma.serviceRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendNotFound(res, 'Service request not found'); return; }
  if (existing.service_type !== 'other') { sendError(res, 'This endpoint is only for property evaluation requests', 400); return; }
  if (req.user?.role === 'agent' && existing.agent_id !== req.user.id) {
    sendError(res, 'You can only reschedule visits for your assigned requests', 403); return;
  }

  const previousVisit = (existing.visit_details as any) || {};
  const history = Array.isArray(previousVisit.reschedule_history) ? previousVisit.reschedule_history : [];

  const updated = await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: {
      scheduled_date: new Date(new_visit_date),
      visit_details: {
        ...previousVisit,
        visit_date: new_visit_date,
        visit_time: new_visit_time || previousVisit.visit_time,
        reschedule_history: [...history, { previous_date: previousVisit.visit_date, previous_time: previousVisit.visit_time, reason, rescheduled_by: req.user!.id, rescheduled_at: new Date().toISOString() }],
      },
    },
  });

  await notifyFarmerServiceUpdate(updated.farmer_id, updated.id, 'Visit Rescheduled', 'The visit for your service request has been rescheduled: ' + updated.title);

  sendSuccess(res, updated, 'Visit rescheduled successfully');
}));

// GET /api/service-requests/property-evaluation/stats
router.get('/property-evaluation/stats', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const where: any = { service_type: 'other' };
  if (req.query.date_from || req.query.date_to) {
    where.created_at = {};
    if (req.query.date_from) where.created_at.gte = new Date(req.query.date_from as string);
    if (req.query.date_to) where.created_at.lte = new Date(req.query.date_to as string);
  }
  if (req.query.agent_id) where.agent_id = req.query.agent_id as string;
  if (req.query.province) where.location = { path: ['province'], equals: req.query.province as string };

  const [statusCounts, total, avgCost] = await Promise.all([
    prisma.serviceRequest.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.serviceRequest.count({ where }),
    prisma.serviceRequest.aggregate({ where, _avg: { cost_estimate: true, final_cost: true } }),
  ]);

  sendSuccess(res, {
    total,
    by_status: statusCounts.reduce((acc: any, s) => ({ ...acc, [s.status]: s._count._all }), {}),
    average_cost_estimate: avgCost._avg.cost_estimate,
    average_final_cost: avgCost._avg.final_cost,
  }, 'Property evaluation stats retrieved successfully');
}));

// GET /api/service-requests/farmer/:farmerId
router.get('/farmer/:farmerId', authenticate, authorize('admin', 'agent', 'farmer'), validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role === 'farmer' && req.user.id !== req.params.farmerId) {
    sendError(res, 'Access denied', 403);
    return;
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const where: any = { farmer_id: req.params.farmerId };
  if (req.query.status) where.status = req.query.status as any;
  if (req.query.service_type) where.service_type = req.query.service_type as any;

  const [requests, total] = await Promise.all([
    prisma.serviceRequest.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.serviceRequest.count({ where }),
  ]);

  sendPaginatedResponse(res, requests, total, page, limit, 'Service requests retrieved successfully');
}));

// GET /api/service-requests/agent/:agentId
router.get('/agent/:agentId', authenticate, authorize('admin', 'agent'), validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role === 'agent' && req.user.id !== req.params.agentId) {
    sendError(res, 'Access denied', 403);
    return;
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const where: any = { agent_id: req.params.agentId };
  if (req.query.status) where.status = req.query.status as any;
  if (req.query.service_type) where.service_type = req.query.service_type as any;

  const [requests, total] = await Promise.all([
    prisma.serviceRequest.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.serviceRequest.count({ where }),
  ]);

  sendPaginatedResponse(res, requests, total, page, limit, 'Service requests retrieved successfully');
}));

// PUT /api/service-requests/:id/status
router.put('/:id/status', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'approved', 'rejected', 'assigned', 'in_progress', 'completed', 'cancelled'];

  if (!status || !validStatuses.includes(status)) {
    sendError(res, `Status must be one of: ${validStatuses.join(', ')}`, 400);
    return;
  }

  const existing = await prisma.serviceRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendNotFound(res, 'Service request not found'); return; }

  const timestamps: any = {};
  if (status === 'approved') { timestamps.approved_at = new Date(); timestamps.approved_by = req.user!.id; }
  if (status === 'rejected') { timestamps.rejected_at = new Date(); timestamps.rejected_by = req.user!.id; }
  if (status === 'in_progress') timestamps.started_at = new Date();
  if (status === 'completed') { timestamps.completed_at = new Date(); timestamps.completed_by = req.user!.id; }

  const updated = await prisma.serviceRequest.update({
    where: { id: req.params.id },
    data: { status: status as any, ...timestamps },
  });

  await notifyFarmerServiceUpdate(updated.farmer_id, updated.id, 'Service Request Status Updated', 'Your service request status changed to: ' + status);

  sendSuccess(res, updated, 'Service request status updated successfully');
}));

// GET /api/service-requests/:id
router.get('/:id', authenticate, authorize('admin', 'agent', 'farmer'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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
      due_date: existing.due_date || computeDueDate(existing.service_type),
    },
  });

  await notifyAgentAssignment(updated.agent_id!, updated.id, updated.title);
  await notifyFarmerServiceUpdate(updated.farmer_id, updated.id, 'Agent Assigned', 'An agent has been assigned to your service request: ' + updated.title);

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
router.put('/:id/cancel', authenticate, authorize('admin', 'agent', 'farmer'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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

  if (role === 'agent' && existing.agent_id !== userId) {
    sendError(res, 'You can only cancel your assigned requests', 403);
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
