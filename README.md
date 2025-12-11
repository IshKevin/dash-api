# Dashboard Avocado Backend API

A comprehensive, production-ready backend API for agricultural management system with QR code profile access, bulk user import, and advanced monitoring capabilities.

## 🚀 Features

### Core Features
- **User Authentication & Authorization** - JWT-based with role-based access control
- **QR Code Profile Access System** - Generate access keys for profile editing via QR codes
- **Bulk User Import** - Import users from Excel/JSON with automatic access key generation
- **Comprehensive Profile Management** - Farmer, agent, and admin profiles with detailed information
- **Product Inventory Management** - Full CRUD operations with stock tracking
- **Order Processing System** - Complete order lifecycle management
- **Real-time Analytics** - Dashboard statistics and reporting
- **File Upload & Storage** - Cloudinary integration for images and documents
- **Advanced Monitoring** - Health checks, metrics, and system monitoring
- **Notification System** - Real-time notifications for users
- **Comprehensive Logging** - Winston-based logging with different levels

### Production Features
- **Rate Limiting** - Configurable request throttling
- **Security Headers** - Helmet.js for security best practices
- **Input Validation** - Comprehensive request validation
- **Error Handling** - Centralized error handling with proper HTTP status codes
- **Database Optimization** - Indexed queries and connection pooling
- **Graceful Shutdown** - Proper cleanup on server termination
- **Health Monitoring** - Detailed health checks and system metrics
- **Automated Cleanup** - Scripts for removing expired data

## 🛠 Tech Stack

- **Runtime**: Node.js 18+ with TypeScript
- **Framework**: Express.js with comprehensive middleware
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT with bcrypt password hashing
- **File Storage**: Cloudinary for images and documents
- **Logging**: Winston with multiple transports
- **Testing**: Mocha & Chai
- **Security**: Helmet, CORS, Rate Limiting, Input Validation, MongoDB Sanitization
- **Monitoring**: Custom health checks and metrics collection

## 📋 Prerequisites

- Node.js (v18 or higher)
- MongoDB (v5 or higher)
- npm or yarn
- Cloudinary account (for file uploads)

## 🚀 Quick Start

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/IshKevin/dash-api.git
cd dash-api

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env
```

### 2. Environment Configuration

Edit `.env` file with your configuration:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/dashboard-avocado

# JWT Configuration (CHANGE IN PRODUCTION!)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d

# CORS Configuration
CORS_ORIGIN=http://localhost:3000
CORS_PUBLIC=false

# Application Configuration
APP_NAME=Dashboard Avocado Backend
APP_VERSION=1.0.0

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret

# Optional: Email Configuration
RESEND_API_KEY=your-resend-api-key
FROM_EMAIL=noreply@yourdomain.com

# Security Configuration
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
BCRYPT_ROUNDS=12

# Access Key Configuration
ACCESS_KEY_EXPIRY_DAYS=30
QR_CODE_EXPIRY_DAYS=7
```

### 3. Database Setup

```bash
# Seed initial data (admin user, sample products)
npm run seed
```

### 4. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:5000`

## 📚 API Documentation

### Welcome & Documentation
- `GET /` - Welcome message with system overview
- `GET /api/welcome` - Detailed welcome with statistics
- `GET /api-docs` - Complete API documentation
- `GET /health` - Health check endpoint

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh JWT token
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token

### QR Code Profile Access System
- `POST /api/profile-access/bulk-import` - Import users from Excel/JSON with access keys
- `POST /api/profile-access/verify-access-key` - Verify access key for profile editing
- `PUT /api/profile-access/update-profile` - Update profile using access key
- `GET /api/profile-access/generate-qr/:userId` - Generate QR code with access key

### User Management
- `GET /api/users` - Get all users (Admin only)
- `GET /api/users/profile` - Get current user profile
- `PUT /api/users/profile` - Update current user profile
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user by ID (Admin only)
- `DELETE /api/users/:id` - Delete user by ID (Admin only)

### Product Management
- `GET /api/products` - Get all products
- `POST /api/products` - Create new product
- `GET /api/products/:id` - Get product by ID
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product

### Order Management
- `GET /api/orders` - Get all orders
- `POST /api/orders` - Create new order
- `GET /api/orders/:id` - Get order by ID
- `PUT /api/orders/:id` - Update order
- `DELETE /api/orders/:id` - Delete order

### Analytics & Monitoring
- `GET /api/analytics/dashboard` - Dashboard analytics
- `GET /api/monitoring/health` - Comprehensive health check
- `GET /api/monitoring/metrics` - System metrics (Admin only)
- `POST /api/monitoring/cleanup` - Clean expired data (Admin only)

## 🔧 QR Code Access System

### How It Works

1. **Bulk Import Users**: Import users from Excel/JSON files
2. **Generate Access Keys**: Each user gets a unique access key (format: XXXX-XXXX-XXXX)
3. **Create QR Codes**: Generate QR codes containing access keys
4. **User Scans QR**: User scans QR code to get access key
5. **Profile Access**: User enters access key on web page to edit their profile
6. **One-Time Use**: Access keys are marked as used after profile update

### Example Usage

```bash
# Import users from Excel file
curl -X POST http://localhost:5000/api/profile-access/bulk-import \
  -H "Authorization: Bearer <admin-token>" \
  -F "file=@users.xlsx"

# Generate QR code for a user
curl -X GET http://localhost:5000/api/profile-access/generate-qr/USER_ID \
  -H "Authorization: Bearer <agent-token>"

# Verify access key (public endpoint)
curl -X POST http://localhost:5000/api/profile-access/verify-access-key \
  -H "Content-Type: application/json" \
  -d '{"access_key": "ABCD-1234-EFGH"}'

# Update profile with access key
curl -X PUT http://localhost:5000/api/profile-access/update-profile \
  -H "Content-Type: application/json" \
  -d '{
    "access_key": "ABCD-1234-EFGH",
    "profile_data": {
      "full_name": "Updated Name",
      "phone": "+250788123456",
      "profile": {
        "age": 35,
        "gender": "Male"
      }
    }
  }'
```

## 📁 Project Structure

```
src/
├── config/              # Configuration files
│   ├── database.ts      # MongoDB connection
│   ├── environment.ts   # Environment variables
│   ├── logger.ts        # Winston logging setup
│   └── cloudinary.ts    # Cloudinary configuration
├── middleware/          # Express middleware
│   ├── auth.ts          # Authentication middleware
│   ├── errorHandler.ts  # Error handling
│   ├── validation.ts    # Input validation
│   └── upload.ts        # File upload handling
├── models/              # Database models
│   ├── User.ts          # User model with profiles
│   ├── AccessKey.ts     # Access key model
│   ├── Product.ts       # Product model
│   ├── Order.ts         # Order model
│   └── ...              # Other models
├── routes/              # API routes
│   ├── auth.ts          # Authentication routes
│   ├── profile-access.ts # QR code access system
│   ├── welcome.ts       # Welcome endpoints
│   ├── api-docs.ts      # API documentation
│   ├── monitoring.ts    # Health & monitoring
│   └── ...              # Other route files
├── scripts/             # Utility scripts
│   ├── seed.ts          # Database seeding
│   └── cleanup.ts       # Data cleanup
├── types/               # TypeScript definitions
├── utils/               # Utility functions
│   ├── accessKey.ts     # Access key utilities
│   ├── responses.ts     # Response helpers
│   └── ...              # Other utilities
└── server.ts            # Main server file
```

## 🚀 Production Deployment

### 1. Build for Production

```bash
# Clean build
npm run build:clean

# Or just build
npm run build
```

### 2. Environment Setup

```bash
# Set production environment
export NODE_ENV=production

# Set secure JWT secret
export JWT_SECRET="your-very-secure-production-jwt-secret"

# Configure database
export MONGODB_URI="mongodb://your-production-db-url"
```

### 3. Start Production Server

```bash
npm run start:prod
```

### 4. Health Monitoring

```bash
# Check health
curl http://localhost:5000/health

# Get detailed metrics (requires admin token)
curl -H "Authorization: Bearer <admin-token>" \
     http://localhost:5000/api/monitoring/metrics
```

### 5. Maintenance Scripts

```bash
# Clean expired data
npm run cleanup

# Health check for monitoring systems
npm run health-check
```

## 🔒 Security Features

- **JWT Authentication** with configurable expiration
- **Password Hashing** with bcrypt (configurable rounds)
- **Rate Limiting** with configurable windows and limits
- **Input Validation** with express-validator
- **SQL Injection Protection** with express-mongo-sanitize
- **XSS Protection** with Helmet.js security headers
- **CORS Configuration** with whitelist support
- **Request Logging** for audit trails
- **Error Handling** without information leakage

## 📊 Monitoring & Analytics

### Health Checks
- Database connectivity
- Memory usage monitoring
- Disk space monitoring
- Service availability checks

### Metrics Collection
- Request volume and patterns
- User activity tracking
- System resource usage
- Error rate monitoring

### Automated Cleanup
- Expired access keys removal
- Old log cleanup
- Used access key cleanup

## 🧪 Testing

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run e2e tests only
npm run test:e2e

# Watch mode for development
npm run test:watch
```

## 📝 Scripts Reference

```bash
npm start          # Start production server
npm run dev        # Development server with hot reload
npm run build      # Build TypeScript
npm run build:prod # Production build
npm run start:prod # Start production server
npm test           # Run all tests
npm run seed       # Seed initial data
npm run cleanup    # Clean expired data
npm run health-check # Health check for monitoring
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License.

## 🆘 Support

For support and questions:
- Create an issue in the GitHub repository
- Check the API documentation at `/api-docs`
- Review the health status at `/health`