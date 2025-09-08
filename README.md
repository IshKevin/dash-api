# Dashboard Avocado Backend API

A RESTful Node.js/Express.js backend API for agricultural management dashboard supporting farmers, agents, shop managers, and administrators.

## Features

- User authentication with JWT
- Role-based access control (RBAC)
- CRUD operations for users, products, orders, and service requests
- Analytics and reporting endpoints
- MongoDB with Mongoose ODM
- TypeScript for type safety
- Comprehensive validation and error handling

## Technology Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT (JSON Web Tokens)
- **Password Security**: bcryptjs
- **Validation**: express-validator
- **Type Safety**: TypeScript
- **Environment Config**: dotenv

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or cloud instance)
- npm or yarn package manager

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd dashboard-avocado-backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Configure environment variables in `.env`:
   ```
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/dashboard-avocado
   JWT_SECRET=your-super-secret-jwt-key
   JWT_EXPIRES_IN=7d
   ```

## Development

1. Start the development server:
   ```bash
   npm run dev
   ```

2. The API will be available at `http://localhost:3000`

## Production

1. Build the TypeScript code:
   ```bash
   npm run build
   ```

2. Start the production server:
   ```bash
   npm start
   ```

## API Endpoints

### Authentication

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/register` | Register new user | No |
| POST | `/api/auth/login` | User authentication | No |
| POST | `/api/auth/logout` | User logout | Yes |
| GET | `/api/auth/profile` | Get current user profile | Yes |
| PUT | `/api/auth/profile` | Update current user profile | Yes |
| PUT | `/api/auth/password` | Change user password | Yes |

### Users Management

| Method | Endpoint | Description | Auth Required | Roles |
|--------|----------|-------------|---------------|-------|
| GET | `/api/users` | List all users | Yes | Admin |
| GET | `/api/users/:id` | Get user by ID | Yes | Admin, Self |
| PUT | `/api/users/:id` | Update user | Yes | Admin, Self |
| DELETE | `/api/users/:id` | Delete user | Yes | Admin |
| GET | `/api/users/farmers` | List farmers | Yes | Admin, Agent |
| GET | `/api/users/agents` | List agents | Yes | Admin |
| PUT | `/api/users/:id/status` | Update user status | Yes | Admin |
| PUT | `/api/users/:id/role` | Update user role | Yes | Admin |

### Products Management

| Method | Endpoint | Description | Auth Required | Roles |
|--------|----------|-------------|---------------|-------|
| GET | `/api/products` | List all products | Yes | All |
| GET | `/api/products/:id` | Get product details | Yes | All |
| POST | `/api/products` | Create new product | Yes | Admin, Shop Manager |
| PUT | `/api/products/:id` | Update product | Yes | Admin, Shop Manager |
| DELETE | `/api/products/:id` | Delete product | Yes | Admin |
| GET | `/api/products/category/:category` | Filter by category | Yes | All |
| PUT | `/api/products/:id/stock` | Update product stock | Yes | Admin, Shop Manager |

### Orders Management

| Method | Endpoint | Description | Auth Required | Roles |
|--------|----------|-------------|---------------|-------|
| GET | `/api/orders` | List orders | Yes | Admin, Shop Manager |
| GET | `/api/orders/:id` | Get order details | Yes | Admin, Shop Manager, Owner |
| POST | `/api/orders` | Create new order | Yes | All |
| PUT | `/api/orders/:id` | Update order | Yes | Admin, Shop Manager |
| PUT | `/api/orders/:id/status` | Update order status | Yes | Admin, Shop Manager |
| DELETE | `/api/orders/:id` | Delete order | Yes | Admin |
| GET | `/api/orders/user/:userId` | Get user orders | Yes | Admin, Self |

### Service Requests

| Method | Endpoint | Description | Auth Required | Roles |
|--------|----------|-------------|---------------|-------|
| GET | `/api/service-requests` | List service requests | Yes | Admin, Agent, Farmer |
| GET | `/api/service-requests/:id` | Get request details | Yes | Admin, Agent, Owner |
| POST | `/api/service-requests` | Create new request | Yes | Farmer |
| PUT | `/api/service-requests/:id` | Update request | Yes | Admin, Agent, Owner |
| DELETE | `/api/service-requests/:id` | Delete request | Yes | Admin, Owner |
| PUT | `/api/service-requests/:id/assign` | Assign agent | Yes | Admin |
| PUT | `/api/service-requests/:id/status` | Update request status | Yes | Admin, Agent, Owner |
| POST | `/api/service-requests/:id/feedback` | Submit feedback | Yes | Farmer |
| GET | `/api/service-requests/farmer/:farmerId` | Farmer's requests | Yes | Admin, Agent, Self |
| GET | `/api/service-requests/agent/:agentId` | Agent's requests | Yes | Admin, Self |

### Analytics

| Method | Endpoint | Description | Auth Required | Roles |
|--------|----------|-------------|---------------|-------|
| GET | `/api/analytics/dashboard` | Dashboard statistics | Yes | Admin, Shop Manager |
| GET | `/api/analytics/sales` | Sales analytics | Yes | Admin, Shop Manager |
| GET | `/api/analytics/products` | Product analytics | Yes | Admin, Shop Manager |
| GET | `/api/analytics/users` | User statistics | Yes | Admin |
| GET | `/api/analytics/orders/monthly` | Monthly order trends | Yes | Admin, Shop Manager |

## User Roles

| Role | Permissions |
|------|------------|
| **Admin** | Full system access, user management, all analytics |
| **Agent** | Service request management, farmer interaction, limited analytics |
| **Farmer** | Create service requests, view own data, place orders |
| **Shop Manager** | Product management, order management, sales analytics |

## Testing

Run the API test suite:

```bash
node test/api-test.js
```

## Project Structure

```
dashboard-avocado-backend/
├── src/                    # TypeScript source files
│   ├── server.ts          # Main application entry point
│   ├── config/            # Configuration modules
│   ├── models/            # Mongoose schemas & models
│   ├── routes/            # API route definitions
│   ├── middleware/        # Custom middleware functions
│   ├── utils/             # Utility functions
│   └── types/             # TypeScript type definitions
├── dist/                  # Compiled JavaScript output
├── test/                  # Test files
├── .env                   # Environment variables
├── .env.example           # Environment template
├── package.json           # Project dependencies
├── tsconfig.json          # TypeScript configuration
└── README.md              # Project documentation
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| PORT | Server port | Yes |
| MONGODB_URI | MongoDB connection string | Yes |
| JWT_SECRET | Secret key for JWT signing | Yes |
| JWT_EXPIRES_IN | JWT expiration time | Yes |
| NODE_ENV | Environment (development/production) | No |

## Security Features

- Password hashing with bcrypt (10 salt rounds)
- JWT-based authentication with expiration
- Role-based access control
- Input validation and sanitization
- CORS protection
- Rate limiting (to be implemented)
- Helmet.js security headers (to be implemented)

## Error Handling

The API follows standard HTTP status codes:
- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Internal Server Error

All errors return a JSON response with:
```json
{
  "success": false,
  "message": "Error description"
}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a pull request

## License

This project is licensed under the MIT License.