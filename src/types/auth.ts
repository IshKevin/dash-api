import { Request } from 'express';

// JWT Payload Interface
export interface JWTPayload {
  id: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

// User Role Enum
export type UserRole = 'admin' | 'agent' | 'farmer' | 'shop_manager';

// User Status Enum
export type UserStatus = 'active' | 'inactive';

// Authentication Request Interface (extends Express Request)
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
    status: UserStatus;
  };
}

// Login Request Body
export interface LoginRequest {
  email: string;
  password: string;
}

// Register Request Body
export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  role?: UserRole;
  profile?: UserProfile;
}

// User Profile Interface
export interface UserProfile {
  age?: number;
  gender?: string;
  province?: string;
  district?: string;
  farm_size?: number;
  crops?: string[];
}

// Authentication Response
export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    full_name: string;
    role: UserRole;
    status: UserStatus;
  };
}

// JWT Token Options
export interface JWTOptions {
  expiresIn: string;
}

// Password Reset Request
export interface PasswordResetRequest {
  email: string;
}

// Password Change Request
export interface PasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
}