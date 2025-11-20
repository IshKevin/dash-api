import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { ServiceRequest } from '../models/ServiceRequest';
import { User } from '../models/User';
import { PestDisease } from '../models/PestDisease';
import { 
  validateIdParam, 
  validatePagination
} from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
// Import types only when needed
// import { 
//   CreateServiceRequestRequest, 
//   UpdateServiceRequestRequest, 
//   AgentAssignmentRequest, 
//   ServiceFeedbackRequest,
//   CreatePestControlRequest
// } from '../types/serviceRequest';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

// VALIDATION MIDDLEWARE FUNCTIONS
/**
 * Validate pest management request creation
 */
const validatePestManagementCreation = [
  // Admin format: disease object with name, symptoms, index
  body('disease.name')
    .optional()
    .isString()
    .isLength({ max: 200 })
    .withMessage('Disease name must be a string less than 200 characters'),
  
  body('disease.symptoms')
    .optional()
    .isString()
    .isLength({ max: 200 })
    .withMessage('Disease symptoms must be a string less than 200 characters'),
  
  body('disease.index')
    .optional()
    .isString()
    .withMessage('Disease index must be a string'),
  
  // Admin format: pest object with name, damage, index
  body('pest.name')
    .optional()
    .isString()
    .isLength({ max: 200 })
    .withMessage('Pest name must be a string less than 200 characters'),
  
  body('pest.damage')
    .optional()
    .isString()
    .isLength({ max: 200 })
    .withMessage('Pest damage must be a string less than 200 characters'),
  
  body('pest.index')
    .optional()
    .isString()
    .withMessage('Pest index must be a string'),
  
  // Farmer format: symptom/damage categories
  body('disease_symptoms')
    .optional()
    .isString()
    .isLength({ max: 200 })
    .withMessage('Disease symptom category must be a string less than 200 characters'),
  
  body('pest_damage')
    .optional()
    .isString()
    .isLength({ max: 200 })
    .withMessage('Pest damage category must be a string less than 200 characters'),
  
  // Legacy format: pest/disease IDs
  body('pest_id')
    .optional()
    .isMongoId()
    .withMessage('Invalid pest ID format'),
  
  body('disease_id')
    .optional()
    .isMongoId()
    .withMessage('Invalid disease ID format'),
  
  // At least one must be provided
  body().custom((_value, { req }) => {
    const hasDisease = req.body.disease?.name || req.body.disease_id || req.body.disease_symptoms;
    const hasPest = req.body.pest?.name || req.body.pest_id || req.body.pest_damage;
    const hasLegacy = req.body.diseaseInfo || req.body.pestInfo;
    
    if (!hasDisease && !hasPest && !hasLegacy) {
      throw new Error('At least one pest or disease must be provided');
    }
    return true;
  }),
  
  // Validate when pest was noticed
  body('pestNoticed')
    .notEmpty()
    .isIn(['this_week', 'this_month', 'few_months', 'over_6_months'])
    .withMessage('Pest noticed timeframe is required (this_week, this_month, few_months, over_6_months)'),
  
  // Validate control methods (optional now for admin)
  body('controlMethods')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Control methods must be less than 1000 characters'),
  
  // Validate images (optional)
  body('primaryImage')
    .optional()
    .isString()
    .withMessage('Primary image must be a string (base64 or URL)'),
  
  body('secondaryImage')
    .optional()
    .isString()
    .withMessage('Secondary image must be a string (base64 or URL)'),
  
  // Validate location
  body('location.province')
    .optional()
    .isString()
    .withMessage('Province must be a string'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Priority must be low, medium, high, or urgent'),
  
  // Handle validation errors
  (req: Request, res: Response, next: NextFunction): void => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
      return;
    }
    next();
  }
];

/**
 * Validate property evaluation request creation
 */
const validatePropertyEvaluationCreation = [
  body('irrigationSource')
    .notEmpty()
    .isIn(['Yes', 'No'])
    .withMessage('Irrigation source must be Yes or No'),
  
  body('irrigationTiming')
    .if(body('irrigationSource').equals('Yes'))
    .notEmpty()
    .isIn(['This Coming Season', 'Next Year'])
    .withMessage('Irrigation timing is required when irrigation source is Yes'),
  
  body('soilTesting')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Soil testing description must be less than 1000 characters'),
  
  body('visitStartDate')
    .notEmpty()
    .isISO8601()
    .withMessage('Visit start date is required and must be valid'),
  
  body('visitEndDate')
    .notEmpty()
    .isISO8601()
    .withMessage('Visit end date is required and must be valid'),
  
  body('evaluationPurpose')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Evaluation purpose must be less than 1000 characters'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Priority must be low, medium, high, or urgent'),
  
  // Location validation
  body('location.province')
    .notEmpty()
    .withMessage('Province is required for location'),
  
  body('location.district')
    .optional()
    .isLength({ max: 100 })
    .withMessage('District must be less than 100 characters'),
  
  body('location.farm_name')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Farm name must be less than 200 characters'),
  
  // Custom validation for date range
  body('visitEndDate').custom((endDate, { req }) => {
    if (req.body.visitStartDate && endDate) {
      const startDate = new Date(req.body.visitStartDate);
      const endDateObj = new Date(endDate);
      const diffTime = Math.abs(endDateObj.getTime() - startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays !== 4) { // 5-day range (inclusive)
        throw new Error('Visit date range must be exactly 5 days');
      }
      
      if (endDateObj <= startDate) {
        throw new Error('Visit end date must be after start date');
      }
    }
    return true;
  }),
  
  // Handle validation errors
  (req: Request, res: Response, next: NextFunction): void => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
      return;
    }
    next();
  }
];

/**
 * Validate harvest request creation
 */
const validateHarvestRequestCreation = [
  body('workersNeeded')
    .isInt({ min: 1 })
    .withMessage('Workers needed must be a positive integer'),
  
  body('equipmentNeeded')
    .optional()
    .isArray()
    .withMessage('Equipment needed must be an array'),
  
  body('treesToHarvest')
    .isInt({ min: 1 })
    .withMessage('Trees to harvest must be a positive integer'),
  
  body('harvestDateFrom')
    .isISO8601()
    .withMessage('Harvest start date must be a valid ISO date'),
  
  body('harvestDateTo')
    .isISO8601()
    .withMessage('Harvest end date must be a valid ISO date'),
  
  body('harvestImages')
    .optional()
    .isArray()
    .withMessage('Harvest images must be an array'),
  
  body('location.province')
    .notEmpty()
    .withMessage('Province is required'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Priority must be low, medium, high, or urgent'),
  
  // Custom validation for date range (max 5 days)
  body('harvestDateTo').custom((endDate, { req }) => {
    if (req.body.harvestDateFrom && endDate) {
      const startDate = new Date(req.body.harvestDateFrom);
      const endDateObj = new Date(endDate);
      const diffTime = Math.abs(endDateObj.getTime() - startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 5) {
        throw new Error('Harvest date range cannot exceed 5 days');
      }
      
      if (endDateObj < startDate) {
        throw new Error('Harvest end date must be after start date');
      }
    }
    return true;
  }),
  
  // Handle validation errors
  (req: Request, res: Response, next: NextFunction): void => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
      return;
    }
    next();
  }
];

/**
 * @route   POST /api/service-requests/pest-management
 * @desc    Create pest management request (farmers, agents, and admins)
 * @access  Private (Farmers, Agents, and Admins)
 */
router.post('/pest-management', authenticate, authorize('farmer', 'agent', 'admin'), validatePestManagementCreation, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      disease,           // ADMIN: { name, symptoms, index }
      pest,              // ADMIN: { name, damage, index }
      disease_symptoms,  // FARMER: Symptom category string (e.g., "Brown leaf tips and margins")
      pest_damage,       // FARMER: Damage category string (e.g., "Causes bronzing of leaves")
      pest_id,           // LEGACY: Direct pest ID
      disease_id,        // LEGACY: Direct disease ID
      diseaseInfo,       // LEGACY: Old format
      pestInfo,          // LEGACY: Old format
      pestNoticed,
      controlMethods = '',
      primaryImage,
      secondaryImage,
      location,
      priority = 'medium',
      notes,
      farmer_id // Optional: for agents/admins to create on behalf of a farmer
    } = req.body;

    // Determine the farmer_id
    let farmerId;
    const userRole = req.user?.role;
    
    if (userRole === 'farmer') {
      // Farmers create for themselves
      farmerId = req.user?.id;
    } else if (userRole === 'agent' || userRole === 'admin') {
      // Agents/Admins can create on behalf of farmers
      if (!farmer_id) {
        sendError(res, 'farmer_id is required when agent/admin creates a pest management request', 400);
        return;
      }
      
      // Verify the farmer exists
      const farmer = await User.findById(farmer_id);
      if (!farmer || farmer.role !== 'farmer') {
        sendError(res, 'Invalid farmer_id provided', 400);
        return;
      }
      
      farmerId = farmer_id;
    } else {
      sendError(res, 'Unauthorized to create pest management requests', 403);
      return;
    }

    // 🆕 ADMIN FORMAT: Process disease/pest objects with name, symptoms/damage, index
    let diseaseDetails = null;
    let pestDetails = null;
    
    // Handle ADMIN format: disease object
    if (disease && disease.name) {
      // For admin, we use the provided disease info directly
      diseaseDetails = {
        name: disease.name,
        symptom_category: disease.symptoms,
        index: disease.index
      };
    }
    // Handle FARMER format: symptom category lookup
    else if (disease_symptoms) {
      diseaseDetails = await PestDisease.findOne({
        type: 'disease',
        symptom_category: disease_symptoms,
        is_active: true
      });
      
      if (!diseaseDetails) {
        sendError(res, `No disease found for symptom: "${disease_symptoms}"`, 400);
        return;
      }
    }
    // Handle LEGACY: disease_id lookup
    else if (disease_id) {
      diseaseDetails = await PestDisease.findById(disease_id);
      if (!diseaseDetails || diseaseDetails.type !== 'disease') {
        sendError(res, 'Invalid disease_id provided', 400);
        return;
      }
    }
    
    // Handle ADMIN format: pest object
    if (pest && pest.name) {
      // For admin, we use the provided pest info directly
      pestDetails = {
        name: pest.name,
        damage_category: pest.damage,
        index: pest.index
      };
    }
    // Handle FARMER format: damage category lookup
    else if (pest_damage) {
      pestDetails = await PestDisease.findOne({
        type: 'pest',
        damage_category: pest_damage,
        is_active: true
      });
      
      if (!pestDetails) {
        sendError(res, `No pest found for damage type: "${pest_damage}"`, 400);
        return;
      }
    }
    // Handle LEGACY: pest_id lookup
    else if (pest_id) {
      pestDetails = await PestDisease.findById(pest_id);
      if (!pestDetails || pestDetails.type !== 'pest') {
        sendError(res, 'Invalid pest_id provided', 400);
        return;
      }
    }

    // Generate unique request number
    const requestNumber = `PC-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    // Map severity based on pestNoticed timeframe
    let severityLevel = 'medium';
    if (pestNoticed === 'this_week') severityLevel = 'critical';
    else if (pestNoticed === 'this_month') severityLevel = 'high';
    else if (pestNoticed === 'few_months') severityLevel = 'medium';
    else if (pestNoticed === 'over_6_months') severityLevel = 'low';

    // Fetch farmer details to get location if not provided
    const farmerUser = await User.findById(farmerId).select('full_name phone email profile');
    
    // Build location - use request location if provided, otherwise farmer's profile location
    let requestLocation: any = {};
    if (location && location.province) {
      requestLocation = location;
    } else if (farmerUser?.profile) {
      // Use farmer's profile location
      requestLocation = {
        province: farmerUser.profile.province || 'Unknown',
        district: farmerUser.profile.district,
        sector: farmerUser.profile.sector,
        cell: farmerUser.profile.cell,
        village: farmerUser.profile.village
      };
    } else {
      // Fallback to a default province if nothing is available
      requestLocation = { province: 'Not Specified' };
    }

    // Build pest/disease array with proper structure (NEW FORMAT WITH AUTO-FILLED NAMES)
    const pestsAndDiseases = [];
    let order = 1;
    let titleParts = [];
    let damageObserved = [];
    
    if (diseaseDetails) {
      const diseaseSymptoms = disease?.symptoms || disease_symptoms || diseaseDetails.symptom_category;
      const diseaseIndex = disease?.index || (diseaseDetails as any).index;
      pestsAndDiseases.push({
        name: diseaseDetails.name,
        type: 'disease',
        symptoms: diseaseSymptoms,
        index: diseaseIndex,
        first_spotted_date: new Date(),
        order: order++,
        is_primary: true // First one is primary
      });
      titleParts.push(diseaseDetails.name);
      if (diseaseSymptoms) damageObserved.push(diseaseSymptoms);
    } else if (diseaseInfo) {
      // Legacy format support
      pestsAndDiseases.push({
        name: diseaseInfo.disease,
        type: 'disease',
        symptoms: diseaseInfo.symptoms,
        first_spotted_date: new Date(),
        order: order++,
        is_primary: pestsAndDiseases.length === 0
      });
      titleParts.push(diseaseInfo.disease);
      if (diseaseInfo.symptoms) damageObserved.push(diseaseInfo.symptoms);
    }
    
    if (pestDetails) {
      const pestDamage = pest?.damage || pest_damage || pestDetails.damage_category;
      const pestIndex = pest?.index || (pestDetails as any).index;
      pestsAndDiseases.push({
        name: pestDetails.name,
        type: 'pest',
        damage: pestDamage,
        index: pestIndex,
        first_spotted_date: new Date(),
        order: order++,
        is_primary: pestsAndDiseases.length === 0
      });
      titleParts.push(pestDetails.name);
      if (pestDamage) damageObserved.push(pestDamage);
    } else if (pestInfo) {
      // Legacy format support
      pestsAndDiseases.push({
        name: pestInfo.pest,
        type: 'pest',
        damage: pestInfo.damage,
        first_spotted_date: new Date(),
        order: order++,
        is_primary: pestsAndDiseases.length === 0
      });
      titleParts.push(pestInfo.pest);
      if (pestInfo.damage) damageObserved.push(pestInfo.damage);
    }

    // Collect images
    const attachments = [];
    if (primaryImage) attachments.push(primaryImage);
    if (secondaryImage) attachments.push(secondaryImage);

    // Build farmer info for database (location as string)
    const farmerLocationString = [
      farmerUser?.profile?.village,
      farmerUser?.profile?.cell,
      farmerUser?.profile?.sector,
      farmerUser?.profile?.district,
      farmerUser?.profile?.province
    ].filter(Boolean).join(', ') || requestLocation.province || 'Location not specified';

    const pestManagementData = {
      farmer_id: farmerId,
      agent_id: userRole === 'agent' ? req.user?.id : undefined,
      service_type: 'pest_control',
      title: `Pest Control: ${titleParts.join(' & ')}`,
      description: damageObserved.join('; '),
      request_number: requestNumber,
      status: 'pending',
      priority: priority,
      requested_date: new Date(),
      location: requestLocation,
      
      // Pest management specific data
      pest_management_details: {
        pests_diseases: pestsAndDiseases,
        first_noticed: pestNoticed,
        damage_observed: damageObserved.join('; '),
        control_methods_tried: controlMethods,
        severity_level: severityLevel
      },
      
      // Farmer information
      farmer_info: {
        name: farmerUser?.full_name || 'Unknown',
        phone: farmerUser?.phone || 'N/A',
        email: farmerUser?.email,
        location: farmerLocationString
      },
      
      attachments: attachments,
      notes: notes || '',
      created_by: req.user?.id,
      created_at: new Date(),
      updated_at: new Date()
    };

    console.log('📝 Creating pest management request:', {
      farmerId,
      agentId: pestManagementData.agent_id,
      createdBy: req.user?.id,
      userRole,
      format: disease?.name || pest?.name ? 'ADMIN' : (disease_symptoms || pest_damage ? 'FARMER' : 'LEGACY'),
      location: requestLocation,
      pestsCount: pestsAndDiseases.length,
      diseaseAutoFilled: diseaseDetails ? diseaseDetails.name : 'none',
      pestAutoFilled: pestDetails ? pestDetails.name : 'none'
    });

    const serviceRequest = new ServiceRequest(pestManagementData);
    await serviceRequest.save();
    
    // Build farmer location for response
    const farmerLocation = farmerUser?.profile ? {
      province: farmerUser.profile.province,
      district: farmerUser.profile.district,
      sector: farmerUser.profile.sector,
      cell: farmerUser.profile.cell,
      village: farmerUser.profile.village
    } : requestLocation;
    
    // Build response with farmer information
    const responseData = {
      ...serviceRequest.toPublicJSON(),
      farmer_info: farmerUser ? {
        name: farmerUser.full_name,
        phone: farmerUser.phone || 'N/A',
        location: farmerLocation
      } : null
    };

    sendCreated(res, responseData, 'Pest management request submitted successfully');
    return;
  } catch (error: any) {
    console.error('❌ Error creating pest management request:', error);
    console.error('❌ Error details:', {
      message: error.message,
      name: error.name,
      errors: error.errors,
      stack: error.stack
    });
    
    // Send detailed error for debugging
    const errorMessage = error.message || 'Failed to create pest management request';
    sendError(res, errorMessage, 500);
    return;
  }
}));

/**
 * @route   POST /api/service-requests/property-evaluation
 * @desc    Create property evaluation request (farmers only)
 * @access  Private (Farmers only)
 */
router.post('/property-evaluation', authenticate, authorize('farmer'), validatePropertyEvaluationCreation, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      irrigationSource,
      irrigationTiming,
      soilTesting,
      visitStartDate,
      visitEndDate,
      evaluationPurpose,
      priority = 'medium',
      notes,
      location
    } = req.body;

    // Generate unique request number
    const requestNumber = `PROP-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    // Validate required fields
    if (!irrigationSource || !visitStartDate || !visitEndDate || !location?.province) {
      sendError(res, 'Irrigation source, visit start date, visit end date, and location with province are required', 400);
      return;
    }

    // Validate conditional field
    if (irrigationSource === 'Yes' && !irrigationTiming) {
      sendError(res, 'Irrigation timing is required when irrigation source is Yes', 400);
      return;
    }

    // Validate date range (should be 5 days)
    const startDate = new Date(visitStartDate);
    const endDate = new Date(visitEndDate);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays !== 4) { // 5-day range (inclusive)
      sendError(res, 'Visit date range must be exactly 5 days', 400);
      return;
    }

    const propertyEvaluationData = {
      farmer_id: req.user?.id,
      service_type: 'other',
      title: 'Property Evaluation Request',
      description: `Property evaluation request for ${irrigationSource === 'Yes' ? 'irrigation upgrade' : 'general evaluation'}`,
      request_number: requestNumber,
      status: 'pending',
      priority: priority,
      requested_date: new Date(),
      
      // Location is required by ServiceRequest model
      location: {
        province: location?.province || 'Unknown',
        district: location?.district || '',
        farm_name: location?.farm_name || '',
        city: location?.city || '',
        sector: location?.sector || '',
        cell: location?.cell || '',
        village: location?.village || '',
        access_instructions: location?.access_instructions || '',
        coordinates: location?.coordinates || undefined
      },
      
      // Property evaluation specific data
      property_evaluation_details: {
        irrigation_source: irrigationSource,
        irrigation_timing: irrigationSource === 'Yes' ? irrigationTiming : null,
        soil_testing: soilTesting || '',
        visit_start_date: new Date(visitStartDate),
        visit_end_date: new Date(visitEndDate),
        evaluation_purpose: evaluationPurpose || '',
        certified_valuation_requested: evaluationPurpose ? true : false
      },
      
      notes: notes || '',
      created_at: new Date(),
      updated_at: new Date()
    };

    const serviceRequest = new ServiceRequest(propertyEvaluationData);
    await serviceRequest.save();

    sendCreated(res, serviceRequest.toPublicJSON(), 'Property evaluation request submitted successfully');
    return;
  } catch (error) {
    console.error('Error creating property evaluation request:', error);
    sendError(res, 'Failed to create property evaluation request', 500);
    return;
  }
}));

/**
 * @route   GET /api/service-requests/pest-management/agent/me
 * @desc    Get pest management requests for the authenticated agent
 * @access  Private (Agents only)
 */
router.get('/pest-management/agent/me', authenticate, authorize('agent'), validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const skip = (page - 1) * limit;
    
    // Build filter for agent's pest management requests
    const filter: any = { 
      service_type: 'pest_control',
      agent_id: req.user?.id
    };
    
    // Add additional filters
    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.priority) {
      filter.priority = req.query.priority;
    }

    // Date range filter
    if (req.query.date_from || req.query.date_to) {
      filter.requested_date = {};
      if (req.query.date_from) {
        filter.requested_date.$gte = new Date(req.query.date_from as string);
      }
      if (req.query.date_to) {
        filter.requested_date.$lte = new Date(req.query.date_to as string);
      }
    }

    console.log('🔍 Agent pest management request filter:', filter);
    
    const requests = await ServiceRequest.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 })
      .populate('farmer_id', 'full_name email phone')
      .populate('agent_id', 'full_name email phone');
    
    const total = await ServiceRequest.countDocuments(filter);
    const requestData = requests.map(request => request.toPublicJSON());

    console.log(`📊 Found ${total} pest management requests for agent ${req.user?.id}`);
    
    sendPaginatedResponse(res, requestData, total, page, limit, 'Agent pest management requests retrieved successfully');
    return;
  } catch (error) {
    console.error('Error retrieving agent pest management requests:', error);
    sendError(res, 'Failed to retrieve agent pest management requests', 500);
    return;
  }
}));

/**
 * @route   GET /api/service-requests/pest-management
 * @desc    Get all pest management requests (filtered by role)
 * @access  Private
 */
router.get('/pest-management', authenticate, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const skip = (page - 1) * limit;
    
    // Build filter object based on user role
    const filter: any = { service_type: 'pest_control' };
    
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

    // Date range filter
    if (req.query.date_from || req.query.date_to) {
      filter.requested_date = {};
      if (req.query.date_from) {
        filter.requested_date.$gte = new Date(req.query.date_from as string);
      }
      if (req.query.date_to) {
        filter.requested_date.$lte = new Date(req.query.date_to as string);
      }
    }

    console.log('🔍 Pest management request filter:', filter);
    
    const requests = await ServiceRequest.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 })
      .populate('farmer_id', 'full_name email phone')
      .populate('agent_id', 'full_name email phone');
    
    const total = await ServiceRequest.countDocuments(filter);
    const requestData = requests.map(request => request.toPublicJSON());

    console.log(`📊 Found ${total} pest management requests for ${req.user?.role}`);
    
    sendPaginatedResponse(res, requestData, total, page, limit, 'Pest management requests retrieved successfully');
    return;
  } catch (error) {
    console.error('Error retrieving pest management requests:', error);
    sendError(res, 'Failed to retrieve pest management requests', 500);
    return;
  }
}));

/**
 * @route   GET /api/service-requests/property-evaluation
 * @desc    Get all property evaluation requests (filtered by role)
 * @access  Private
 */
router.get('/property-evaluation', authenticate, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    
    // Build filter object based on user role
    const filter: any = { service_type: 'other' };
    
    // Apply role-based filtering (same as harvest)
    if (req.user?.role === 'farmer') {
      filter.farmer_id = req.user.id;
    } else if (req.user?.role === 'agent') {
      filter.$or = [
        { agent_id: req.user.id },
        { agent_id: { $exists: false } },
        { agent_id: null }
      ];
    }
    
    // Add additional filters
    if (req.query.status) filter.status = req.query.status;
    if (req.query.priority) filter.priority = req.query.priority;
    
    // Date range filter for visit dates
    if (req.query.visit_date_from || req.query.visit_date_to) {
      if (req.query.visit_date_from) {
        filter['property_evaluation_details.visit_start_date'] = {
          $gte: new Date(req.query.visit_date_from as string)
        };
      }
      if (req.query.visit_date_to) {
        filter['property_evaluation_details.visit_end_date'] = { 
          $lte: new Date(req.query.visit_date_to as string) 
        };
      }
    }
    
    const requests = await ServiceRequest.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 })
      .populate('farmer_id', 'full_name email phone')
      .populate('agent_id', 'full_name email phone');
    
    const total = await ServiceRequest.countDocuments(filter);
    const requestData = requests.map(request => request.toPublicJSON());
    
    sendPaginatedResponse(res, requestData, total, page, limit, 'Property evaluation requests retrieved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to retrieve property evaluation requests', 500);
    return;
  }
}));

/**
 * @route   PUT /api/service-requests/:id/approve-pest-management
 * @desc    Approve pest management request (admin only)
 * @access  Private (Admin only)
 */
router.put('/:id/approve-pest-management', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = req.params.id;
    const { 
      agent_id, 
      scheduled_date, 
      cost_estimate, 
      notes,
      recommended_treatment,
      inspection_priority
    } = req.body;
    
    const serviceRequest = await ServiceRequest.findById(requestId);
    if (!serviceRequest) {
      sendNotFound(res, 'Service request not found');
      return;
    }

    if (serviceRequest.service_type !== 'pest_control') {
      sendError(res, 'This endpoint is only for pest management requests', 400);
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
    
    if (scheduled_date) serviceRequest.scheduled_date = new Date(scheduled_date);
    if (cost_estimate) serviceRequest.cost_estimate = cost_estimate;
    if (notes) serviceRequest.notes = notes;

    // Update pest management specific approved details
    if (recommended_treatment && notes) {
      serviceRequest.notes = `${notes}\nRecommended Treatment: ${recommended_treatment}`;
    }
    if (inspection_priority && serviceRequest.notes) {
      serviceRequest.notes = `${serviceRequest.notes}\nInspection Priority: ${inspection_priority}`;
    }
    
    await serviceRequest.save();

    sendSuccess(res, serviceRequest.toPublicJSON(), 'Pest management request approved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to approve pest management request', 500);
    return;
  }
}));

/**
 * @route   PUT /api/service-requests/:id/approve-property-evaluation
 * @desc    Approve property evaluation request (admin only)
 * @access  Private (Admin only)
 */
router.put('/:id/approve-property-evaluation', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = req.params.id;
    const { 
      agent_id, 
      scheduled_date, 
      cost_estimate, 
      notes,
      evaluation_type,
      specialist_required
    } = req.body;
    
    const serviceRequest = await ServiceRequest.findById(requestId);
    if (!serviceRequest) {
      sendNotFound(res, 'Service request not found');
      return;
    }

    if (serviceRequest.service_type !== 'other') {
      sendError(res, 'This endpoint is only for property evaluation requests', 400);
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
    
    if (scheduled_date) serviceRequest.scheduled_date = new Date(scheduled_date);
    if (cost_estimate) serviceRequest.cost_estimate = cost_estimate;
    if (notes) serviceRequest.notes = notes;

    // Update property evaluation specific approved details
    if (evaluation_type && notes) {
      serviceRequest.notes = `${notes}\nEvaluation Type: ${evaluation_type}`;
    }
    if (specialist_required !== undefined && serviceRequest.notes) {
      serviceRequest.notes = `${serviceRequest.notes}\nSpecialist Required: ${specialist_required}`;
    }
    
    await serviceRequest.save();

    sendSuccess(res, serviceRequest.toPublicJSON(), 'Property evaluation request approved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to approve property evaluation request', 500);
    return;
  }
}));

/**
 * @route   POST /api/service-requests/harvest
 * @desc    Create harvest request (farmers and agents)
 * @access  Private (Farmers and Agents)
 */
router.post('/harvest', authenticate, authorize('farmer', 'agent'), validateHarvestRequestCreation, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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
      notes,
      farmer_id // Optional: for agents to create on behalf of a farmer
    } = req.body;

    // Determine the farmer_id
    let farmerId;
    const userRole = req.user?.role;
    
    if (userRole === 'farmer') {
      // Farmers create for themselves
      farmerId = req.user?.id;
    } else if (userRole === 'agent') {
      // Agents can create on behalf of farmers
      if (!farmer_id) {
        sendError(res, 'farmer_id is required when agent creates a harvest request', 400);
        return;
      }
      
      // Verify the farmer exists
      const farmer = await User.findById(farmer_id);
      if (!farmer || farmer.role !== 'farmer') {
        sendError(res, 'Invalid farmer_id provided', 400);
        return;
      }
      
      farmerId = farmer_id;
    } else {
      sendError(res, 'Unauthorized to create harvest requests', 403);
      return;
    }

    // Generate unique request number
    const requestNumber = `HRV-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    const harvestRequestData = {
      farmer_id: farmerId,
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
      created_by: req.user?.id, // Track who created the request
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
 * @route   PUT /api/service-requests/:id/approve-harvest
 * @desc    Approve harvest request (admin only)
 * @access  Private (Admin only)
 */
router.put('/:id/approve-harvest', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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
    
    if (scheduled_date) serviceRequest.scheduled_date = new Date(scheduled_date);
    if (cost_estimate) serviceRequest.cost_estimate = cost_estimate;
    if (notes) serviceRequest.notes = notes;

    // Update harvest specific approved details
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
 * @route   PUT /api/service-requests/:id/complete-harvest
 * @desc    Complete harvest request (admin/agent only)
 * @access  Private (Admin/Agent only)
 */
router.put('/:id/complete-harvest', authenticate, authorize('admin', 'agent'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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

    // Agent can only complete their assigned requests
    if (req.user?.role === 'agent' && serviceRequest.agent_id !== req.user?.id) {
      sendError(res, 'You can only complete your assigned requests', 403);
      return;
    }
    
    // Update request status and details
    serviceRequest.status = 'completed';
    serviceRequest.completed_at = new Date();
    if (req.user?.id) {
      serviceRequest.completed_by = req.user.id;
    }
    
    if (completion_notes) serviceRequest.completion_notes = completion_notes;

    // Update harvest specific completion details
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

    sendSuccess(res, serviceRequest.toPublicJSON(), 'Harvest request completed successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to complete harvest request', 500);
    return;
  }
}));

export default router;