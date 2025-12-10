Implementation Plan - Backend Enhancements
This plan outlines the steps to implement system logging, enhance farmer management for agents, add QR code capabilities, and support Excel data import.

User Review Required
IMPORTANT

Dependencies: The xlsx, qrcode and multer (if not present) packages need to be installed. Roles: No new roles. 
Agent
 and Admin will manage farmers. QR Code: Users will be assigned a unique qr_code_token for scanning purposes. Bulk Import: Endpoint designed to handle ~1500 users efficiently.

Proposed Changes
Database & Models
[MODIFY] 
User.ts
Add qr_code_token field (string, unique, sparse) to store the token used for QR code generation/scanning.
[NEW] 
Log.ts
Create a Mongoose model to store system logs (level, message, meta, timestamp).
Logging System
[MODIFY] 
logger.ts
Implement a custom transport or hook to save logs to the MongoDB Log collection.
[NEW] 
logs.ts
Create GET /api/logs endpoint to retrieve logs (filterable by level, date).
Farmer Management
[MODIFY] 
farmer-information.ts
Update middleware and permission checks to allow agent and admin roles to access and modify farmer data.
QR Code & Excel Import
[NEW] 
profile-access.ts
GET /qr/:userId: Generate and return a QR code (image/data URL) for a user.
GET /scan/:token: Retrieve user info via QR token.
PUT /scan/:token: Update user info via QR token authentication.
POST /import: Accept an Excel file, parse ~1500 users, create accounts, and generate QR tokens.
Server Configuration
[MODIFY] 
server.ts
Register new routes: /api/logs and /api/profile-access.
Verification Plan
Automated Tests
Run npm run test to check for regressions.
Manual Verification
Logging: Verify logs are stored in DB.
Farmer Management: Verify Agents can manage Farmers.
QR Code: Verify generation and scanning.
Excel Import: Test with a large sample file (simulating part of the 1500 users) to ensure performance.