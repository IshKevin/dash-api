import { body, query, param, validationResult, ValidationError as ExpressValidationError } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { sendError, sendValidationError } from '../utils/responses';
import { ValidationError } from '../types/api';

/**
 * Format express-validator errors to our standard format
 */
const formatValidationErrors = (errors: ExpressValidationError[]): ValidationError[] => {
  return errors.map(error => {
    if ('param' in error && typeof error.param === 'string') {
      return {
        field: error.param,
        message: error.msg,
        value: (error as any).value
      };
    }
    return {
      field: 'unknown',
      message: error.msg,
      value: undefined
    };
  });
};

/**
 * Validation middleware to check for validation errors
 */
export const validate = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = formatValidationErrors(errors.array());
    sendValidationError(res, formattedErrors, 'Validation failed');
    return;
  }
  
  next();
};

// ============================================================================
// USER VALIDATIONS
// ============================================================================

export const validateUserRegistration = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number and one special character'),
  
  body('full_name')
    .isLength({ min: 2 })
    .withMessage('Full name must be at least 2 characters long')
    .trim(),
  
  body('phone')
    .optional()
    .isMobilePhone('any')
    .withMessage('Please provide a valid phone number'),
  
  body('role')
    .optional()
    .isIn(['admin', 'agent', 'farmer', 'shop_manager'])
    .withMessage('Role must be one of: admin, agent, farmer, shop_manager'),
  
  validate
];

export const validateUserLogin = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  
  validate
];

export const validateUserProfileUpdate = [
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('full_name')
    .optional()
    .isLength({ min: 2 })
    .withMessage('Full name must be at least 2 characters long')
    .trim(),
  
  body('phone')
    .optional()
    .isMobilePhone('any')
    .withMessage('Please provide a valid phone number'),
  
  body('role')
    .optional()
    .isIn(['admin', 'agent', 'farmer', 'shop_manager'])
    .withMessage('Role must be one of: admin, agent, farmer, shop_manager'),
  
  validate
];

export const validatePasswordChange = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number and one special character'),
  
  validate
];

// ============================================================================
// FARMER PROFILE VALIDATIONS
// ============================================================================

export const validateProfileCreation = [
  body('full_name')
    .notEmpty()
    .withMessage('Full name is required')
    .isLength({ min: 2 })
    .withMessage('Full name must be at least 2 characters long')
    .trim(),
  
  body('email')
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('gender')
    .notEmpty()
    .withMessage('Gender is required')
    .isIn(['Male', 'Female', 'Other'])
    .withMessage('Gender must be Male, Female, or Other'),
  
  body('age')
    .optional()
    .isInt({ min: 0, max: 150 })
    .withMessage('Age must be a valid number between 0 and 150'),
  
  body('phone')
    .optional()
    .matches(/^\+?[\d\s\-\(\)]{10,15}$/)
    .withMessage('Phone number must be a valid format with 10-15 digits'),
  
  body('marital_status')
    .optional()
    .isIn(['Single', 'Married', 'Divorced', 'Widowed'])
    .withMessage('Marital status must be Single, Married, Divorced, or Widowed'),
  
  body('education_level')
    .optional()
    .isIn(['Primary', 'Secondary', 'University', 'None'])
    .withMessage('Education level must be Primary, Secondary, University, or None'),
  
  body('id_number').optional().isString().trim(),
  body('province').optional().isString().trim(),
  body('district').optional().isString().trim(),
  body('sector').optional().isString().trim(),
  body('cell').optional().isString().trim(),
  body('village').optional().isString().trim(),
  
  body('farm_age')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Farm age must be a positive number'),
  
  body('planted').optional().isString().trim(),
  body('avocado_type').optional().isString().trim(),
  
  body('mixed_percentage')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Mixed percentage must be between 0 and 100'),
  
  body('farm_size')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Farm size must be a positive number'),
  
  body('tree_count')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Tree count must be a positive integer'),
  
  body('upi_number').optional().isString().trim(),
  body('farm_province').optional().isString().trim(),
  body('farm_district').optional().isString().trim(),
  body('farm_sector').optional().isString().trim(),
  body('farm_cell').optional().isString().trim(),
  body('farm_village').optional().isString().trim(),
  
  body('assistance')
    .optional()
    .isArray()
    .withMessage('Assistance must be an array'),
  
  body('image').optional().isString(),
  
  validate
];

export const validateProfileUpdate = [
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('full_name')
    .optional()
    .isLength({ min: 2 })
    .withMessage('Full name must be at least 2 characters long')
    .trim(),
  
  body('phone')
    .optional()
    .matches(/^\+?[\d\s\-\(\)]{10,15}$/)
    .withMessage('Phone number must be a valid format with 10-15 digits'),
  
  body('age')
    .optional()
    .isInt({ min: 0, max: 150 })
    .withMessage('Age must be a valid number between 0 and 150'),
  
  body('gender')
    .optional()
    .isIn(['Male', 'Female', 'Other'])
    .withMessage('Gender must be Male, Female, or Other'),
  
  body('marital_status')
    .optional()
    .isIn(['Single', 'Married', 'Divorced', 'Widowed'])
    .withMessage('Marital status must be Single, Married, Divorced, or Widowed'),
  
  body('education_level')
    .optional()
    .isIn(['Primary', 'Secondary', 'University', 'None'])
    .withMessage('Education level must be Primary, Secondary, University, or None'),
  
  body('id_number').optional().isString().trim(),
  body('province').optional().isString().trim(),
  body('district').optional().isString().trim(),
  body('sector').optional().isString().trim(),
  body('cell').optional().isString().trim(),
  body('village').optional().isString().trim(),
  
  body('farm_age')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Farm age must be a positive number'),
  
  body('planted').optional().isString().trim(),
  body('avocado_type').optional().isString().trim(),
  
  body('mixed_percentage')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Mixed percentage must be between 0 and 100'),
  
  body('farm_size')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Farm size must be a positive number'),
  
  body('tree_count')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Tree count must be a positive integer'),
  
  body('upi_number').optional().isString().trim(),
  body('farm_province').optional().isString().trim(),
  body('farm_district').optional().isString().trim(),
  body('farm_sector').optional().isString().trim(),
  body('farm_cell').optional().isString().trim(),
  body('farm_village').optional().isString().trim(),
  
  body('assistance')
    .optional()
    .isArray()
    .withMessage('Assistance must be an array'),
  
  body('image').optional().isString(),
  
  validate
];

// ============================================================================
// PRODUCT VALIDATIONS
// ============================================================================

export const validateProductCreation = [
  body('name')
    .isLength({ min: 2 })
    .withMessage('Product name must be at least 2 characters long')
    .trim(),
  
  body('category')
    .isIn(['irrigation', 'harvesting', 'containers', 'pest-management'])
    .withMessage('Category must be a valid product category'),
  
  body('price')
    .isFloat({ min: 0 })
    .withMessage('Price must be a non-negative number'),
  
  body('quantity')
    .isInt({ min: 0 })
    .withMessage('Quantity must be a non-negative integer'),
  
  body('unit')
    .isIn(['kg', 'g', 'lb', 'oz', 'ton', 'liter', 'ml', 'gallon', 'piece', 'dozen', 'box', 'bag', 'bottle', 'can', 'packet'])
    .withMessage('Unit must be a valid measurement unit'),
  
  body('supplier_id')
    .notEmpty()
    .withMessage('Supplier ID is required'),
  
  validate
];

// ============================================================================
// ORDER VALIDATIONS
// ============================================================================

export const validateOrderCreation = [
  body('customer_id')
    .notEmpty()
    .withMessage('Customer ID is required'),
  
  body('items')
    .isArray({ min: 1 })
    .withMessage('Order must have at least one item'),
  
  body('items.*.product_id')
    .notEmpty()
    .withMessage('Product ID is required for each item'),
  
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer'),
  
  body('shipping_address.full_name')
    .notEmpty()
    .withMessage('Shipping address full name is required'),
  
  body('shipping_address.phone')
    .notEmpty()
    .withMessage('Shipping address phone is required'),
  
  body('shipping_address.street_address')
    .notEmpty()
    .withMessage('Shipping address street is required'),
  
  body('shipping_address.city')
    .notEmpty()
    .withMessage('Shipping address city is required'),
  
  body('shipping_address.province')
    .notEmpty()
    .withMessage('Shipping address province is required'),
  
  validate
];

// ============================================================================
// SERVICE REQUEST VALIDATIONS
// ============================================================================

export const validateServiceRequestCreation = [
  body('farmer_id')
    .notEmpty()
    .withMessage('Farmer ID is required'),
  
  body('service_type')
    .isIn([
      'crop_consultation',
      'pest_control',
      'soil_testing',
      'irrigation_setup',
      'equipment_maintenance',
      'fertilizer_application',
      'harvest_assistance',
      'market_linkage',
      'training',
      'other'
    ])
    .withMessage('Service type must be a valid service type'),
  
  body('title')
    .isLength({ min: 5 })
    .withMessage('Title must be at least 5 characters long'),
  
  body('description')
    .isLength({ min: 10 })
    .withMessage('Description must be at least 10 characters long'),
  
  body('location.street_address')
    .notEmpty()
    .withMessage('Location street address is required'),
  
  body('location.city')
    .notEmpty()
    .withMessage('Location city is required'),
  
  body('location.province')
    .notEmpty()
    .withMessage('Location province is required'),
  
  validate
];

// ============================================================================
// HARVEST REQUEST VALIDATIONS
// ============================================================================

export const validateHarvestRequestCreation = (req: Request, res: Response, next: NextFunction) => {
  const {
    workersNeeded,
    equipmentNeeded,
    treesToHarvest,
    harvestDateFrom,
    harvestDateTo,
    hassBreakdown,
    location
  } = req.body;

  // Required fields
  if (!workersNeeded || !treesToHarvest || !harvestDateFrom || !harvestDateTo) {
    sendError(res, 'Workers needed, trees to harvest, and harvest dates are required', 400);
    return;
  }

  // Workers validation
  const workers = parseInt(workersNeeded);
  if (isNaN(workers) || workers < 1 || workers > 50) {
    sendError(res, 'Workers needed must be between 1 and 50', 400);
    return;
  }

  // Trees validation
  const trees = parseInt(treesToHarvest);
  if (isNaN(trees) || trees < 1) {
    sendError(res, 'Trees to harvest must be a positive number', 400);
    return;
  }

  // Date validations
  const fromDate = new Date(harvestDateFrom);
  const toDate = new Date(harvestDateTo);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (fromDate < today) {
    sendError(res, 'Harvest start date cannot be in the past', 400);
    return;
  }

  if (toDate < fromDate) {
    sendError(res, 'Harvest end date must be after start date', 400);
    return;
  }

  // Date range validation (max 30 days)
  const diffDays = Math.ceil(Math.abs(toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 30) {
    sendError(res, 'Harvest period cannot exceed 30 days', 400);
    return;
  }

  // Equipment validation
  if (equipmentNeeded && !Array.isArray(equipmentNeeded)) {
    sendError(res, 'Equipment needed must be an array', 400);
    return;
  }

  // HASS breakdown validation
  if (hassBreakdown?.selectedSizes && Array.isArray(hassBreakdown.selectedSizes)) {
    let totalPercentage = 0;
    
    for (const size of hassBreakdown.selectedSizes) {
      if (!['c12c14', 'c16c18', 'c20c24'].includes(size)) {
        sendError(res, 'Invalid size category in HASS breakdown', 400);
        return;
      }
      
      const percentage = parseInt(hassBreakdown[size] || 0);
      if (isNaN(percentage) || percentage < 0 || percentage > 100) {
        sendError(res, 'Each HASS percentage must be between 0 and 100', 400);
        return;
      }
      
      totalPercentage += percentage;
    }
    
    if (totalPercentage > 100) {
      sendError(res, 'Total HASS breakdown percentage cannot exceed 100%', 400);
      return;
    }
  }

  // Location validation
  if (location && (!location.province || !location.district)) {
    sendError(res, 'Province and district are required in location', 400);
    return;
  }

  next();
};

// ============================================================================
// COMMON VALIDATIONS
// ============================================================================

export const validateIdParam = [
  param('id')
    .isMongoId()
    .withMessage('Invalid ID format'),
  
  validate
];

export const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  
  validate
];

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

// ============================================================================
// LEGACY ALIAS (for backward compatibility)
// ============================================================================

/**
 * @deprecated Use validateProfileCreation or validateProfileUpdate instead
 * Legacy alias for backward compatibility with existing routes
 */
export const validateFarmerProfile = validateProfileUpdate;

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  validate,
  validateUserRegistration,
  validateUserLogin,
  validateUserProfileUpdate,
  validatePasswordChange,
  validateProductCreation,
  validateOrderCreation,
  validateServiceRequestCreation,
  validateIdParam,
  validatePagination,
  validateProfileUpdate,
  validateProfileCreation,
  validateFarmerProfile,
  validateHarvestRequestCreation
};