import mongoose, { Schema, Document } from 'mongoose';

export interface IPestDisease extends Document {
  _id: string;
  type: 'pest' | 'disease';
  name: string;
  scientific_name?: string;
  description?: string;
  symptom_category?: string; // For diseases: the symptom displayed in dropdown (e.g., "Brown leaf tips and margins")
  damage_category?: string; // For pests: the damage displayed in dropdown (e.g., "Causes bronzing of leaves")
  symptoms?: string[];
  damage_description?: string;
  common_crops_affected?: string[];
  severity_indicators?: string[];
  prevention_methods?: string[];
  treatment_methods?: string[];
  image_url?: string;
  is_active: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  toPublicJSON(): any;
}

const PestDiseaseSchema = new Schema<IPestDisease>({
  type: {
    type: String,
    enum: ['pest', 'disease'],
    required: [true, 'Type is required (pest or disease)']
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [200, 'Name cannot exceed 200 characters']
  },
  scientific_name: {
    type: String,
    trim: true,
    maxlength: [200, 'Scientific name cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  symptom_category: {
    type: String,
    trim: true,
    maxlength: [200, 'Symptom category cannot exceed 200 characters']
  },
  damage_category: {
    type: String,
    trim: true,
    maxlength: [200, 'Damage category cannot exceed 200 characters']
  },
  symptoms: [{
    type: String,
    trim: true
  }],
  damage_description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Damage description cannot exceed 1000 characters']
  },
  common_crops_affected: [{
    type: String,
    trim: true
  }],
  severity_indicators: [{
    type: String,
    trim: true
  }],
  prevention_methods: [{
    type: String,
    trim: true
  }],
  treatment_methods: [{
    type: String,
    trim: true
  }],
  image_url: {
    type: String,
    trim: true
  },
  is_active: {
    type: Boolean,
    default: true
  },
  created_by: {
    type: String,
    ref: 'User',
    required: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes
PestDiseaseSchema.index({ type: 1, is_active: 1 });
PestDiseaseSchema.index({ name: 1 });
PestDiseaseSchema.index({ symptom_category: 1 });
PestDiseaseSchema.index({ damage_category: 1 });

// Convert to public JSON
PestDiseaseSchema.methods.toPublicJSON = function() {
  const pestDiseaseObject = this.toObject();
  
  return {
    id: pestDiseaseObject._id,
    type: pestDiseaseObject.type,
    name: pestDiseaseObject.name,
    scientific_name: pestDiseaseObject.scientific_name,
    description: pestDiseaseObject.description,
    symptom_category: pestDiseaseObject.symptom_category,
    damage_category: pestDiseaseObject.damage_category,
    symptoms: pestDiseaseObject.symptoms,
    damage_description: pestDiseaseObject.damage_description,
    common_crops_affected: pestDiseaseObject.common_crops_affected,
    severity_indicators: pestDiseaseObject.severity_indicators,
    prevention_methods: pestDiseaseObject.prevention_methods,
    treatment_methods: pestDiseaseObject.treatment_methods,
    image_url: pestDiseaseObject.image_url,
    is_active: pestDiseaseObject.is_active,
    created_at: pestDiseaseObject.created_at,
    updated_at: pestDiseaseObject.updated_at
  };
};

export const PestDisease = mongoose.model<IPestDisease>('PestDisease', PestDiseaseSchema);
