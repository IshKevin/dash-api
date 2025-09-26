// Enhanced Service Request Model with Harvest Support

import mongoose, { Schema, Document } from 'mongoose';

export interface IHassBreakdown {
  selectedSizes: string[];
  c12c14?: string;
  c16c18?: string;
  c20c24?: string;
}

export interface IHarvestDetails {
  workers_needed: number;
  equipment_needed: string[];
  trees_to_harvest: number;
  harvest_date_from: Date;
  harvest_date_to: Date;
  harvest_images?: string[];
  hass_breakdown?: IHassBreakdown;
  
  // Admin approval details
  approved_workers?: number;
  approved_equipment?: string[];
  
  // Completion details
  actual_workers_used?: number;
  actual_harvest_amount?: string;
  harvest_quality_notes?: string;
  completion_images?: string[];
}

export interface IPestDisease {
  name: string;
  first_spotted_date: Date;
  order: number;
  is_primary: boolean;
}

export interface IPestManagementDetails {
  pests_diseases: IPestDisease[];
  first_noticed: string;
  damage_observed: string;
  damage_details: string;
  control_methods_tried: string;
  severity_level: 'low' | 'medium' | 'high' | 'critical';
}

export interface IFarmerInfo {
  name: string;
  phone: string;
  email?: string;
  location: string;
}

export interface IServiceLocation {
  farm_name?: string;
  street_address?: string;
  city?: string;
  province: string;
  district?: string;
  sector?: string;
  cell?: string;
  village?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  access_instructions?: string;
}

export interface IServiceFeedback {
  rating: number;
  comment?: string;
  submitted_at: Date;
}

export interface IServiceRequest extends Document {
  _id: string;
  farmer_id: string;
  agent_id?: string;
  service_type: 'harvest' | 'planting' | 'maintenance' | 'consultation' | 'pest_control' | 'other';
  title: string;
  description: string;
  request_number: string;
  status: 'pending' | 'approved' | 'rejected' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  
  // Dates
  requested_date: Date;
  scheduled_date?: Date;
  started_at?: Date;
  completed_at?: Date;
  approved_at?: Date;
  rejected_at?: Date;
  
  // Admin actions
  approved_by?: string;
  rejected_by?: string;
  completed_by?: string;
  rejection_reason?: string;
  
  // Details
  location: IServiceLocation;
  cost_estimate?: number;
  final_cost?: number;
  notes?: string;
  start_notes?: string;
  completion_notes?: string;
  
  // Service-specific details
  harvest_details?: IHarvestDetails;
  pest_management_details?: IPestManagementDetails;
  farmer_info?: IFarmerInfo;
  attachments?: string[];
  
  // Feedback
  feedback?: IServiceFeedback;
  
  created_at: Date;
  updated_at: Date;
  
  toPublicJSON(): any;
  canBeCancelled(): boolean;
  canSubmitFeedback(): boolean;
}

const HassBreakdownSchema = new Schema({
  selectedSizes: [{ type: String }],
  c12c14: { type: String },
  c16c18: { type: String },
  c20c24: { type: String }
}, { _id: false });

const PestDiseaseSchema = new Schema({
  name: { type: String, required: true, trim: true },
  first_spotted_date: { type: Date, required: true },
  order: { type: Number, required: true, min: 1 },
  is_primary: { type: Boolean, required: true, default: false }
}, { _id: false });

const PestManagementDetailsSchema = new Schema({
  pests_diseases: [PestDiseaseSchema],
  first_noticed: { type: String, required: true, trim: true },
  damage_observed: { type: String, required: true, trim: true },
  damage_details: { type: String, required: true, trim: true },
  control_methods_tried: { type: String, required: true, trim: true },
  severity_level: { 
    type: String, 
    enum: ['low', 'medium', 'high', 'critical'], 
    required: true 
  }
}, { _id: false });

const FarmerInfoSchema = new Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, trim: true },
  location: { type: String, required: true, trim: true }
}, { _id: false });

const HarvestDetailsSchema = new Schema({
  workers_needed: { type: Number, required: true, min: 1 },
  equipment_needed: [{ type: String }],
  trees_to_harvest: { type: Number, required: true, min: 1 },
  harvest_date_from: { type: Date, required: true },
  harvest_date_to: { type: Date, required: true },
  harvest_images: [{ type: String }],
  hass_breakdown: HassBreakdownSchema,
  
  // Admin approval details
  approved_workers: { type: Number, min: 1 },
  approved_equipment: [{ type: String }],
  
  // Completion details
  actual_workers_used: { type: Number, min: 1 },
  actual_harvest_amount: { type: String },
  harvest_quality_notes: { type: String },
  completion_images: [{ type: String }]
}, { _id: false });

const ServiceLocationSchema = new Schema({
  farm_name: { type: String, trim: true },
  street_address: { type: String, trim: true },
  city: { type: String, trim: true },
  province: { type: String, required: true, trim: true },
  district: { type: String, trim: true },
  sector: { type: String, trim: true },
  cell: { type: String, trim: true },
  village: { type: String, trim: true },
  coordinates: {
    latitude: { type: Number },
    longitude: { type: Number }
  },
  access_instructions: { type: String, trim: true }
}, { _id: false });

const ServiceFeedbackSchema = new Schema({
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, trim: true },
  submitted_at: { type: Date, default: Date.now }
}, { _id: false });

const ServiceRequestSchema = new Schema<IServiceRequest>({
  farmer_id: {
    type: String,
    required: [true, 'Farmer ID is required'],
    ref: 'User'
  },
  agent_id: {
    type: String,
    ref: 'User'
  },
  service_type: {
    type: String,
    enum: ['harvest', 'planting', 'maintenance', 'consultation', 'pest_control', 'other'],
    required: [true, 'Service type is required']
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  request_number: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'assigned', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  // Dates
  requested_date: { type: Date, default: Date.now },
  scheduled_date: { type: Date },
  started_at: { type: Date },
  completed_at: { type: Date },
  approved_at: { type: Date },
  rejected_at: { type: Date },
  
  // Admin actions
  approved_by: { type: String, ref: 'User' },
  rejected_by: { type: String, ref: 'User' },
  completed_by: { type: String, ref: 'User' },
  rejection_reason: { type: String, trim: true },
  
  // Details
  location: { type: ServiceLocationSchema, required: true },
  cost_estimate: { type: Number, min: 0 },
  final_cost: { type: Number, min: 0 },
  notes: { type: String, trim: true },
  start_notes: { type: String, trim: true },
  completion_notes: { type: String, trim: true },
  
  // Service-specific details
  harvest_details: HarvestDetailsSchema,
  pest_management_details: PestManagementDetailsSchema,
  farmer_info: FarmerInfoSchema,
  attachments: [{ type: String, trim: true }],
  
  // Feedback
  feedback: ServiceFeedbackSchema
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes for better query performance
ServiceRequestSchema.index({ farmer_id: 1, status: 1 });
ServiceRequestSchema.index({ agent_id: 1, status: 1 });
ServiceRequestSchema.index({ service_type: 1, status: 1 });
ServiceRequestSchema.index({ request_number: 1 });
ServiceRequestSchema.index({ 'harvest_details.harvest_date_from': 1, 'harvest_details.harvest_date_to': 1 });
ServiceRequestSchema.index({ 'location.province': 1, 'location.district': 1 });

// Methods
ServiceRequestSchema.methods.canBeCancelled = function(): boolean {
  return ['pending', 'approved'].includes(this.status);
};

ServiceRequestSchema.methods.canSubmitFeedback = function(): boolean {
  return this.status === 'completed' && !this.feedback;
};

// Convert to public JSON (exclude sensitive data)
ServiceRequestSchema.methods.toPublicJSON = function() {
  const requestObject = this.toObject();
  
  return {
    id: requestObject._id,
    farmer_id: requestObject.farmer_id,
    agent_id: requestObject.agent_id,
    service_type: requestObject.service_type,
    title: requestObject.title,
    description: requestObject.description,
    request_number: requestObject.request_number,
    status: requestObject.status,
    priority: requestObject.priority,
    requested_date: requestObject.requested_date,
    scheduled_date: requestObject.scheduled_date,
    started_at: requestObject.started_at,
    completed_at: requestObject.completed_at,
    approved_at: requestObject.approved_at,
    rejected_at: requestObject.rejected_at,
    rejection_reason: requestObject.rejection_reason,
    location: requestObject.location,
    cost_estimate: requestObject.cost_estimate,
    final_cost: requestObject.final_cost,
    notes: requestObject.notes,
    start_notes: requestObject.start_notes,
    completion_notes: requestObject.completion_notes,
    harvest_details: requestObject.harvest_details,
    pest_management_details: requestObject.pest_management_details,
    farmer_info: requestObject.farmer_info,
    attachments: requestObject.attachments,
    feedback: requestObject.feedback,
    created_at: requestObject.created_at,
    updated_at: requestObject.updated_at
  };
};

export const ServiceRequest = mongoose.model<IServiceRequest>('ServiceRequest', ServiceRequestSchema);