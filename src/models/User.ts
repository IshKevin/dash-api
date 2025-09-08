import mongoose, { Schema, Model, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUser, UserRole, UserStatus, UserResponse } from '../types/user';

// User Profile Schema
const userProfileSchema = new Schema({
  age: {
    type: Number,
    min: 16,
    max: 100,
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
  },
  province: {
    type: String,
    trim: true,
  },
  district: {
    type: String,
    trim: true,
  },
  farm_size: {
    type: Number,
    min: 0,
  },
  crops: [{
    type: String,
    trim: true,
  }],
  // Agent specific fields
  specialization: [{
    type: String,
    trim: true,
  }],
  service_areas: [{
    type: String,
    trim: true,
  }],
  experience_years: {
    type: Number,
    min: 0,
  },
  // Shop Manager specific fields
  shop_name: {
    type: String,
    trim: true,
  },
  shop_location: {
    type: String,
    trim: true,
  },
  business_license: {
    type: String,
    trim: true,
  },
  // Farmer specific fields
  farming_experience: {
    type: Number,
    min: 0,
  },
  certification_type: {
    type: String,
    trim: true,
  },
}, {
  _id: false, // Don't create a separate ID for the profile subdocument
});

// Main User Schema
const userSchema = new Schema<IUser>({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      'Please provide a valid email address'
    ],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters long'],
    select: false, // Don't include password in queries by default
  },
  full_name: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    minlength: [2, 'Full name must be at least 2 characters long'],
    maxlength: [100, 'Full name cannot exceed 100 characters'],
  },
  phone: {
    type: String,
    trim: true,
    match: [
      /^[+]?[\d\s\-\(\)]{10,15}$/,
      'Please provide a valid phone number'
    ],
  },
  role: {
    type: String,
    enum: {
      values: ['admin', 'agent', 'farmer', 'shop_manager'] as UserRole[],
      message: 'Role must be one of: admin, agent, farmer, shop_manager'
    },
    default: 'farmer' as UserRole,
    required: true,
  },
  status: {
    type: String,
    enum: {
      values: ['active', 'inactive'] as UserStatus[],
      message: 'Status must be either active or inactive'
    },
    default: 'active' as UserStatus,
  },
  profile: {
    type: userProfileSchema,
    default: {},
  },
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  versionKey: false,
});

// Indexes for better query performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ status: 1 });
userSchema.index({ 'profile.province': 1 });
userSchema.index({ 'profile.district': 1 });
userSchema.index({ created_at: -1 });

// Pre-save middleware to hash password
userSchema.pre('save', async function(this: IUser, next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();

  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Instance method to compare password
userSchema.methods.comparePassword = async function(this: IUser, candidatePassword: string): Promise<boolean> {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    return false;
  }
};

// Instance method to get public user data (without password)
userSchema.methods.toPublicJSON = function(this: IUser): UserResponse {
  const user = this.toObject();
  delete user.password;
  return {
    id: user._id,
    email: user.email,
    full_name: user.full_name,
    phone: user.phone,
    role: user.role,
    status: user.status,
    profile: user.profile,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
};

// Static method to find users by role
userSchema.statics.findByRole = function(this: Model<IUser>, role: UserRole) {
  return this.find({ role, status: 'active' });
};

// Static method to find active farmers
userSchema.statics.findActiveFarmers = function(this: Model<IUser>) {
  return this.find({ role: 'farmer', status: 'active' });
};

// Static method to find available agents
userSchema.statics.findAvailableAgents = function(this: Model<IUser>) {
  return this.find({ role: 'agent', status: 'active' });
};

// Static method for user search
userSchema.statics.searchUsers = function(
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
userSchema.virtual('roleSpecificProfile').get(function(this: Document) {
  const user = this as unknown as IUser;
  if (!user.profile) return {};

  // Create a safe profile object with all possible properties
  const profile: any = {
    age: user.profile.age,
    gender: user.profile.gender,
    province: user.profile.province,
    district: user.profile.district,
    farm_size: (user.profile as any).farm_size,
    crops: (user.profile as any).crops,
    farming_experience: (user.profile as any).farming_experience,
    certification_type: (user.profile as any).certification_type,
    specialization: (user.profile as any).specialization,
    service_areas: (user.profile as any).service_areas,
    experience_years: (user.profile as any).experience_years,
    shop_name: (user.profile as any).shop_name,
    shop_location: (user.profile as any).shop_location,
    business_license: (user.profile as any).business_license,
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