# Agent Service History Endpoint - Implementation Guide

## 🎯 Overview

This document provides the complete specification for implementing the agent-specific harvest requests endpoint.

---

## 📍 Endpoint Specification

### **URL**
```
GET /service-requests/harvest/agent/me
```

### **Purpose**
Fetch all harvest requests created by the currently authenticated agent, automatically filtered by their agent ID from the JWT token.

### **Authentication**
- **Required:** JWT Bearer token in Authorization header
- **Format:** `Authorization: Bearer <jwt_token>`
- **Token Payload Must Contain:**
  ```json
  {
    "id": "agent_id",
    "role": "agent",
    "email": "agent@example.com"
  }
  ```

---

## 🔧 Request Details

### **HTTP Method**
```
GET
```

### **Query Parameters (All Optional)**

| Parameter | Type | Default | Description | Example |
|-----------|------|---------|-------------|---------|
| `page` | integer | 1 | Page number for pagination | `?page=2` |
| `limit` | integer | 100 | Items per page (max: 500) | `?limit=50` |
| `status` | string | all | Filter by status | `?status=pending` |
| `date_from` | ISO date | - | Filter requests from date | `?date_from=2024-11-01` |
| `date_to` | ISO date | - | Filter requests until date | `?date_to=2024-11-30` |

### **Status Values**
- `pending`
- `approved`
- `in_progress`
- `completed`
- `rejected`
- `cancelled`

---

## 📤 Response Format

### **Success Response (200 OK)**

```json
{
  "success": true,
  "data": [
    {
      "id": "67890abc",
      "request_number": "REQ-2024-001",
      "farmer_id": "12345xyz",
      "agent_id": "68c7f1428b4e787b3dc49467",
      "service_type": "harvest",
      "status": "pending",
      "priority": "medium",
      "harvest_details": {
        "workers_needed": 5,
        "trees_to_harvest": 100,
        "harvest_date_from": "2024-12-01",
        "harvest_date_to": "2024-12-05"
      },
      "farmer_info": {
        "name": "Jean Mugabo",
        "phone": "+250788123456",
        "email": "jean@example.com"
      },
      "agent_info": {
        "agentId": "68c7f1428b4e787b3dc49467",
        "name": "Agent Smith",
        "phone": "+250788654321",
        "email": "agent@example.com"
      },
      "location": {
        "province": "Eastern Province",
        "district": "Rwamagana",
        "sector": "Muhazi",
        "cell": "Kagasa",
        "village": "Kajevuba"
      },
      "requested_date": "2024-11-06T10:00:00.000Z",
      "created_at": "2024-11-06T10:00:00.000Z",
      "updated_at": "2024-11-06T10:00:00.000Z"
    }
  ],
  "message": "Harvest requests retrieved successfully",
  "pagination": {
    "page": 1,
    "limit": 100,
    "total": 15,
    "total_pages": 1
  }
}
```

### **Empty Result (200 OK)**

```json
{
  "success": true,
  "data": [],
  "message": "No harvest requests found for this agent",
  "pagination": {
    "page": 1,
    "limit": 100,
    "total": 0,
    "total_pages": 0
  }
}
```

### **Error Responses**

#### **401 Unauthorized**
```json
{
  "success": false,
  "message": "Authentication required. Please provide a valid JWT token.",
  "error": "UNAUTHORIZED"
}
```

#### **403 Forbidden**
```json
{
  "success": false,
  "message": "Access denied. Only agents can access this endpoint.",
  "error": "FORBIDDEN"
}
```

#### **500 Internal Server Error**
```json
{
  "success": false,
  "message": "An error occurred while retrieving harvest requests",
  "error": "DATABASE_ERROR"
}
```

---

## 💾 Database Requirements

### **1. Schema Update**

Ensure the `service_requests` table has the `agent_id` column:

```sql
-- Add agent_id column if it doesn't exist
ALTER TABLE service_requests 
ADD COLUMN IF NOT EXISTS agent_id VARCHAR(255);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_service_requests_agent_id 
ON service_requests(agent_id);

-- Add composite index for common queries
CREATE INDEX IF NOT EXISTS idx_service_requests_agent_status 
ON service_requests(agent_id, status);
```

### **2. Sample Query Logic**

```sql
SELECT 
  sr.id,
  sr.request_number,
  sr.farmer_id,
  sr.agent_id,
  sr.service_type,
  sr.status,
  sr.priority,
  sr.harvest_details,
  sr.location,
  sr.requested_date,
  sr.created_at,
  sr.updated_at,
  -- Farmer info from join
  f.name as farmer_name,
  f.phone as farmer_phone,
  f.email as farmer_email,
  -- Agent info from join
  a.name as agent_name,
  a.phone as agent_phone,
  a.email as agent_email
FROM service_requests sr
LEFT JOIN farmers f ON sr.farmer_id = f.id
LEFT JOIN agents a ON sr.agent_id = a.id
WHERE 
  sr.agent_id = $1  -- From JWT token
  AND sr.service_type = 'harvest'
  AND ($2::varchar IS NULL OR sr.status = $2)  -- Optional status filter
  AND ($3::timestamp IS NULL OR sr.created_at >= $3)  -- Optional date_from
  AND ($4::timestamp IS NULL OR sr.created_at <= $4)  -- Optional date_to
ORDER BY sr.created_at DESC
LIMIT $5 OFFSET $6;  -- Pagination
```

---

## 🛠️ Implementation Examples

### **Node.js/Express Example**

#### **Route Definition** (`routes/serviceRequests.js`)
```javascript
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getAgentHarvestRequests } = require('../controllers/serviceRequestsController');

// Agent-specific harvest requests endpoint
router.get('/harvest/agent/me', authenticateToken, getAgentHarvestRequests);

module.exports = router;
```

#### **Controller** (`controllers/serviceRequestsController.js`)
```javascript
const db = require('../config/database');

exports.getAgentHarvestRequests = async (req, res) => {
  try {
    // Extract agent ID from JWT token (set by authenticateToken middleware)
    const agentId = req.user.id;
    
    // Parse query parameters
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = (page - 1) * limit;
    const status = req.query.status || null;
    const dateFrom = req.query.date_from || null;
    const dateTo = req.query.date_to || null;
    
    // Build WHERE clause dynamically
    let whereConditions = ['sr.agent_id = $1', "sr.service_type = 'harvest'"];
    let params = [agentId];
    let paramCount = 1;
    
    if (status) {
      paramCount++;
      whereConditions.push(`sr.status = $${paramCount}`);
      params.push(status);
    }
    
    if (dateFrom) {
      paramCount++;
      whereConditions.push(`sr.created_at >= $${paramCount}`);
      params.push(dateFrom);
    }
    
    if (dateTo) {
      paramCount++;
      whereConditions.push(`sr.created_at <= $${paramCount}`);
      params.push(dateTo);
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM service_requests sr
      WHERE ${whereClause}
    `;
    
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);
    
    // Get paginated data
    const dataQuery = `
      SELECT 
        sr.*,
        json_build_object(
          'name', f.name,
          'phone', f.phone,
          'email', f.email
        ) as farmer_info,
        json_build_object(
          'agentId', a.id,
          'name', a.name,
          'phone', a.phone,
          'email', a.email
        ) as agent_info
      FROM service_requests sr
      LEFT JOIN farmers f ON sr.farmer_id = f.id
      LEFT JOIN agents a ON sr.agent_id = a.id
      WHERE ${whereClause}
      ORDER BY sr.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    
    params.push(limit, offset);
    
    const dataResult = await db.query(dataQuery, params);
    
    res.json({
      success: true,
      data: dataResult.rows,
      message: 'Harvest requests retrieved successfully',
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Error fetching agent harvest requests:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving harvest requests',
      error: process.env.NODE_ENV === 'development' ? error.message : 'DATABASE_ERROR'
    });
  }
};
```

#### **Middleware** (`middleware/auth.js`)
```javascript
const jwt = require('jsonwebtoken');

exports.authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please provide a valid JWT token.',
      error: 'UNAUTHORIZED'
    });
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Invalid or expired token',
        error: 'FORBIDDEN'
      });
    }
    
    // Check if user is an agent
    if (user.role !== 'agent') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only agents can access this endpoint.',
        error: 'FORBIDDEN'
      });
    }
    
    req.user = user; // Attach user info to request
    next();
  });
};
```

---

## 🧪 Testing

### **cURL Examples**

#### **1. Get all agent's harvest requests**
```bash
curl -X GET "http://localhost:5000/api/service-requests/harvest/agent/me" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

#### **2. Get pending requests only**
```bash
curl -X GET "http://localhost:5000/api/service-requests/harvest/agent/me?status=pending" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

#### **3. Get requests with pagination**
```bash
curl -X GET "http://localhost:5000/api/service-requests/harvest/agent/me?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

#### **4. Get requests in date range**
```bash
curl -X GET "http://localhost:5000/api/service-requests/harvest/agent/me?date_from=2024-11-01&date_to=2024-11-30" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

### **Postman Collection**

Import this JSON into Postman:

```json
{
  "info": {
    "name": "Agent Harvest Requests",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Get My Harvest Requests",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{agent_token}}",
            "type": "text"
          }
        ],
        "url": {
          "raw": "{{base_url}}/service-requests/harvest/agent/me?page=1&limit=10",
          "host": ["{{base_url}}"],
          "path": ["service-requests", "harvest", "agent", "me"],
          "query": [
            {
              "key": "page",
              "value": "1"
            },
            {
              "key": "limit",
              "value": "10"
            }
          ]
        }
      }
    }
  ]
}
```

---

## ✅ Checklist for Backend Team

- [ ] Create database migration to add `agent_id` column
- [ ] Add index on `agent_id` column
- [ ] Update `POST /service-requests/harvest` to save `agent_id`
- [ ] Create route for `GET /service-requests/harvest/agent/me`
- [ ] Implement controller function
- [ ] Add JWT authentication middleware
- [ ] Test with valid JWT token
- [ ] Test pagination
- [ ] Test status filtering
- [ ] Test date range filtering
- [ ] Verify only agent's requests are returned
- [ ] Test error cases (missing token, invalid token, etc.)
- [ ] Deploy to staging environment
- [ ] Update API documentation

---

## 🔗 Related Endpoints

### **Also Update: POST /service-requests/harvest**

When creating harvest requests, ensure `agent_id` is saved:

```javascript
exports.createHarvestRequest = async (req, res) => {
  try {
    const agentId = req.user.id; // From JWT token
    const { farmer_id, workersNeeded, treesToHarvest, ... } = req.body;
    
    const result = await db.query(`
      INSERT INTO service_requests (
        farmer_id, 
        agent_id,  -- NEW: Save agent ID
        service_type,
        harvest_details,
        location,
        status,
        created_at
      ) VALUES ($1, $2, 'harvest', $3, $4, 'pending', NOW())
      RETURNING *
    `, [farmer_id, agentId, harvestDetails, location]);
    
    res.json({
      success: true,
      data: result.rows[0],
      message: 'Harvest request created successfully'
    });
  } catch (error) {
    // Error handling...
  }
};
```

---

## 📞 Support

If you have questions about this implementation, contact:
- Frontend Team: [Your contact]
- Backend Team: [Backend contact]

---

**Document Version:** 1.0  
**Last Updated:** November 6, 2025  
**Status:** Ready for Implementation
