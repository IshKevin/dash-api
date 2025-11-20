import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { PestDisease } from '../models/PestDisease';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess, sendCreated, sendNotFound } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

// VALIDATION MIDDLEWARE
const validatePestDiseaseCreation = [
  body('type')
    .notEmpty()
    .isIn(['pest', 'disease'])
    .withMessage('Type must be either pest or disease'),
  
  body('name')
    .notEmpty()
    .isLength({ min: 2, max: 200 })
    .withMessage('Name is required and must be between 2-200 characters'),
  
  body('scientific_name')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Scientific name cannot exceed 200 characters'),
  
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters'),
  
  body('damage_description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Damage description cannot exceed 1000 characters'),
  
  (req: Request, res: Response, next: Function): void => {
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
 * @route   POST /api/pest-disease
 * @desc    Create new pest or disease (Admin only)
 * @access  Private (Admin only)
 */
router.post('/', authenticate, authorize('admin'), validatePestDiseaseCreation, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    type,
    name,
    scientific_name,
    description,
    symptoms,
    damage_description,
    common_crops_affected,
    severity_indicators,
    prevention_methods,
    treatment_methods,
    image_url
  } = req.body;

  const pestDisease = new PestDisease({
    type,
    name,
    scientific_name,
    description,
    symptoms: symptoms || [],
    damage_description,
    common_crops_affected: common_crops_affected || [],
    severity_indicators: severity_indicators || [],
    prevention_methods: prevention_methods || [],
    treatment_methods: treatment_methods || [],
    image_url,
    is_active: true,
    created_by: req.user?.id
  });

  await pestDisease.save();

  sendCreated(res, pestDisease.toPublicJSON(), `${type === 'pest' ? 'Pest' : 'Disease'} created successfully`);
}));

/**
 * @route   GET /api/pest-disease
 * @desc    Get all pests and diseases (for dropdown/selection)
 * @access  Public (Authenticated users)
 */
router.get('/', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, active_only } = req.query;

  const filter: any = {};
  
  if (type && (type === 'pest' || type === 'disease')) {
    filter.type = type;
  }
  
  if (active_only === 'true') {
    filter.is_active = true;
  }

  const pestsAndDiseases = await PestDisease.find(filter)
    .sort({ type: 1, name: 1 })
    .select('type name scientific_name description symptom_category damage_category symptoms damage_description image_url is_active');

  const formattedData = pestsAndDiseases.map(item => ({
    id: item._id,
    type: item.type,
    name: item.name,
    scientific_name: item.scientific_name,
    description: item.description,
    symptom_category: item.symptom_category,
    damage_category: item.damage_category,
    symptoms: item.symptoms,
    damage_description: item.damage_description,
    image_url: item.image_url,
    is_active: item.is_active
  }));

  // Group by type for easier frontend handling
  const grouped = {
    pests: formattedData.filter(item => item.type === 'pest'),
    diseases: formattedData.filter(item => item.type === 'disease'),
    total: formattedData.length
  };

  sendSuccess(res, grouped, 'Pests and diseases retrieved successfully');
}));

/**
 * @route   GET /api/pest-disease/mappings
 * @desc    Get symptom-to-disease and damage-to-pest mappings for dropdowns
 * @access  Public (Authenticated users)
 */
router.get('/mappings/categories', authenticate, asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  // Get all active diseases with symptom categories
  const diseases = await PestDisease.find({ 
    type: 'disease', 
    is_active: true,
    symptom_category: { $exists: true, $ne: null }
  }).select('name symptom_category description symptoms');

  // Get all active pests with damage categories
  const pests = await PestDisease.find({ 
    type: 'pest', 
    is_active: true,
    damage_category: { $exists: true, $ne: null }
  }).select('name damage_category description damage_description');

  // Group diseases by symptom_category
  const symptomMap = new Map<string, any[]>();
  diseases.forEach(disease => {
    const category = disease.symptom_category!;
    if (!symptomMap.has(category)) {
      symptomMap.set(category, []);
    }
    symptomMap.get(category)!.push({
      id: disease._id,
      name: disease.name,
      description: disease.description,
      symptoms: disease.symptoms
    });
  });

  // Group pests by damage_category
  const damageMap = new Map<string, any[]>();
  pests.forEach(pest => {
    const category = pest.damage_category!;
    if (!damageMap.has(category)) {
      damageMap.set(category, []);
    }
    damageMap.get(category)!.push({
      id: pest._id,
      name: pest.name,
      description: pest.description,
      damage_description: pest.damage_description
    });
  });

  // Convert to array format for frontend
  const symptomCategories = Array.from(symptomMap.entries()).map(([category, diseases]) => ({
    category,
    diseases,
    count: diseases.length
  }));

  const damageCategories = Array.from(damageMap.entries()).map(([category, pests]) => ({
    category,
    pests,
    count: pests.length
  }));

  const mappings = {
    symptoms: symptomCategories,
    damages: damageCategories,
    total_symptom_categories: symptomCategories.length,
    total_damage_categories: damageCategories.length
  };

  sendSuccess(res, mappings, 'Category mappings retrieved successfully');
}));

/**
 * @route   GET /api/pest-disease/:id
 * @desc    Get single pest or disease details
 * @access  Public (Authenticated users)
 */
router.get('/:id', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const pestDisease = await PestDisease.findById(req.params.id);

  if (!pestDisease) {
    sendNotFound(res, 'Pest/Disease not found');
    return;
  }

  sendSuccess(res, pestDisease.toPublicJSON(), 'Pest/Disease details retrieved successfully');
}));

/**
 * @route   PUT /api/pest-disease/:id
 * @desc    Update pest or disease (Admin only)
 * @access  Private (Admin only)
 */
router.put('/:id', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const pestDisease = await PestDisease.findById(req.params.id);

  if (!pestDisease) {
    sendNotFound(res, 'Pest/Disease not found');
    return;
  }

  const {
    name,
    scientific_name,
    description,
    symptoms,
    damage_description,
    common_crops_affected,
    severity_indicators,
    prevention_methods,
    treatment_methods,
    image_url,
    is_active
  } = req.body;

  // Update fields
  if (name) pestDisease.name = name;
  if (scientific_name !== undefined) pestDisease.scientific_name = scientific_name;
  if (description !== undefined) pestDisease.description = description;
  if (symptoms !== undefined) pestDisease.symptoms = symptoms;
  if (damage_description !== undefined) pestDisease.damage_description = damage_description;
  if (common_crops_affected !== undefined) pestDisease.common_crops_affected = common_crops_affected;
  if (severity_indicators !== undefined) pestDisease.severity_indicators = severity_indicators;
  if (prevention_methods !== undefined) pestDisease.prevention_methods = prevention_methods;
  if (treatment_methods !== undefined) pestDisease.treatment_methods = treatment_methods;
  if (image_url !== undefined) pestDisease.image_url = image_url;
  if (is_active !== undefined) pestDisease.is_active = is_active;

  await pestDisease.save();

  sendSuccess(res, pestDisease.toPublicJSON(), 'Pest/Disease updated successfully');
}));

/**
 * @route   DELETE /api/pest-disease/:id
 * @desc    Delete (soft delete) pest or disease (Admin only)
 * @access  Private (Admin only)
 */
router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const pestDisease = await PestDisease.findById(req.params.id);

  if (!pestDisease) {
    sendNotFound(res, 'Pest/Disease not found');
    return;
  }

  // Soft delete by marking as inactive
  pestDisease.is_active = false;
  await pestDisease.save();

  sendSuccess(res, { id: pestDisease._id }, 'Pest/Disease deleted successfully');
}));

export default router;
