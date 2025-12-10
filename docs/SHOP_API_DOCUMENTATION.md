# Shop Management API Documentation

## Overview
The Shop Management API provides endpoints for managing shops with role-based access control. Only **Admins** can create shops, while both **Admins** and **Shop Managers** can perform other CRUD operations.

## Base URL
```
/api/addshops
```

## Authentication
All endpoints require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### 1. Create Shop (Admin Only)
**POST** `/api/addshops/addshop`

**Access**: Admin only

**Request Body**:
```json
{
  "shopName": "string",
  "description": "string",
  "province": "string",
  "district": "string",
  "ownerName": "string",
  "ownerEmail": "string",
  "ownerPhone": "string"
}
```

**Example Request**:
```json
{
  "shopName": "Green Valley Avocado Shop",
  "description": "Premium avocado sales and distribution center",
  "province": "Eastern Province",
  "district": "Rwamagana",
  "ownerName": "John Doe",
  "ownerEmail": "john.doe@example.com",
  "ownerPhone": "+250788123456"
}
```

**Success Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "shopName": "Green Valley Avocado Shop",
    "description": "Premium avocado sales and distribution center",
    "province": "Eastern Province",
    "district": "Rwamagana",
    "ownerName": "John Doe",
    "ownerEmail": "john.doe@example.com",
    "ownerPhone": "+250788123456",
    "createdBy": "admin_user_id",
    "createdAt": "2025-10-27T10:30:00.000Z",
    "updatedAt": "2025-10-27T10:30:00.000Z"
  },
  "message": "Shop created successfully",
  "meta": {
    "timestamp": "2025-10-27T10:30:00.000Z",
    "version": "1.0.0"
  }
}
```

---

### 2. Get All Shops
**GET** `/api/addshops`

**Access**: Admin, Shop Manager

**Query Parameters**: None

**Success Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "shopName": "Green Valley Avocado Shop",
      "description": "Premium avocado sales and distribution center",
      "province": "Eastern Province",
      "district": "Rwamagana",
      "ownerName": "John Doe",
      "ownerEmail": "john.doe@example.com",
      "ownerPhone": "+250788123456",
      "createdBy": "admin_user_id",
      "createdAt": "2025-10-27T10:30:00.000Z",
      "updatedAt": "2025-10-27T10:30:00.000Z"
    },
    {
      "id": 2,
      "shopName": "Mountain View Shop",
      "description": "Another shop",
      "province": "Northern Province",
      "district": "Musanze",
      "ownerName": "Jane Smith",
      "ownerEmail": "jane@example.com",
      "ownerPhone": "+250788654321",
      "createdBy": "admin_user_id",
      "createdAt": "2025-10-27T11:00:00.000Z",
      "updatedAt": "2025-10-27T11:00:00.000Z"
    }
  ],
  "message": "Shops retrieved successfully",
  "meta": {
    "timestamp": "2025-10-27T10:30:00.000Z",
    "version": "1.0.0"
  }
}
```

---

### 3. Get Single Shop
**GET** `/api/addshops/:id`

**Access**: Admin, Shop Manager

**URL Parameters**:
- `id` (required): Shop ID (integer)

**Example**: `GET /api/addshops/1`

**Success Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "shopName": "Green Valley Avocado Shop",
    "description": "Premium avocado sales and distribution center",
    "province": "Eastern Province",
    "district": "Rwamagana",
    "ownerName": "John Doe",
    "ownerEmail": "john.doe@example.com",
    "ownerPhone": "+250788123456",
    "createdBy": "admin_user_id",
    "createdAt": "2025-10-27T10:30:00.000Z",
    "updatedAt": "2025-10-27T10:30:00.000Z"
  },
  "message": "Shop retrieved successfully",
  "meta": {
    "timestamp": "2025-10-27T10:30:00.000Z",
    "version": "1.0.0"
  }
}
```

---

### 4. Update Shop
**PUT** `/api/addshops/:id`

**Access**: Admin, Shop Manager

**URL Parameters**:
- `id` (required): Shop ID (integer)

**Request Body** (all fields optional):
```json
{
  "shopName": "string",
  "description": "string",
  "province": "string",
  "district": "string",
  "ownerName": "string",
  "ownerEmail": "string",
  "ownerPhone": "string"
}
```

**Example Request**:
```json
{
  "description": "Updated description for the shop",
  "ownerPhone": "+250788654321"
}
```

**Success Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "shopName": "Green Valley Avocado Shop",
    "description": "Updated description for the shop",
    "province": "Eastern Province",
    "district": "Rwamagana",
    "ownerName": "John Doe",
    "ownerEmail": "john.doe@example.com",
    "ownerPhone": "+250788654321",
    "createdBy": "admin_user_id",
    "createdAt": "2025-10-27T10:30:00.000Z",
    "updatedAt": "2025-10-27T11:15:00.000Z"
  },
  "message": "Shop updated successfully",
  "meta": {
    "timestamp": "2025-10-27T11:15:00.000Z",
    "version": "1.0.0"
  }
}
```

---

### 5. Delete Shop
**DELETE** `/api/addshops/:id`

**Access**: Admin, Shop Manager

**URL Parameters**:
- `id` (required): Shop ID (integer)

**Example**: `DELETE /api/addshops/1`

**Success Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "shopName": "Green Valley Avocado Shop",
    "description": "Premium avocado sales and distribution center",
    "province": "Eastern Province",
    "district": "Rwamagana",
    "ownerName": "John Doe",
    "ownerEmail": "john.doe@example.com",
    "ownerPhone": "+250788123456",
    "createdBy": "admin_user_id",
    "createdAt": "2025-10-27T10:30:00.000Z",
    "updatedAt": "2025-10-27T10:30:00.000Z"
  },
  "message": "Shop deleted successfully",
  "meta": {
    "timestamp": "2025-10-27T11:20:00.000Z",
    "version": "1.0.0"
  }
}
```

---

## Error Responses

### 400 Bad Request - Validation Error
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "type": "field",
      "value": "",
      "msg": "Shop name is required",
      "path": "shopName",
      "location": "body"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Access token is required",
  "meta": {
    "timestamp": "2025-10-27T10:30:00.000Z",
    "version": "1.0.0"
  }
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "Access denied. Admins only",
  "meta": {
    "timestamp": "2025-10-27T10:30:00.000Z",
    "version": "1.0.0"
  }
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Shop not found",
  "meta": {
    "timestamp": "2025-10-27T10:30:00.000Z",
    "version": "1.0.0"
  }
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Failed to create shop",
  "meta": {
    "timestamp": "2025-10-27T10:30:00.000Z",
    "version": "1.0.0"
  }
}
```

---

## Role-Based Access Control

| Endpoint | Admin | Shop Manager | Farmer | Agent |
|----------|-------|--------------|--------|-------|
| POST /addshop | ✅ | ❌ | ❌ | ❌ |
| GET / | ✅ | ✅ | ❌ | ❌ |
| GET /:id | ✅ | ✅ | ❌ | ❌ |
| PUT /:id | ✅ | ✅ | ❌ | ❌ |
| DELETE /:id | ✅ | ✅ | ❌ | ❌ |

---

## Validation Rules

### Shop Creation (POST /addshop)
- **shopName**: Required, 2-200 characters
- **description**: Required, max 1000 characters
- **province**: Required
- **district**: Required
- **ownerName**: Required, min 2 characters
- **ownerEmail**: Required, valid email format
- **ownerPhone**: Required, valid phone format (10-15 digits)

### Shop Update (PUT /:id)
- All fields are optional
- Same validation rules apply when field is provided

---

## Testing with cURL

### Create a shop (as Admin):
```bash
curl -X POST http://localhost:5000/api/addshops/addshop \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "shopName": "Green Valley Avocado Shop",
    "description": "Premium avocado sales and distribution center",
    "province": "Eastern Province",
    "district": "Rwamagana",
    "ownerName": "John Doe",
    "ownerEmail": "john.doe@example.com",
    "ownerPhone": "+250788123456"
  }'
```

### Get all shops:
```bash
curl -X GET http://localhost:5000/api/addshops \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Update a shop:
```bash
curl -X PUT http://localhost:5000/api/addshops/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "description": "Updated shop description"
  }'
```

### Delete a shop:
```bash
curl -X DELETE http://localhost:5000/api/addshops/1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Notes

1. **In-Memory Storage**: Currently using in-memory storage for demonstration. Replace with a proper database model (MongoDB) in production.

2. **Shop Manager Access**: Shop managers can see all shops created by admins and perform all CRUD operations except creation.

3. **Authentication**: All endpoints require a valid JWT token with appropriate role permissions.

4. **ID Generation**: Shop IDs are automatically generated as auto-incrementing integers (1, 2, 3, ...) in ascending order.

5. **Timestamps**: All shops have `createdAt` and `updatedAt` timestamps that are automatically managed.
