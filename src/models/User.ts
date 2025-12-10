import mongoose, { Schema, Model, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserRole, UserStatus, UserResponse } from '../types/user';

export interface IFarmLocation {
  province?: string;
  district?: string;
  sector?: string;
  cell?: string;
  village?: string;
}

export interface IFarmDetails {
  farm_location?: IFarmLocation;
  farm_age?: number;
  planted?: string;
  avocado_type?: string;
  mixed_percentage?: number;
  farm_size?: number;
  tree_count?: number;
  upi_number?: string;
  assistance?: string;
}

export interface IUserProfile {
  age?: number;
  gender?: 'Male' | 'Female' | 'Other';
  marital_status?: 'Single' | 'Married' | 'Divorced' | 'Widowed';
  education_level?: 'Primary' | 'Secondary' | 'University' | 'None';
  province?: string;
  district?: string;
  sector?: string;
  cell?: string;
  village?: string;
  service_areas?: string[];
  farm_details?: IFarmDetails;
}

export interface IUser extends Document {
  _id: string;
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  profile?: IUserProfile;
  qr_code_token?: string;
  created_at: Date;
  updated_at: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  toPublicJSON(): UserResponse;
}

const FarmLocationSchema = new Schema({
  province: { type: String, trim: true },
  district: { type: String, trim: true },
  sector: { type: String, trim: true },
  cell: { type: String, trim: true },
  village: { type: String, trim: true }
}, { _id: false });

const FarmDetailsSchema = new Schema({
  farm_location: FarmLocationSchema,
  farm_age: { type: Number, min: 0 },
  planted: { type: String, trim: true },
  avocado_type: { type: String, trim: true },
  mixed_percentage: { type: Number, min: 0, max: 100 },
  farm_size: { type: Number, min: 0 },
  tree_count: { type: Number, min: 0 },
  upi_number: { type: String, trim: true },
  assistance: { type: String, trim: true }
}, { _id: false });

const UserProfileSchema = new Schema({
  age: { type: Number, min: 0, max: 150 },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    trim: true
  },
  marital_status: {
    type: String,
    enum: ['Single', 'Married', 'Divorced', 'Widowed'],
    trim: true
  },
  education_level: {
    type: String,
    enum: ['Primary', 'Secondary', 'University', 'None'],
    trim: true
  },
  province: { type: String, trim: true },
  district: { type: String, trim: true },
  sector: { type: String, trim: true },
  cell: { type: String, trim: true },
  village: { type: String, trim: true },
  service_areas: [{ type: String, trim: true }],
  farm_details: FarmDetailsSchema
}, { _id: false });

const userSchema = new Schema<IUser>({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Please provide a valid email address']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters long'],
    select: false
  },
  full_name: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    minlength: [2, 'Full name must be at least 2 characters long'],
    maxlength: [100, 'Full name cannot exceed 100 characters']
  },
  phone: {
    type: String,
    trim: true,
    match: [/^[+]?[\d\s\-\(\)]{10,15}$/, 'Please provide a valid phone number']
  },
  role: {
    type: String,
    enum: {
      values: ['admin', 'agent', 'farmer', 'shop_manager'] as UserRole[],
      message: 'Role must be one of: admin, agent, farmer, shop_manager'
    },
    required: [true, 'Role is required'],
    default: 'farmer' as UserRole
  },
  status: {
    type: String,
    enum: {
      values: ['active', 'inactive'] as UserStatus[],
      message: 'Status must be either active or inactive'
    },
    default: 'active' as UserStatus
  },
  profile: {
    type: UserProfileSchema,
    default: {}
  },
  qr_code_token: {
    type: String,
    unique: true,
    sparse: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: false
});

// Indexes for better query performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ 'profile.province': 1, 'profile.district': 1 });
userSchema.index({ created_at: -1 });

// Pre-save middleware to hash password
userSchema.pre('save', async function (this: IUser, next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Instance method to compare password
userSchema.methods.comparePassword = async function (this: IUser, candidatePassword: string): Promise<boolean> {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    return false;
  }
};

// Instance method to get public user data (without password)
userSchema.methods.toPublicJSON = function (this: IUser): UserResponse {
  const user = this.toObject();
  delete user.password;
  delete user.__v;
  return {
    id: user._id,
    email: user.email,
    full_name: user.full_name,
    phone: user.phone,
    role: user.role,
    status: user.status,
    profile: user.profile,
    created_at: user.created_at,
    updated_at: user.updated_at
  };
};

// Static method to find users by role
userSchema.statics.findByRole = function (this: Model<IUser>, role: UserRole) {
  return this.find({ role, status: 'active' });
};

// Static method to find active farmers
userSchema.statics.findActiveFarmers = function (this: Model<IUser>) {
  return this.find({ role: 'farmer', status: 'active' });
};

// Static method to find available agents
userSchema.statics.findAvailableAgents = function (this: Model<IUser>) {
  return this.find({ role: 'agent', status: 'active' });
};

// Static method for user search
userSchema.statics.searchUsers = function (
  this: Model<IUser>,
  query: string,
  options: { role?: UserRole; limit?: number } = {}
) {
  const searchRegex = new RegExp(query, 'i');
  const filter: any = {
    $or: [
      { full_name: searchRegex },
      { email: searchRegex },
    ],
  };

  if (options.role) {
    filter.role = options.role;
  }

  return this.find(filter)
    .select('-password')
    .limit(options.limit || 10)
    .sort({ created_at: -1 });
};

// Virtual for user's full profile based on role
userSchema.virtual('roleSpecificProfile').get(function (this: Document) {
  const user = this as unknown as IUser;
  if (!user.profile) return {};

  // Create a safe profile object with all possible properties
  const profile: any = {
    age: user.profile.age,
    gender: user.profile.gender,
    marital_status: user.profile.marital_status,
    education_level: user.profile.education_level,
    province: user.profile.province,
    district: user.profile.district,
    sector: user.profile.sector,
    cell: user.profile.cell,
    village: user.profile.village,
    service_areas: user.profile.service_areas,
    farm_details: user.profile.farm_details
  };

  // Filter out undefined properties
  Object.keys(profile).forEach(key => {
    if (profile[key] === undefined) {
      delete profile[key];
    }
  });

  return profile;
});

// Ensure virtual fields are included in JSON output
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

// Export the model
export const User: Model<IUser> = mongoose.model<IUser>('User', userSchema);
export default User;