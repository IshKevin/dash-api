import { Document } from 'mongoose';
import { UserRole as AuthUserRole, UserStatus as AuthUserStatus, UserProfile as AuthUserProfile } from './auth';

// Re-export the types with proper names
export type UserRole = AuthUserRole;
export type UserStatus = AuthUserStatus;
export type UserProfile = AuthUserProfile;

// Base User Interface
export interface IUser extends Document {
  _id: string;
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  profile?: UserProfile;
  created_at: Date;
  updated_at: Date;
  toPublicJSON(): import('./user').UserResponse;
}

// User Create Request
export interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  role?: UserRole;
  profile?: UserProfile;
}

// User Update Request
export interface UpdateUserRequest {
  email?: string;
  full_name?: string;
  phone?: string;
  role?: UserRole;
  status?: UserStatus;
  profile?: Partial<UserProfile>;
}

// User Response (without password)
export interface UserResponse {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  profile?: UserProfile;
  created_at: Date;
  updated_at: Date;
}

// User List Response
export interface UserListResponse {
  users: UserResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// User Filter Options
export interface UserFilterOptions {
  role?: UserRole;
  status?: UserStatus;
  province?: string;
  district?: string;
  search?: string; // Search by name or email
  page?: number;
  limit?: number;
  sortBy?: 'created_at' | 'updated_at' | 'full_name' | 'email';
  sortOrder?: 'asc' | 'desc';
}

// Farmer Specific Types
export interface FarmerProfile extends UserProfile {
  farm_size: number;
  crops: string[];
  farming_experience?: number;
  certification_type?: string;
}

// Agent Specific Types
export interface AgentProfile extends UserProfile {
  specialization?: string[];
  service_areas?: string[];
  experience_years?: number;
}

// Shop Manager Specific Types
export interface ShopManagerProfile extends UserProfile {
  shop_name?: string;
  shop_location?: string;
  business_license?: string;
}