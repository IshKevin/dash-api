# Agent Territory Management API Documentation

## Overview
This document describes the updated agent-information endpoints with territory management capabilities. Agents can now manage multiple sectors across different districts within their assigned province, track performance statistics, and monitor territory coverage.

## Base URL
```
http://localhost:5000/api/agent-information
```

---

## Key Features

### Territory Management
- **Multi-Sector Coverage**: Agents can cover multiple sectors across different districts
- **Primary Sector**: At least one sector must be designated as primary
- **Territory Coverage Tracking**: Automatic calculation of districts and sectors covered
- **Assignment History**: Track when each sector was assigned

### Statistics Tracking
- Farmers assisted (total and active)
- Transaction volume
- Performance percentage
- Territory utilization metrics

---

## Data Structure

### Territory Object
```typescript
{
  district: string;           // District name
  sector: string;             // Sector name
  isPrimary: boolean;         // Is this the primary sector?
  assignedDate: Date;         // When was this sector assigned?
}
```

### Territory Coverage (Auto-calculated)
```typescript
{
  totalDistricts: number;     // Count of unique districts
  totalSectors: number;       // Count of total sectors
  districts: string[];        // Array of district names
}
```

### Statistics Object
```typescript
{
  farmersAssisted: number;        // Total farmers helped
  totalTransactions: number;      // Total transactions completed
  performance: string;            // Performance percentage (e.g., "85%")
  activeFarmers: number;          // Currently active farmers
  territoryUtilization: string;   // Territory utilization (e.g., "78%")
}
```

---

## API Endpoints

### 1. Get Agent Profile with Territory

**Endpoint**: `GET /api/agent-information`

**Authentication**: Required (JWT Token)

**Authorization**: Agent role only

**Headers**:
```json
{
  "Authorization": "Bearer YOUR_JWT_TOKEN"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Profile retrieved successfully",
  "data": {
    "user_info": {
      "id": "68c7f1428b4e787b3dc49467",
      "full_name": "Pacific Agent",
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
        },
        {
          "district": "Kayonza",
          "sector": "Kabare",
          "isPrimary": false,
          "assignedDate": "2025-11-05T14:25:30.152Z"
        }
      ],
      "territoryCoverage": {
        "totalDistricts": 2,
        "totalSectors": 4,
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

**cURL Example**:
```bash
curl -X GET http://localhost:5000/api/agent-information \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### 2. Update Agent Territory

**Endpoint**: `PUT /api/agent-information`

**Authentication**: Required (JWT Token)

**Authorization**: Agent role only

**Headers**:
```json
{
  "Authorization": "Bearer YOUR_JWT_TOKEN",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "full_name": "Pacific Agent",
  "email": "pacific1@gmail.com",
  "phone": "0788937972",
  "agent_profile": {
    "province": "Eastern Province",
    "territory": [
      {
        "district": "Gatsibo",
        "sector": "Kiramuruzi",
        "isPrimary": true
      },
      {
        "district": "Gatsibo",
        "sector": "Kabarore",
        "isPrimary": false
      },
      {
        "district": "Kayonza",
        "sector": "Gahini",
        "isPrimary": false
      },
      {
        "district": "Kayonza",
        "sector": "Kabare",
        "isPrimary": false
      }
    ],
    "specialization": "Avocado Farming Expert",
    "experience": "5 years",
    "certification": "Agricultural Extension Certificate - Level 3",
    "profileImage": "https://example.com/profile.jpg"
  }
}
```

**Alternative Flat Structure** (also supported):
```json
{
  "full_name": "Pacific Agent",
  "email": "pacific1@gmail.com",
  "phone": "0788937972",
  "province": "Eastern Province",
  "territory": [
    {
      "district": "Gatsibo",
      "sector": "Kiramuruzi",
      "isPrimary": true
    },
    {
      "district": "Gatsibo",
      "sector": "Kabarore",
      "isPrimary": false
    }
  ],
  "specialization": "Avocado Farming Expert",
  "experience": "5 years",
  "certification": "Agricultural Extension Certificate - Level 3"
}
```

**Field Descriptions**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| full_name | string | No | Agent's full name (updates User model) |
| email | string | No | Agent's email (updates User model) |
| phone | string | No | Agent's phone number (updates User model) |
| agent_profile.province | string | No | Province where agent operates |
| agent_profile.territory | array | No | Array of territory sectors (see validation rules) |
| agent_profile.specialization | string | No | Area of expertise |
| agent_profile.experience | string | No | Years of experience |
| agent_profile.certification | string | No | Professional certifications |
| agent_profile.profileImage | string | No | Profile image URL |

**Territory Validation Rules**:
1. ✅ Minimum 1 sector, maximum 10 sectors
2. ✅ At least one sector must have `isPrimary: true`
3. ✅ All sectors should be within the same province
4. ✅ Each territory item must have `district` and `sector`
5. ✅ `assignedDate` is auto-generated if not provided

**Success Response** (200 OK):
```json
{
  "success": true,
  "message": "Agent territory updated successfully",
  "data": {
    "user_info": {
      "id": "68c7f1428b4e787b3dc49467",
      "full_name": "Pacific Agent",
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
        },
        {
          "district": "Kayonza",
          "sector": "Kabare",
          "isPrimary": false,
          "assignedDate": "2025-11-05T14:25:30.152Z"
        }
      ],
      "territoryCoverage": {
        "totalDistricts": 2,
        "totalSectors": 4,
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

**Error Responses**:

- **400 Bad Request**: Invalid territory structure
```json
{
  "success": false,
  "message": "Territory must be a non-empty array",
  "meta": {
    "timestamp": "2025-11-05T14:25:30.152Z",
    "version": "1.0.0"
  }
}
```

- **400 Bad Request**: Too many sectors
```json
{
  "success": false,
  "message": "Maximum 10 sectors allowed in territory",
  "meta": {
    "timestamp": "2025-11-05T14:25:30.152Z",
    "version": "1.0.0"
  }
}
```

- **400 Bad Request**: No primary sector
```json
{
  "success": false,
  "message": "At least one sector must be marked as primary (isPrimary: true)",
  "meta": {
    "timestamp": "2025-11-05T14:25:30.152Z",
    "version": "1.0.0"
  }
}
```

**cURL Example**:
```bash
curl -X PUT http://localhost:5000/api/agent-information \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Pacific Agent",
    "email": "pacific1@gmail.com",
    "phone": "0788937972",
    "agent_profile": {
      "province": "Eastern Province",
      "territory": [
        {
          "district": "Gatsibo",
          "sector": "Kiramuruzi",
          "isPrimary": true
        },
        {
          "district": "Gatsibo",
          "sector": "Kabarore",
          "isPrimary": false
        },
        {
          "district": "Kayonza",
          "sector": "Gahini",
          "isPrimary": false
        }
      ],
      "specialization": "Avocado Farming Expert",
      "experience": "5 years",
      "certification": "Agricultural Extension Certificate - Level 3"
    }
  }'
```

---

### 3. Update Performance Statistics

**Endpoint**: `PUT /api/agent-information/performance`

**Authentication**: Required (JWT Token)

**Authorization**: Agent role only

**Headers**:
```json
{
  "Authorization": "Bearer YOUR_JWT_TOKEN",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "farmersAssisted": 180,
  "totalTransactions": 400,
  "performance": "88%",
  "activeFarmers": 165,
  "territoryUtilization": "82%"
}
```

**Field Descriptions**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| farmersAssisted | number | No | Total number of farmers helped |
| totalTransactions | number | No | Total transactions completed |
| performance | string | No | Performance percentage |
| activeFarmers | number | No | Currently active farmers |
| territoryUtilization | string | No | Territory utilization percentage |

**Success Response** (200 OK):
```json
{
  "success": true,
  "message": "Performance metrics updated successfully",
  "data": {
    "user_info": {
      "id": "68c7f1428b4e787b3dc49467",
      "full_name": "Pacific Agent",
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
      "territory": [...],
      "territoryCoverage": {
        "totalDistricts": 2,
        "totalSectors": 4,
        "districts": ["Gatsibo", "Kayonza"]
      },
      "specialization": "Avocado Farming Expert",
      "experience": "5 years",
      "certification": "Agricultural Extension Certificate - Level 3",
      "statistics": {
        "farmersAssisted": 180,
        "totalTransactions": 400,
        "performance": "88%",
        "activeFarmers": 165,
        "territoryUtilization": "82%"
      },
      "profileImage": "https://example.com/profile.jpg"
    }
  },
  "meta": {
    "timestamp": "2025-11-05T15:00:00.152Z",
    "version": "1.0.0"
  }
}
```

**cURL Example**:
```bash
curl -X PUT http://localhost:5000/api/agent-information/performance \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "farmersAssisted": 180,
    "totalTransactions": 400,
    "performance": "88%",
    "activeFarmers": 165,
    "territoryUtilization": "82%"
  }'
```

---

### 4. Create Agent Profile

**Endpoint**: `POST /api/agent-information/create`

**Authentication**: Required (JWT Token)

**Authorization**: Agent role only

**Headers**:
```json
{
  "Authorization": "Bearer YOUR_JWT_TOKEN",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "province": "Eastern Province",
  "territory": [
    {
      "district": "Gatsibo",
      "sector": "Kiramuruzi",
      "isPrimary": true
    }
  ],
  "specialization": "Avocado Farming Expert",
  "experience": "5 years",
  "certification": "Agricultural Extension Certificate - Level 3",
  "profileImage": "https://example.com/profile.jpg"
}
```

**Success Response** (201 Created):
```json
{
  "success": true,
  "message": "Profile created successfully",
  "data": {
    "user_info": {...},
    "agent_profile": {
      "agentId": "AGT000002",
      "province": "Eastern Province",
      "territory": [...],
      "territoryCoverage": {...},
      ...
    }
  },
  "meta": {
    "timestamp": "2025-11-05T14:30:00.152Z",
    "version": "1.0.0"
  }
}
```

---

## Territory Management Best Practices

### 1. Adding a New Sector
When adding a sector to an agent's territory, include all existing sectors plus the new one:

```json
{
  "agent_profile": {
    "territory": [
      {
        "district": "Gatsibo",
        "sector": "Kiramuruzi",
        "isPrimary": true
      },
      {
        "district": "Gatsibo",
        "sector": "Kabarore",
        "isPrimary": false
      },
      {
        "district": "Kayonza",
        "sector": "NewSector",
        "isPrimary": false
      }
    ]
  }
}
```

### 2. Changing Primary Sector
To change which sector is primary, set `isPrimary: true` for the new primary and `false` for others:

```json
{
  "agent_profile": {
    "territory": [
      {
        "district": "Gatsibo",
        "sector": "Kiramuruzi",
        "isPrimary": false
      },
      {
        "district": "Gatsibo",
        "sector": "Kabarore",
        "isPrimary": true
      }
    ]
  }
}
```

### 3. Removing a Sector
Send only the sectors you want to keep (omit the sectors to remove):

```json
{
  "agent_profile": {
    "territory": [
      {
        "district": "Gatsibo",
        "sector": "Kiramuruzi",
        "isPrimary": true
      }
    ]
  }
}
```

---

## Validation Rules Summary

| Rule | Min/Max | Description |
|------|---------|-------------|
| **Sectors per Territory** | 1-10 | Agent can cover 1 to 10 sectors |
| **Primary Sector** | 1+ | At least one sector must be primary |
| **Province Consistency** | Same | All sectors should be in the same province |
| **District & Sector** | Required | Each territory item needs both fields |
| **Geographic Logic** | Recommended | Sectors should be nearby/adjacent |

---

## Complete Workflow Example

### Step 1: Login as Agent
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "pacific1@gmail.com",
    "password": "securepassword"
  }'
```

### Step 2: Get Current Profile
```bash
curl -X GET http://localhost:5000/api/agent-information \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Step 3: Update Territory
```bash
curl -X PUT http://localhost:5000/api/agent-information \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "agent_profile": {
      "province": "Eastern Province",
      "territory": [
        {"district": "Gatsibo", "sector": "Kiramuruzi", "isPrimary": true},
        {"district": "Gatsibo", "sector": "Kabarore", "isPrimary": false},
        {"district": "Kayonza", "sector": "Gahini", "isPrimary": false}
      ]
    }
  }'
```

### Step 4: Update Performance Metrics
```bash
curl -X PUT http://localhost:5000/api/agent-information/performance \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "farmersAssisted": 180,
    "activeFarmers": 165,
    "performance": "88%",
    "territoryUtilization": "82%"
  }'
```

---

## Response Structure

### User Info Object
```typescript
{
  id: string;              // MongoDB ObjectId
  full_name: string;       // Agent's full name
  email: string;           // Agent's email
  phone: string;           // Agent's phone number
  role: string;            // Always "agent"
  status: string;          // Account status
  created_at: Date;        // Account creation date
  updated_at: Date;        // Last update date
}
```

### Agent Profile Object
```typescript
{
  agentId: string;                    // Auto-generated (AGT000001, etc.)
  province?: string;                  // Operational province
  territory?: Territory[];            // Array of assigned sectors
  territoryCoverage?: {              // Auto-calculated coverage
    totalDistricts: number;
    totalSectors: number;
    districts: string[];
  };
  specialization?: string;            // Area of expertise
  experience?: string;                // Years of experience
  certification?: string;             // Professional certifications
  statistics?: {                      // Performance metrics
    farmersAssisted: number;
    totalTransactions: number;
    performance: string;
    activeFarmers: number;
    territoryUtilization: string;
  };
  profileImage?: string;              // Profile image URL
}
```

---

## Backward Compatibility

The API maintains backward compatibility with the old structure:

### Old Structure (Still Supported)
```json
{
  "district": "Gatsibo",
  "sector": "Kiramuruzi",
  "farmersAssisted": 150,
  "totalTransactions": 350,
  "performance": "85%"
}
```

### New Structure (Recommended)
```json
{
  "territory": [
    {"district": "Gatsibo", "sector": "Kiramuruzi", "isPrimary": true}
  ],
  "statistics": {
    "farmersAssisted": 150,
    "totalTransactions": 350,
    "performance": "85%",
    "activeFarmers": 142,
    "territoryUtilization": "78%"
  }
}
```

---

## Common Use Cases

### 1. Agent Covering Single Sector
```json
{
  "agent_profile": {
    "province": "Eastern Province",
    "territory": [
      {
        "district": "Gatsibo",
        "sector": "Kiramuruzi",
        "isPrimary": true
      }
    ]
  }
}
```

### 2. Agent Covering Multiple Sectors in Same District
```json
{
  "agent_profile": {
    "province": "Eastern Province",
    "territory": [
      {"district": "Gatsibo", "sector": "Kiramuruzi", "isPrimary": true},
      {"district": "Gatsibo", "sector": "Kabarore", "isPrimary": false},
      {"district": "Gatsibo", "sector": "Muhura", "isPrimary": false}
    ]
  }
}
```

### 3. Agent Covering Multiple Districts
```json
{
  "agent_profile": {
    "province": "Eastern Province",
    "territory": [
      {"district": "Gatsibo", "sector": "Kiramuruzi", "isPrimary": true},
      {"district": "Gatsibo", "sector": "Kabarore", "isPrimary": false},
      {"district": "Kayonza", "sector": "Gahini", "isPrimary": false},
      {"district": "Kayonza", "sector": "Kabare", "isPrimary": false}
    ]
  }
}
```

---

## Error Handling

| Error Code | Message | Cause | Solution |
|------------|---------|-------|----------|
| 400 | Territory must be a non-empty array | Empty territory array | Provide at least one sector |
| 400 | Maximum 10 sectors allowed in territory | More than 10 sectors | Reduce sectors to 10 or less |
| 400 | At least one sector must be marked as primary | No primary sector | Set isPrimary: true for at least one |
| 400 | No valid performance data provided | Empty performance update | Provide at least one metric |
| 401 | User ID not found in token | Invalid/missing JWT | Login again to get fresh token |
| 403 | Access denied. This endpoint is for agents only | Wrong role | Ensure user has agent role |
| 404 | User not found | User doesn't exist | Check user ID |

---

## Changelog

### Version 2.0.0 (November 5, 2025)
- ✅ **Added territory management** - Agents can now manage multiple sectors
- ✅ **Added territory coverage tracking** - Auto-calculation of districts and sectors
- ✅ **Added statistics object** - Enhanced performance metrics tracking
- ✅ **Added activeFarmers field** - Track currently active farmers
- ✅ **Added territoryUtilization field** - Monitor territory coverage efficiency
- ✅ **Territory validation** - Min 1, max 10 sectors with primary requirement
- ✅ **Backward compatibility** - Old structure still works alongside new structure
- ✅ **Auto-assigned dates** - Territory assignments are timestamped

### Version 1.0.0 (November 5, 2025)
- Initial release with basic agent profile management

---

## Support

- **API Version**: 2.0.0
- **Last Updated**: November 5, 2025
- **Base URL**: http://localhost:5000
- **Environment**: Development

For questions or issues regarding agent territory management, please contact the API development team.
