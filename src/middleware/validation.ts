import { body, query, param, validationResult, ValidationError as ExpressValidationError } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { sendValidationError } from '../utils/responses';
import { ValidationError } from '../types/api';

/**
 * Format express-validator errors to our standard format
 * @param errors - Express-validator errors
 * @returns ValidationError[] - Formatted validation errors
 */
const formatValidationErrors = (errors: ExpressValidationError[]): ValidationError[] => {
  return errors.map(error => {
    // Handle different types of validation errors
    if ('param' in error && typeof error.param === 'string') {
      return {
        field: error.param,
        message: error.msg,
        value: (error as any).value
      };
    } else {
      // Handle alternative validation errors
      return {
        field: 'unknown',
        message: error.msg,
        value: undefined
      };
    }
  });
};

/**
 * Validation middleware to check for validation errors
 * @param req - Express Request object
 * @param res - Express Response object
 * @param next - Express NextFunction
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

/**
 * Validation rules for user registration
 */
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

/**
 * Validation rules for user login
 */
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

/**
 * Validation rules for user profile update
 */
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

/**
 * Validation rules for password change
 */
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

/**
 * Validation rules for product creation
 */
export const validateProductCreation = [
  body('name')
    .isLength({ min: 2 })
    .withMessage('Product name must be at least 2 characters long')
    .trim(),
  
  body('category')
    .isIn([
      'seeds', 
      'fertilizers', 
      'pesticides', 
      'tools', 
      'equipment', 
      'produce', 
      'organic_inputs', 
      'livestock_feed',
      'irrigation',
      'other'
    ])
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

/**
 * Validation rules for order creation
 */
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

/**
 * Validation rules for service request creation
 */
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

/**
 * Validation rules for ID parameters
 */
export const validateIdParam = [
  param('id')
    .isMongoId()
    .withMessage('Invalid ID format'),
  
  validate
];

/**
 * Validation rules for pagination
 */
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
  validatePagination
};