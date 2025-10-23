import { Schema, model, Document } from 'mongoose';

export interface IFarmerProfile extends Document {
  user_id: string;
  
  // Personal Information
  age?: number;
  id_number?: string;
  gender?: 'Male' | 'Female' | 'Other';
  marital_status?: 'Single' | 'Married' | 'Divorced' | 'Widowed';
  education_level?: 'Primary' | 'Secondary' | 'University' | 'None';
  
  // Personal Location
  province?: string;
  district?: string;
  sector?: string;
  cell?: string;
  village?: string;
  
  // Farm Information
  farm_age?: number;
  planted?: string;
  avocado_type?: string;
  mixed_percentage?: number;
  farm_size?: number;
  tree_count?: number;
  upi_number?: string;
  
  // Farm Location
  farm_province?: string;
  farm_district?: string;
  farm_sector?: string;
  farm_cell?: string;
  farm_village?: string;
  
  // Additional fields
  assistance?: string[];
  image?: string;
  
  created_at: Date;
  updated_at: Date;
}

const farmerProfileSchema = new Schema<IFarmerProfile>({
  user_id: {
    type: String,
    required: true,
    unique: true,
    ref: 'User'
  },
  
  // Personal Information
  age: { type: Number, min: 0, max: 150 },
  id_number: { type: String, trim: true },
  gender: { type: String, enum: ['Male', 'Female', 'Other'] },
  marital_status: { type: String, enum: ['Single', 'Married', 'Divorced', 'Widowed'] },
  education_level: { type: String, enum: ['Primary', 'Secondary', 'University', 'None'] },
  
  // Personal Location
  province: { type: String, trim: true },
  district: { type: String, trim: true },
  sector: { type: String, trim: true },
  cell: { type: String, trim: true },
  village: { type: String, trim: true },
  
  // Farm Information
  farm_age: { type: Number, min: 0 },
  planted: { type: String, trim: true },
  avocado_type: { type: String, trim: true },
  mixed_percentage: { type: Number, min: 0, max: 100 },
  farm_size: { type: Number, min: 0 },
  tree_count: { type: Number, min: 0, default: 0 },
  upi_number: { type: String, trim: true },
  
  // Farm Location
  farm_province: { type: String, trim: true },
  farm_district: { type: String, trim: true },
  farm_sector: { type: String, trim: true },
  farm_cell: { type: String, trim: true },
  farm_village: { type: String, trim: true },
  
  // Additional fields
  assistance: [{ type: String, trim: true }],
  image: { type: String, trim: true }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes
farmerProfileSchema.index({ user_id: 1 });
farmerProfileSchema.index({ district: 1 });
farmerProfileSchema.index({ province: 1 });

export default model<IFarmerProfile>('FarmerProfile', farmerProfileSchema);