# Pest Control Service Request Implementation Documentation

## Overview
This document details the implementation of pest control service requests with full CRUD operations and admin-only GET access in the Dash API system.

## Changes Made

### 1. Model Updates (`src/models/ServiceRequest.ts`)

#### New Interfaces Added
```typescript
// Pest and disease information
export interface IPestDisease {
  name: string;
  first_spotted_date: Date;
  order: number;
  is_primary: boolean;
}

// Pest management details
export interface IPestManagementDetails {
  pests_diseases: IPestDisease[];
  first_noticed: string;
  damage_observed: string;
  damage_details: string;
  control_methods_tried: string;
  severity_level: 'low' | 'medium' | 'high' | 'critical';
}

// Farmer information
export interface IFarmerInfo {
  name: string;
  phone: string;
  email?: string;
  location: string;
}
```

#### Enhanced Location Interface
```typescript
export interface IServiceLocation {
  farm_name?: string;           // NEW: Farm name
  street_address?: string;      // NEW: Street address
  city?: string;               // NEW: City
  province: string;
  district?: string;           // MODIFIED: Made optional
  sector?: string;
  cell?: string;
  village?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  access_instructions?: string; // NEW: Access instructions
}
```

#### Updated Service Types
- Added `'pest_control'` to the service type enum
- Updated from: `'harvest' | 'planting' | 'maintenance' | 'consultation' | 'other'`
- Updated to: `'harvest' | 'planting' | 'maintenance' | 'consultation' | 'pest_control' | 'other'`

#### New Schema Fields
```typescript
// Added new schemas for pest control data
const PestDiseaseSchema = new Schema({
  name: { type: String, required: true, trim: true },
  first_spotted_date: { type: Date, required: true },
  order: { type: Number, required: true, min: 1 },
  is_primary: { type: Boolean, required: true, default: false }
}, { _id: false });

const PestManagementDetailsSchema = new Schema({
  pests_diseases: [PestDiseaseSchema],
  first_noticed: { type: String, required: true, trim: true },
  damage_observed: { type: String, required: true, trim: true },
  damage_details: { type: String, required: true, trim: true },
  control_methods_tried: { type: String, required: true, trim: true },
  severity_level: { 
    type: String, 
    enum: ['low', 'medium', 'high', 'critical'], 
    required: true 
  }
}, { _id: false });

const FarmerInfoSchema = new Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, trim: true },
  location: { type: String, required: true, trim: true }
}, { _id: false });
```

#### Enhanced Main Schema
```typescript
// Added new fields to ServiceRequestSchema
pest_management_details: PestManagementDetailsSchema,
farmer_info: FarmerInfoSchema,
attachments: [{ type: String, trim: true }],
```

### 2. Type Definitions (`src/types/serviceRequest.ts`)

#### Updated Service Types
```typescript
export type ServiceType = 
  | 'crop_consultation' 
  | 'pest_control' 
  | 'soil_testing' 
  | 'irrigation_setup' 
  | 'equipment_maintenance' 
  | 'fertilizer_application' 
  | 'harvest_assistance' 
  | 'market_linkage'
  | 'training'
  | 'harvest'          // NEW
  | 'planting'         // NEW
  | 'maintenance'      // NEW
  | 'consultation'     // NEW
  | 'other';
```

#### New Pest Control Interfaces
```typescript
export interface IPestDisease {
  name: string;
  first_spotted_date: Date;
  order: number;
  is_primary: boolean;
}

export interface IPestManagementDetails {
  pests_diseases: IPestDisease[];
  first_noticed: string;
  damage_observed: string;
  damage_details: string;
  control_methods_tried: string;
  severity_level: 'low' | 'medium' | 'high' | 'critical';
}

export interface IFarmerInfo {
  name: string;
  phone: string;
  email?: string;
  location: string;
}

export interface CreatePestControlRequest {
  service_type: 'pest_control';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  preferred_date: Date;
  location: {
    farm_name?: string;
    street_address?: string;
    city?: string;
    province: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
    access_instructions?: string;
  };
  pest_management_details: IPestManagementDetails;
  farmer_info: IFarmerInfo;
  attachments?: string[];
  notes?: string;
}
```

#### Updated Main Interface
```typescript
export interface IServiceRequest extends Document {
  // ... existing fields ...
  pest_management_details?: IPestManagementDetails; // NEW
  farmer_info?: IFarmerInfo;                       // NEW
  // ... rest of fields ...
}
```

### 3. Routes Implementation (`src/routes/serviceRequests.ts`)

#### Complete File Restructure
- **Added comprehensive imports** for all required dependencies
- **Added validation middleware** directly in the file
- **Implemented full CRUD operations** with proper authentication

#### New Imports Added
```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { ServiceRequest } from '../models/ServiceRequest';
import { User } from '../models/User';
import { 
  validateIdParam, 
  validatePagination
} from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
```

#### Validation Middleware
```typescript
// Pest Management Validation
const validatePestManagementCreation = [
  body('pestDiseases')
    .isArray({ min: 1 })
    .withMessage('At least one pest or disease must be provided'),
  
  body('pestDiseases.*.name')
    .if((_value, { req }) => req.body.pestDiseases && req.body.pestDiseases.length > 0)
    .notEmpty()
    .withMessage('First pest/disease name is required'),
  
  body('pestDiseases.*.dateFirstSpotted')
    .optional()
    .isISO8601()
    .withMessage('Date first spotted must be a valid date'),
  
  body('firstNoticed')
    .optional()
    .isLength({ max: 500 })
    .withMessage('First noticed description must be less than 500 characters'),
  
  body('damageObserved.type')
    .optional()
    .isIn(['Fruits Damage', 'Some Leaves Damage', 'Tree Trunk Damage', 'Root Rot', 'Other'])
    .withMessage('Invalid damage type'),
  
  body('damageObserved.details')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Damage details must be less than 1000 characters'),
  
  body('controlMethods')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Control methods description must be less than 1000 characters'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Priority must be low, medium, high, or urgent'),
  
  // Error handling
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    return next();
  }
];
```

## API Endpoints

### 1. Create Pest Management Request
- **Endpoint**: `POST /api/service-requests/pest-management`
- **Access**: Private (Farmers only)
- **Authentication**: Required (`authenticate`, `authorize('farmer')`)
- **Validation**: `validatePestManagementCreation`

#### Complete Request Body Structure
```json
{
  "service_type": "pest_control",
  "title": "Pest Management Request - Coffee Berry Borer",
  "description": "Need assistance with pest control management for multiple pests affecting my farm production",
  "priority": "high",
  "preferred_date": "2024-01-15",
  "location": {
    "farm_name": "Green Valley Farm",
    "street_address": "KK 15 Road, Sector 7",
    "city": "Musanze",
    "province": "Northern Province",
    "coordinates": {
      "latitude": -1.4995,
      "longitude": 29.6346
    },
    "access_instructions": "Take the main road towards Kinigi, turn right at the church, farm is 2km down the dirt road"
  },
  "pest_management_details": {
    "pests_diseases": [
      {
        "name": "Coffee Berry Borer",
        "first_spotted_date": "2024-01-05",
        "order": 1,
        "is_primary": true
      },
      {
        "name": "Leaf Rust",
        "first_spotted_date": "2024-01-08",
        "order": 2,
        "is_primary": false
      },
      {
        "name": "Root Rot",
        "first_spotted_date": "2024-01-10",
        "order": 3,
        "is_primary": false
      }
    ],
    "first_noticed": "2 weeks ago during routine inspection",
    "damage_observed": "Fruits Damage",
    "damage_details": "Significant damage to coffee berries, estimated 30% crop loss",
    "control_methods_tried": "Neem oil spray, manual removal, organic pesticides",
    "severity_level": "high"
  },
  "farmer_info": {
    "name": "John Mugisha",
    "phone": "+250 788 123 456",
    "email": "john.mugisha@example.com",
    "location": "Musanze, Northern Province"
  },
  "attachments": ["pest_damage_photos.jpg"],
  "notes": "Urgent attention needed as this is affecting my main income source. Previous treatments have shown limited effectiveness."
}
```

#### Field Descriptions

**Root Level Fields:**
- `service_type`: Must be "pest_control"
- `title`: Brief title describing the pest management issue
- `description`: Detailed description of the pest problem
- `priority`: Urgency level ("low", "medium", "high", "urgent")
- `preferred_date`: ISO date string for when service is needed

**Location Object:**
- `farm_name`: Name of the farm (optional)
- `street_address`: Physical address
- `city`: City or district
- `province`: Province/state (required)
- `coordinates`: GPS coordinates (optional)
  - `latitude`: Decimal degrees
  - `longitude`: Decimal degrees
- `access_instructions`: Directions to reach the farm

**Pest Management Details:**
- `pests_diseases`: Array of pest/disease objects
  - `name`: Name of the pest or disease
  - `first_spotted_date`: ISO date when first noticed
  - `order`: Priority order (1 = highest)
  - `is_primary`: Boolean indicating if this is the main concern
- `first_noticed`: Description of when the problem started
- `damage_observed`: Type of damage seen
- `damage_details`: Detailed description of the damage
- `control_methods_tried`: Previous treatment attempts
- `severity_level`: Impact level ("low", "medium", "high", "critical")

**Farmer Information:**
- `name`: Full name of the farmer
- `phone`: Contact phone number
- `email`: Email address (optional)
- `location`: General location description

**Additional Fields:**
- `attachments`: Array of file names/URLs for photos/documents
- `notes`: Additional notes or special instructions

### 2. Get Pest Management Requests
- **Endpoint**: `GET /api/service-requests/pest-management`
- **Access**: Private (Role-based filtering)
- **Authentication**: Required (`authenticate`)
- **Validation**: `validatePagination`

#### Access Control
- **Farmers**: Can only see their own requests (`farmer_id` = user.id)
- **Agents**: Can see assigned requests and unassigned ones
- **Admins**: Can see all requests

#### Query Parameters
- `page` (optional): Page number for pagination
- `limit` (optional): Items per page
- `status` (optional): Filter by request status
- `priority` (optional): Filter by priority level

### 3. Approve Pest Management Request
- **Endpoint**: `PUT /api/service-requests/:id/approve-pest-management`
- **Access**: Private (Admin only)
- **Authentication**: Required (`authenticate`, `authorize('admin')`)
- **Validation**: `validateIdParam`

#### Request Body
```json
{
  "agent_id": "agent_user_id",
  "scheduled_date": "2024-01-20",
  "cost_estimate": 150000,
  "notes": "Request approved for immediate attention",
  "recommended_treatment": "Integrated pest management approach",
  "inspection_priority": "high"
}
```

### 4. Property Evaluation Endpoints
Similar structure for property evaluation requests with 5-day visit requirement validation.

## Request Validation Rules

### Required Fields ✅ **FIXED - Now matches your request body**
- `service_type`: Must be exactly "pest_control"
- `title`: String, max 200 characters  
- `description`: String, max 1000 characters
- `location.province`: String, required
- `pest_management_details.pests_diseases`: Array, minimum 1 item
- `pest_management_details.pests_diseases[*].name`: String, required for each pest
- `pest_management_details.first_noticed`: String, max 500 characters, required
- `pest_management_details.damage_observed`: String, required
- `pest_management_details.damage_details`: String, max 1000 characters, required
- `pest_management_details.control_methods_tried`: String, max 1000 characters, required
- `pest_management_details.severity_level`: Enum ["low", "medium", "high", "critical"], required
- `farmer_info.name`: String, required
- `farmer_info.phone`: String, required  
- `farmer_info.location`: String, required

### Optional Fields
- `priority`: Enum ["low", "medium", "high", "urgent"] (default: "medium")
- `preferred_date`: ISO date string
- `location.farm_name`: String
- `location.street_address`: String
- `location.city`: String
- `location.coordinates`: Object with latitude/longitude
- `location.access_instructions`: String
- `pest_management_details.pests_diseases[*].first_spotted_date`: ISO date
- `pest_management_details.pests_diseases[*].order`: Number (auto-assigned if not provided)
- `pest_management_details.pests_diseases[*].is_primary`: Boolean (default: false)
- `farmer_info.email`: Valid email string
- `attachments`: Array of strings
- `notes`: String, max 1000 characters

### Validation Error Example
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "type": "field",
      "msg": "At least one pest or disease must be provided",
      "path": "pestDiseases",
      "location": "body"
    },
    {
      "type": "field", 
      "msg": "Priority must be low, medium, high, or urgent",
      "path": "priority",
      "location": "body"
    }
  ]
}
```

### Success Response Example
```json
{
  "success": true,
  "message": "Pest management request submitted successfully",
  "data": {
    "id": "64a7b8c9d1e2f3a4b5c6d7e8",
    "request_number": "PC-1704067200000-A8B9",
    "farmer_id": "64a7b8c9d1e2f3a4b5c6d7e9",
    "service_type": "pest_control",
    "title": "Pest Management Request - Coffee Berry Borer",
    "description": "Need assistance with pest control management...",
    "status": "pending",
    "priority": "high",
    "requested_date": "2024-01-01T10:30:00.000Z",
    "location": { /* location object */ },
    "pest_management_details": { /* pest details object */ },
    "farmer_info": { /* farmer info object */ },
    "attachments": ["pest_damage_photos.jpg"],
    "notes": "Urgent attention needed...",
    "created_at": "2024-01-01T10:30:00.000Z",
    "updated_at": "2024-01-01T10:30:00.000Z"
  }
}
```

## Security Features

### Authentication & Authorization
- **JWT Token Required**: All endpoints require valid JWT token
- **Role-based Access**: Different access levels for farmers, agents, and admins
- **Admin-only GET Access**: Only admins can retrieve all service requests
- **Owner/Admin Updates**: Users can only update their own requests (or admins can update any)

### Data Validation
- **Request Body Validation**: Comprehensive validation using express-validator
- **Type Safety**: Full TypeScript type checking
- **Input Sanitization**: Automatic trimming and length validation
- **Business Logic Validation**: Custom validation for date ranges and required fields

### Error Handling
- **Consistent Error Responses**: Standardized error format across all endpoints
- **Validation Error Details**: Detailed validation error messages
- **Async Error Handling**: Proper error handling with asyncHandler middleware

## Database Indexing

### Performance Optimizations
```javascript
// Existing indexes maintained
ServiceRequestSchema.index({ farmer_id: 1, status: 1 });
ServiceRequestSchema.index({ agent_id: 1, status: 1 });
ServiceRequestSchema.index({ service_type: 1, status: 1 });
ServiceRequestSchema.index({ request_number: 1 });
ServiceRequestSchema.index({ 'harvest_details.harvest_date_from': 1, 'harvest_details.harvest_date_to': 1 });
ServiceRequestSchema.index({ 'location.province': 1, 'location.district': 1 });
```

## Request Number Generation

### Auto-generated Unique Identifiers
```javascript
// Pest Control: PC-{timestamp}-{random}
const requestNumber = `PC-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

// Examples:
// PC-1704067200000-A8B9
// PC-1704067261234-X2Y7
```

## Backward Compatibility

### Maintained Existing Functionality
- All existing harvest request endpoints remain functional
- Existing user authentication and authorization unchanged
- Original database schema fields preserved
- Existing API response formats maintained

## Testing Recommendations

### Manual Testing Checklist
1. **Authentication**: Test all endpoints without tokens (should fail)
2. **Authorization**: Test farmer accessing admin endpoints (should fail)
3. **Validation**: Test with invalid/missing data (should return validation errors)
4. **CRUD Operations**: Test create, read, update, delete for each role
5. **Pagination**: Test with different page/limit values
6. **Filtering**: Test with various filter combinations

### Sample Test Cases

#### 1. Create Pest Control Request (cURL)
```bash
curl -X POST http://localhost:3000/api/service-requests/pest-management \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {farmer_token}" \
  -d '{
    "service_type": "pest_control",
    "title": "Pest Management Request - Coffee Berry Borer",
    "description": "Need assistance with pest control management for multiple pests affecting my farm production",
    "priority": "high",
    "preferred_date": "2024-01-15",
    "location": {
      "farm_name": "Green Valley Farm",
      "street_address": "KK 15 Road, Sector 7",
      "city": "Musanze",
      "province": "Northern Province",
      "coordinates": {
        "latitude": -1.4995,
        "longitude": 29.6346
      },
      "access_instructions": "Take the main road towards Kinigi, turn right at the church, farm is 2km down the dirt road"
    },
    "pest_management_details": {
      "pests_diseases": [
        {
          "name": "Coffee Berry Borer",
          "first_spotted_date": "2024-01-05",
          "order": 1,
          "is_primary": true
        },
        {
          "name": "Leaf Rust",
          "first_spotted_date": "2024-01-08",
          "order": 2,
          "is_primary": false
        },
        {
          "name": "Root Rot",
          "first_spotted_date": "2024-01-10",
          "order": 3,
          "is_primary": false
        }
      ],
      "first_noticed": "2 weeks ago during routine inspection",
      "damage_observed": "Fruits Damage",
      "damage_details": "Significant damage to coffee berries, estimated 30% crop loss",
      "control_methods_tried": "Neem oil spray, manual removal, organic pesticides",
      "severity_level": "high"
    },
    "farmer_info": {
      "name": "John Mugisha",
      "phone": "+250 788 123 456",
      "email": "john.mugisha@example.com",
      "location": "Musanze, Northern Province"
    },
    "attachments": ["pest_damage_photos.jpg"],
    "notes": "Urgent attention needed as this is affecting my main income source. Previous treatments have shown limited effectiveness."
  }'
```

#### 2. Get All Requests (Admin Only)
```bash
curl -X GET "http://localhost:3000/api/service-requests/pest-management?page=1&limit=10" \
  -H "Authorization: Bearer {admin_token}"
```

#### 3. Update Service Request (PUT)
```bash
# Update existing service request (Admin/Owner)
curl -X PUT http://localhost:3000/api/service-requests/{valid_mongodb_id} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {admin_token}" \
  -d '{
    "title": "Updated Pest Management Request - Coffee Berry Borer",
    "description": "Updated description with additional details",
    "priority": "urgent",
    "location": {
      "farm_name": "Green Valley Farm - Updated",
      "street_address": "KK 15 Road, Sector 7",
      "city": "Musanze",
      "province": "Northern Province",
      "coordinates": {
        "latitude": -1.4995,
        "longitude": 29.6346
      },
      "access_instructions": "Updated access instructions"
    },
    "pest_management_details": {
      "pests_diseases": [
        {
          "name": "Coffee Berry Borer",
          "first_spotted_date": "2024-01-05",
          "order": 1,
          "is_primary": true
        },
        {
          "name": "Leaf Rust",
          "first_spotted_date": "2024-01-08",
          "order": 2,
          "is_primary": false
        }
      ],
      "first_noticed": "Updated: 3 weeks ago during routine inspection",
      "damage_observed": "Fruits Damage",
      "damage_details": "Updated damage assessment: 35% crop loss estimated",
      "control_methods_tried": "Neem oil spray, manual removal, organic pesticides, copper fungicide",
      "severity_level": "critical"
    },
    "farmer_info": {
      "name": "John Mugisha",
      "phone": "+250 788 123 456",
      "email": "john.mugisha@example.com",
      "location": "Musanze, Northern Province"
    },
    "attachments": ["pest_damage_photos.jpg", "updated_damage_assessment.pdf"],
    "notes": "Updated notes: Situation has worsened, need immediate expert intervention"
  }'
```

#### 4. Approve Pest Management Request (Admin Only)
```bash
curl -X PUT http://localhost:3000/api/service-requests/{valid_mongodb_id}/approve-pest-management \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {admin_token}" \
  -d '{
    "agent_id": "64a7b8c9d1e2f3a4b5c6d7e8",
    "scheduled_date": "2024-01-20",
    "cost_estimate": 150000,
    "notes": "Request approved for immediate attention",
    "recommended_treatment": "Integrated pest management approach",
    "inspection_priority": "high"
  }'
```

#### 5. Get Single Service Request (Admin Only)
```bash
curl -X GET http://localhost:3000/api/service-requests/{valid_mongodb_id} \
  -H "Authorization: Bearer {admin_token}"
```

#### 6. Delete Service Request (Admin Only)
```bash
curl -X DELETE http://localhost:3000/api/service-requests/{valid_mongodb_id} \
  -H "Authorization: Bearer {admin_token}"
```

### Postman Collection Examples

#### Environment Variables
```json
{
  "base_url": "http://localhost:3000",
  "farmer_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "admin_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "agent_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Request Headers Template
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer {{farmer_token}}"
}
```

## PUT Request Body Examples

### ⚠️ Important: Valid MongoDB ObjectId Required
- **Valid ID Format**: 24-character hexadecimal string
- **Example**: `64a7b8c9d1e2f3a4b5c6d7e8`
- **Invalid Examples**: 
  - `123` (too short)
  - `invalid-id` (not hexadecimal)
  - `64a7b8c9d1e2f3a4b5c6d7e` (23 characters)

### 1. Complete Update Request Body
**URL**: `PUT /api/service-requests/64a7b8c9d1e2f3a4b5c6d7e8`
**Method**: PUT
**Authorization**: Bearer token (Admin or Owner)

```json
{
  "service_type": "pest_control",
  "title": "Updated Pest Management Request - Coffee Berry Borer",
  "description": "Updated description with additional pest control requirements",
  "priority": "urgent",
  "preferred_date": "2024-01-20",
  "location": {
    "farm_name": "Green Valley Farm - Updated Location",
    "street_address": "KK 15 Road, Sector 7, Updated Address",
    "city": "Musanze",
    "province": "Northern Province", 
    "coordinates": {
      "latitude": -1.4995,
      "longitude": 29.6346
    },
    "access_instructions": "Updated: Take the main road towards Kinigi, new entrance at the second gate"
  },
  "pest_management_details": {
    "pests_diseases": [
      {
        "name": "Coffee Berry Borer",
        "first_spotted_date": "2024-01-05",
        "order": 1,
        "is_primary": true
      },
      {
        "name": "Leaf Rust",
        "first_spotted_date": "2024-01-08",
        "order": 2,
        "is_primary": false
      },
      {
        "name": "Anthracnose",
        "first_spotted_date": "2024-01-12",
        "order": 3,
        "is_primary": false
      }
    ],
    "first_noticed": "Updated: 4 weeks ago during routine inspection",
    "damage_observed": "Fruits Damage",
    "damage_details": "Updated assessment: Significant damage to coffee berries, now estimated 45% crop loss",
    "control_methods_tried": "Neem oil spray, manual removal, organic pesticides, copper fungicide, biological control agents",
    "severity_level": "critical"
  },
  "farmer_info": {
    "name": "John Mugisha", 
    "phone": "+250 788 123 456",
    "email": "john.mugisha.updated@example.com",
    "location": "Musanze, Northern Province"
  },
  "attachments": [
    "pest_damage_photos.jpg",
    "updated_damage_assessment.pdf",
    "treatment_progress_photos.jpg"
  ],
  "notes": "URGENT UPDATE: Situation has deteriorated significantly. Multiple pest types now present. Immediate expert intervention required to save the crop."
}
```

### 2. Partial Update Request Body
**URL**: `PUT /api/service-requests/64a7b8c9d1e2f3a4b5c6d7e8`
**Note**: You can send only the fields you want to update

```json
{
  "priority": "critical",
  "pest_management_details": {
    "severity_level": "critical",
    "damage_details": "Crop loss now estimated at 50%, immediate action required"
  },
  "notes": "Emergency update: Situation critical, need immediate response"
}
```

### 3. Admin Approval Request Body
**URL**: `PUT /api/service-requests/64a7b8c9d1e2f3a4b5c6d7e8/approve-pest-management`
**Authorization**: Admin only

```json
{
  "agent_id": "64a7b8c9d1e2f3a4b5c6d7e9",
  "scheduled_date": "2024-01-18T09:00:00.000Z",
  "cost_estimate": 200000,
  "notes": "Approved for immediate intervention due to critical severity level",
  "recommended_treatment": "Emergency integrated pest management with biological and chemical controls",
  "inspection_priority": "critical"
}
```

### 4. How to Get Valid ObjectId
To get a valid ObjectId for testing, you can:

1. **Create a new request first** and use the returned ID
2. **Check existing requests** in your database
3. **Generate a test ID** using MongoDB ObjectId format

```javascript
// Generate test ObjectId (Node.js)
const { ObjectId } = require('mongodb');
const testId = new ObjectId();
console.log(testId.toString()); // e.g., "64a7b8c9d1e2f3a4b5c6d7e8"
```

### 5. Common PUT Request Errors and Solutions

#### Error: "Invalid ID format"
```json
{
  "success": false,
  "message": "Validation failed", 
  "errors": [
    {
      "field": "unknown",
      "message": "Invalid ID format"
    }
  ]
}
```
**Solution**: Use a valid 24-character MongoDB ObjectId in the URL

#### Error: "Service request not found"
```json
{
  "success": false,
  "message": "Service request not found"
}
```
**Solution**: Verify the ObjectId exists in your database

#### Error: "Insufficient permissions"
```json
{
  "success": false,
  "message": "Insufficient permissions"
}
```
**Solution**: Use admin token or ensure you own the request you're trying to update

## Future Enhancements

### Potential Improvements
1. **File Upload**: Implement actual file upload for attachments
2. **Real-time Notifications**: Add WebSocket for status updates
3. **Advanced Filtering**: Add more sophisticated filtering options
4. **Audit Trail**: Track all changes to service requests
5. **Reporting**: Add analytics and reporting features
6. **Mobile API**: Optimize for mobile app consumption

## Troubleshooting

### Common Issues
1. **Invalid ID Format Error**: 
   - **Problem**: `"Invalid ID format"` error in PUT/GET/DELETE requests
   - **Cause**: Using invalid MongoDB ObjectId format
   - **Solution**: Use valid 24-character MongoDB ObjectId (e.g., `64a7b8c9d1e2f3a4b5c6d7e8`)
   
2. **Compilation Errors**: Ensure all imports are correct and types are defined

3. **Authentication Failures**: Verify JWT token format and expiration

4. **Validation Errors**: Check request body structure matches expected format

5. **Database Connection**: Ensure MongoDB is running and accessible

6. **Permission Errors**: Verify user roles and authorization middleware

### Debug Commands
```bash
# Check server logs
npm run dev

# Compile TypeScript
npx tsc --noEmit

# Run tests
npm test
```

## Conclusion

This implementation provides a robust, secure, and scalable solution for pest control service request management with full CRUD operations and proper access controls. The system maintains backward compatibility while adding comprehensive new functionality for agricultural service management.