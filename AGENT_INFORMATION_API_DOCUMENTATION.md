# Agent Information API Documentation

Complete guide for managing agent profiles with territory management system.

## Table of Contents
- [Overview](#overview)
- [Authentication](#authentication)
- [Endpoints](#endpoints)
  - [Get Agent Profile](#get-agent-profile)
  - [Create Agent Profile](#create-agent-profile)
  - [Update Agent Profile](#update-agent-profile)
  - [Update Performance Metrics](#update-performance-metrics)
  - [Admin: Create Agent Profile](#admin-create-agent-profile)
  - [Admin: Get Agent Profile](#admin-get-agent-profile)
- [Data Models](#data-models)
- [Territory Management](#territory-management)
- [Examples](#examples)
- [Error Handling](#error-handling)

---

## Overview

The Agent Information API provides complete CRUD operations for managing agricultural extension agent profiles with advanced territory management capabilities.

### Key Features
- ✅ Multi-sector territory assignment (1-10 sectors per agent)
- ✅ Primary sector designation
- ✅ Automatic territory coverage calculation
- ✅ Performance statistics tracking
- ✅ Auto-incrementing agent IDs (AGT000001 format)
- ✅ Role-based access control (Agent & Admin)

### Base URL
```
/api/agent-information
```

---

## Authentication

All endpoints require JWT authentication via Bearer token.

**Header:**
```http
Authorization: Bearer <your_jwt_token>
```

**Roles:**
- `agent` - Can view and update their own profile
- `admin` - Full access to all agent profiles

---

## Endpoints

### Get Agent Profile

Retrieve the authenticated agent's complete profile with territory information.

**Endpoint:** `GET /api/agent-information`

**Access:** Private (Agents and Admins)

**Request Headers:**
```http
Authorization: Bearer <jwt_token>
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Profile retrieved successfully",
  "data": {
    "user_info": {
      "id": "68c7f1428b4e787b3dc49467",
      "full_name": "Pacific Ishimwe",
      "email": "pacific1@gmail.com",
      "phone": "0788937972",
      "role": "agent",
      "status": "active",
      "created_at": "2025-09-15T10:58:10.428Z",
      "updated_at": "2025-11-05T14:25:30.152Z"
    },
    "agent_profile": {
      "agentId": "AGT000001",
      "province": "Eastern Province",
      "territory": [
        {
          "district": "Gatsibo",
          "sector": "Kiramuruzi",
          "isPrimary": true,
          "assignedDate": "2025-09-15T10:58:10.428Z"
        },
        {
          "district": "Gatsibo",
          "sector": "Kabarore",
          "isPrimary": false,
          "assignedDate": "2025-11-05T14:25:30.152Z"
        },
        {
          "district": "Kayonza",
          "sector": "Gahini",
          "isPrimary": false,
          "assignedDate": "2025-11-05T14:25:30.152Z"
        }
      ],
      "territoryCoverage": {
        "totalDistricts": 2,
        "totalSectors": 3,
        "districts": ["Gatsibo", "Kayonza"]
      },
      "specialization": "Avocado Farming Expert",
      "experience": "5 years",
      "certification": "Agricultural Extension Certificate - Level 3",
      "statistics": {
        "farmersAssisted": 150,
        "totalTransactions": 350,
        "performance": "85%",
        "activeFarmers": 142,
        "territoryUtilization": "78%"
      },
      "profileImage": "https://example.com/profile.jpg"
    }
  },
  "meta": {
    "timestamp": "2025-11-05T14:25:30.152Z",
    "version": "1.0.0"
  }
}
```

**Error Responses:**
- `401 Unauthorized` - Invalid or missing token
- `403 Forbidden` - User is not an agent
- `404 Not Found` - User not found
- `500 Internal Server Error` - Server error

---

### Create Agent Profile

Create a new agent profile (self-registration).

**Endpoint:** `POST /api/agent-information/create`

**Access:** Private (Agents only)

**Request Headers:**
```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "province": "Eastern Province",
  "territory": [
    {
      "district": "Gatsibo",
      "sector": "Kiramuruzi",
      "isPrimary": true,
      "assignedDate": "2025-09-15T10:58:10.428Z"
    }
  ],
  "specialization": "Avocado Farming Expert",
  "experience": "5 years",
  "certification": "Agricultural Extension Certificate - Level 3",
  "profileImage": "https://example.com/profile.jpg"
}
```

**Success Response (201 Created):**
```json
{
  "success": true,
  "message": "Profile created successfully",
  "data": {
    "user_info": { /* user info */ },
    "agent_profile": {
      "agentId": "AGT000002",
      "province": "Eastern Province",
      "territory": [
        {
          "district": "Gatsibo",
          "sector": "Kiramuruzi",
          "isPrimary": true,
          "assignedDate": "2025-09-15T10:58:10.428Z"
        }
      ],
      "territoryCoverage": {
        "totalDistricts": 1,
        "totalSectors": 1,
        "districts": ["Gatsibo"]
      },
      "specialization": "Avocado Farming Expert",
      "experience": "5 years",
      "certification": "Agricultural Extension Certificate - Level 3",
      "statistics": {
        "farmersAssisted": 0,
        "totalTransactions": 0,
        "performance": "0%",
        "activeFarmers": 0,
        "territoryUtilization": "0%"
      },
      "profileImage": "https://example.com/profile.jpg"
    }
  }
}
```

**Validation Rules:**
- `territory` must be an array with 1-10 sectors
- At least one sector must have `isPrimary: true`
- `province` is required
- `district` and `sector` are required for each territory entry

**Error Responses:**
- `400 Bad Request` - Profile already exists or validation failed
- `401 Unauthorized` - Invalid token
- `403 Forbidden` - User is not an agent
- `500 Internal Server Error` - Server error

---

### Update Agent Profile

Update the authenticated agent's profile, including territory changes.

**Endpoint:** `PUT /api/agent-information`

**Access:** Private (Agents only)

**Request Headers:**
```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Pacific Ishimwe Updated",
  "phone": "0788937973",
  "agent_profile": {
    "province": "Eastern Province",
    "territory": [
      {
        "district": "Gatsibo",
        "sector": "Kiramuruzi",
        "isPrimary": true,
        "assignedDate": "2025-09-15T10:58:10.428Z"
      },
      {
        "district": "Gatsibo",
        "sector": "Kabarore",
        "isPrimary": false,
        "assignedDate": "2025-11-05T14:25:30.152Z"
      },
      {
        "district": "Kayonza",
        "sector": "Gahini",
        "isPrimary": false,
        "assignedDate": "2025-11-05T14:25:30.152Z"
      }
    ],
    "specialization": "Senior Avocado Farming Expert",
    "experience": "6 years",
    "certification": "Agricultural Extension Certificate - Level 4"
  }
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "user_info": {
      "id": "68c7f1428b4e787b3dc49467",
      "full_name": "Pacific Ishimwe Updated",
      "phone": "0788937973",
      /* ... other fields ... */
    },
    "agent_profile": {
      "agentId": "AGT000001",
      "province": "Eastern Province",
      "territory": [
        {
          "district": "Gatsibo",
          "sector": "Kiramuruzi",
          "isPrimary": true,
          "assignedDate": "2025-09-15T10:58:10.428Z"
        },
        {
          "district": "Gatsibo",
          "sector": "Kabarore",
          "isPrimary": false,
          "assignedDate": "2025-11-05T14:25:30.152Z"
        },
        {
          "district": "Kayonza",
          "sector": "Gahini",
          "isPrimary": false,
          "assignedDate": "2025-11-05T14:25:30.152Z"
        }
      ],
      "territoryCoverage": {
        "totalDistricts": 2,
        "totalSectors": 3,
        "districts": ["Gatsibo", "Kayonza"]
      },
      "specialization": "Senior Avocado Farming Expert",
      "experience": "6 years",
      "certification": "Agricultural Extension Certificate - Level 4",
      "statistics": { /* unchanged */ }
    }
  }
}
```

**Validation Rules:**
- Territory array must contain 1-10 sectors
- At least one sector must be primary
- Cannot update agentId (auto-generated)

**Error Responses:**
- `400 Bad Request` - Validation failed or invalid territory
- `404 Not Found` - Profile not found
- `500 Internal Server Error` - Server error

---

### Update Performance Metrics

Update agent's performance statistics.

**Endpoint:** `PUT /api/agent-information/performance`

**Access:** Private (Agents only)

**Request Headers:**
```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "statistics": {
    "farmersAssisted": 175,
    "totalTransactions": 425,
    "performance": "90%",
    "activeFarmers": 165,
    "territoryUtilization": "82%"
  }
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Performance metrics updated successfully",
  "data": {
    "user_info": { /* user info */ },
    "agent_profile": {
      "agentId": "AGT000001",
      /* ... other fields ... */
      "statistics": {
        "farmersAssisted": 175,
        "totalTransactions": 425,
        "performance": "90%",
        "activeFarmers": 165,
        "territoryUtilization": "82%"
      }
    }
  }
}
```

**Error Responses:**
- `400 Bad Request` - Invalid statistics data
- `404 Not Found` - Profile not found
- `500 Internal Server Error` - Server error

---

### Admin: Create Agent Profile

Create agent profile for any user (admin only).

**Endpoint:** `POST /api/agent-information/admin/create`

**Access:** Private (Admin only)

**Request Headers:**
```http
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "userId": "68c7f1428b4e787b3dc49467",
  "agent_profile": {
    "province": "Eastern Province",
    "territory": [
      {
        "district": "Gatsibo",
        "sector": "Kiramuruzi",
        "isPrimary": true,
        "assignedDate": "2025-09-15T10:58:10.428Z"
      },
      {
        "district": "Gatsibo",
        "sector": "Kabarore",
        "isPrimary": false,
        "assignedDate": "2025-11-05T14:25:30.152Z"
      }
    ],
    "specialization": "Avocado Farming Expert",
    "experience": "5 years",
    "certification": "Agricultural Extension Certificate - Level 3",
    "statistics": {
      "farmersAssisted": 50,
      "totalTransactions": 120,
      "performance": "75%",
      "activeFarmers": 45,
      "territoryUtilization": "65%"
    }
  }
}
```

**Success Response (201 Created):**
```json
{
  "success": true,
  "message": "Profile created successfully",
  "data": {
    "user_info": { /* target user info */ },
    "agent_profile": {
      "agentId": "AGT000003",
      "province": "Eastern Province",
      "territory": [ /* as submitted */ ],
      "territoryCoverage": {
        "totalDistricts": 1,
        "totalSectors": 2,
        "districts": ["Gatsibo"]
      },
      "statistics": { /* as submitted */ }
    }
  }
}
```

**Error Responses:**
- `400 Bad Request` - User not found, not an agent, or profile exists
- `401 Unauthorized` - Invalid token
- `403 Forbidden` - User is not admin
- `500 Internal Server Error` - Server error

---

### Admin: Get Agent Profile

Retrieve any agent's profile by user ID (admin only).

**Endpoint:** `GET /api/agent-information/admin/:userId`

**Access:** Private (Admin only)

**Request Headers:**
```http
Authorization: Bearer <admin_jwt_token>
```

**URL Parameters:**
- `userId` (required) - The MongoDB ObjectId of the user

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Profile retrieved successfully",
  "data": {
    "user_info": {
      "id": "68c7f1428b4e787b3dc49467",
      "full_name": "Pacific Ishimwe",
      "email": "pacific1@gmail.com",
      "phone": "0788937972",
      "role": "agent",
      "status": "active",
      "created_at": "2025-09-15T10:58:10.428Z",
      "updated_at": "2025-11-05T14:25:30.152Z"
    },
    "agent_profile": {
      "agentId": "AGT000001",
      "province": "Eastern Province",
      "territory": [ /* full territory array */ ],
      "territoryCoverage": { /* coverage stats */ },
      "statistics": { /* full statistics */ }
    }
  }
}
```

**Error Responses:**
- `400 Bad Request` - User is not an agent
- `403 Forbidden` - User is not admin
- `404 Not Found` - User not found
- `500 Internal Server Error` - Server error

---

## Data Models

### User Info Object
```typescript
{
  id: string;              // MongoDB ObjectId
  full_name: string;       // Agent's full name
  email: string;           // Email address
  phone: string;           // Phone number
  role: "agent";           // User role
  status: string;          // Account status (active/inactive)
  created_at: Date;        // Account creation date
  updated_at: Date;        // Last update timestamp
}
```

### Agent Profile Object
```typescript
{
  agentId: string;                    // Auto-generated (AGT000001, AGT000002...)
  province: string;                   // Province name
  territory: Territory[];             // Array of assigned sectors (1-10)
  territoryCoverage: TerritoryCoverage; // Auto-calculated coverage
  specialization?: string;            // Area of expertise
  experience?: string;                // Years of experience
  certification?: string;             // Professional certification
  statistics: Statistics;             // Performance metrics
  profileImage?: string;              // Profile image URL
}
```

### Territory Object
```typescript
{
  district: string;        // District name
  sector: string;          // Sector name
  isPrimary: boolean;      // Primary sector flag
  assignedDate: Date;      // Assignment date
}
```

### Territory Coverage Object
```typescript
{
  totalDistricts: number;  // Number of unique districts
  totalSectors: number;    // Total number of sectors
  districts: string[];     // Array of district names
}
```

### Statistics Object
```typescript
{
  farmersAssisted: number;        // Total farmers helped
  totalTransactions: number;      // Total transactions completed
  performance: string;            // Performance rating (e.g., "85%")
  activeFarmers: number;          // Currently active farmers
  territoryUtilization: string;   // Territory coverage (e.g., "78%")
}
```

---

## Territory Management

### Territory Rules

1. **Minimum Requirement**: At least 1 sector must be assigned
2. **Maximum Limit**: Maximum of 10 sectors per agent
3. **Primary Sector**: At least one sector must be marked as primary (`isPrimary: true`)
4. **Multiple Districts**: Agents can cover sectors across multiple districts

### Territory Coverage Calculation

Territory coverage is automatically calculated based on the territory array:

```javascript
territoryCoverage = {
  totalDistricts: uniqueDistrictCount,
  totalSectors: territory.length,
  districts: [uniqueDistrictNames]
}
```

### Adding Territory Sectors

To add new sectors to an agent's territory, include all existing sectors plus new ones in the update request:

```json
{
  "agent_profile": {
    "territory": [
      // Existing sectors
      {
        "district": "Gatsibo",
        "sector": "Kiramuruzi",
        "isPrimary": true,
        "assignedDate": "2025-09-15T10:58:10.428Z"
      },
      // New sector
      {
        "district": "Kayonza",
        "sector": "Gahini",
        "isPrimary": false,
        "assignedDate": "2025-11-05T14:25:30.152Z"
      }
    ]
  }
}
```

### Removing Territory Sectors

To remove sectors, send an update with only the sectors you want to keep:

```json
{
  "agent_profile": {
    "territory": [
      {
        "district": "Gatsibo",
        "sector": "Kiramuruzi",
        "isPrimary": true,
        "assignedDate": "2025-09-15T10:58:10.428Z"
      }
    ]
  }
}
```

### Changing Primary Sector

Update the `isPrimary` flag on the desired sector:

```json
{
  "agent_profile": {
    "territory": [
      {
        "district": "Gatsibo",
        "sector": "Kiramuruzi",
        "isPrimary": false,  // Changed from true
        "assignedDate": "2025-09-15T10:58:10.428Z"
      },
      {
        "district": "Kayonza",
        "sector": "Gahini",
        "isPrimary": true,   // New primary sector
        "assignedDate": "2025-11-05T14:25:30.152Z"
      }
    ]
  }
}
```

---

## Examples

### Example 1: Agent Creates Profile

**Request:**
```bash
curl -X POST http://localhost:3000/api/agent-information/create \
  -H "Authorization: Bearer <agent_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "province": "Eastern Province",
    "territory": [
      {
        "district": "Gatsibo",
        "sector": "Kiramuruzi",
        "isPrimary": true
      }
    ],
    "specialization": "Avocado Farming",
    "experience": "5 years"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Profile created successfully",
  "data": {
    "agent_profile": {
      "agentId": "AGT000001",
      "province": "Eastern Province",
      "territory": [...],
      "territoryCoverage": {
        "totalDistricts": 1,
        "totalSectors": 1,
        "districts": ["Gatsibo"]
      }
    }
  }
}
```

### Example 2: Agent Updates Territory

**Request:**
```bash
curl -X PUT http://localhost:3000/api/agent-information \
  -H "Authorization: Bearer <agent_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_profile": {
      "territory": [
        {
          "district": "Gatsibo",
          "sector": "Kiramuruzi",
          "isPrimary": true,
          "assignedDate": "2025-09-15T10:58:10.428Z"
        },
        {
          "district": "Gatsibo",
          "sector": "Kabarore",
          "isPrimary": false,
          "assignedDate": "2025-11-05T14:25:30.152Z"
        }
      ]
    }
  }'
```

### Example 3: Admin Creates Agent Profile

**Request:**
```bash
curl -X POST http://localhost:3000/api/agent-information/admin/create \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "68c7f1428b4e787b3dc49467",
    "agent_profile": {
      "province": "Eastern Province",
      "territory": [
        {
          "district": "Gatsibo",
          "sector": "Kiramuruzi",
          "isPrimary": true
        }
      ],
      "statistics": {
        "farmersAssisted": 100,
        "totalTransactions": 250,
        "performance": "80%",
        "activeFarmers": 85,
        "territoryUtilization": "70%"
      }
    }
  }'
```

### Example 4: Update Performance Metrics

**Request:**
```bash
curl -X PUT http://localhost:3000/api/agent-information/performance \
  -H "Authorization: Bearer <agent_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "statistics": {
      "farmersAssisted": 200,
      "totalTransactions": 500,
      "performance": "92%",
      "activeFarmers": 180,
      "territoryUtilization": "85%"
    }
  }'
```

---

## Error Handling

### Common Error Responses

#### 400 Bad Request
```json
{
  "success": false,
  "message": "Territory must be a non-empty array",
  "error": "Validation failed"
}
```

#### 401 Unauthorized
```json
{
  "success": false,
  "message": "Invalid or expired token",
  "error": "Authentication failed"
}
```

#### 403 Forbidden
```json
{
  "success": false,
  "message": "Access denied. This endpoint is for agents only",
  "error": "Authorization failed"
}
```

#### 404 Not Found
```json
{
  "success": false,
  "message": "User not found",
  "error": "Resource not found"
}
```

#### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Failed to create agent profile",
  "error": "Internal server error"
}
```

### Validation Errors

**Territory Validation:**
- Empty territory array
- More than 10 sectors
- No primary sector designated
- Missing required fields (district, sector)

**Profile Validation:**
- Profile already exists
- User is not an agent
- Invalid statistics values

---

## Best Practices

### 1. Territory Assignment
- Always designate one primary sector
- Add new sectors incrementally
- Keep territory size manageable (5-7 sectors recommended)

### 2. Performance Tracking
- Update statistics regularly (weekly/monthly)
- Keep metrics realistic and verifiable
- Use percentage format for performance and utilization

### 3. Profile Updates
- Update profile information when circumstances change
- Keep contact information current
- Update certifications when acquired

### 4. Admin Operations
- Use admin endpoints for bulk operations
- Verify user roles before creating profiles
- Monitor territory distribution across agents

---

## Changelog

### Version 1.0.0 (November 5, 2025)
- ✅ Full territory management system
- ✅ Multi-sector support (1-10 sectors)
- ✅ Automatic territory coverage calculation
- ✅ Performance statistics tracking
- ✅ Auto-incrementing agent IDs
- ✅ Admin and agent role separation
- ✅ Complete CRUD operations
- ✅ Comprehensive validation

---

## Support

For issues, questions, or feature requests, please contact the development team or create an issue in the project repository.

**API Version:** 1.0.0  
**Last Updated:** November 5, 2025
