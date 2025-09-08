import mongoose, { Schema, Model } from 'mongoose';
import { 
  IServiceRequest, 
  IServiceLocation, 
  IServiceFeedback,
  ServiceRequestStatus, 
  ServiceRequestPriority, 
  ServiceType 
} from '../types/serviceRequest';

// Service Location Schema
const serviceLocationSchema = new Schema<IServiceLocation>({
  farm_name: {
    type: String,
    trim: true,
  },
  street_address: {
    type: String,
    required: [true, 'Street address is required'],
    trim: true,
  },
  city: {
    type: String,
    required: [true, 'City is required'],
    trim: true,
  },
  province: {
    type: String,
    required: [true, 'Province is required'],
    trim: true,
  },
  coordinates: {
    latitude: {
      type: Number,
      min: [-90, 'Latitude must be between -90 and 90'],
      max: [90, 'Latitude must be between -90 and 90'],
    },
    longitude: {
      type: Number,
      min: [-180, 'Longitude must be between -180 and 180'],
      max: [180, 'Longitude must be between -180 and 180'],
    },
  },
  access_instructions: {
    type: String,
    trim: true,
    maxlength: [500, 'Access instructions cannot exceed 500 characters'],
  },
}, {
  _id: false,
});

// Service Feedback Schema
const serviceFeedbackSchema = new Schema<IServiceFeedback>({
  rating: {
    type: Number,
    required: [true, 'Overall rating is required'],
    min: [1, 'Rating must be between 1 and 5'],
    max: [5, 'Rating must be between 1 and 5'],
    validate: {
      validator: function(v: number) {
        return Number.isInteger(v);
      },
      message: 'Rating must be a whole number'
    },
  },
  comment: {
    type: String,
    trim: true,
    maxlength: [1000, 'Comment cannot exceed 1000 characters'],
  },
  farmer_satisfaction: {
    type: Number,
    required: [true, 'Farmer satisfaction rating is required'],
    min: [1, 'Satisfaction rating must be between 1 and 5'],
    max: [5, 'Satisfaction rating must be between 1 and 5'],
  },
  agent_professionalism: {
    type: Number,
    required: [true, 'Agent professionalism rating is required'],
    min: [1, 'Professionalism rating must be between 1 and 5'],
    max: [5, 'Professionalism rating must be between 1 and 5'],
  },
  service_quality: {
    type: Number,
    required: [true, 'Service quality rating is required'],
    min: [1, 'Service quality rating must be between 1 and 5'],
    max: [5, 'Service quality rating must be between 1 and 5'],
  },
  would_recommend: {
    type: Boolean,
    required: [true, 'Recommendation status is required'],
  },
  submitted_at: {
    type: Date,
    default: Date.now,
  },
}, {
  _id: false,
});

// Main Service Request Schema
const serviceRequestSchema = new Schema<IServiceRequest>({
  request_number: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  farmer_id: {
    type: String,
    required: [true, 'Farmer ID is required'],
    trim: true,
    index: true,
  },
  agent_id: {
    type: String,
    trim: true,
    index: true,
  },
  service_type: {
    type: String,
    enum: {
      values: [
        'crop_consultation',
        'pest_control',
        'soil_testing',
        'irrigation_setup',
        'equipment_maintenance',
        'fertilizer_application',
        'harvest_assistance',
        'market_linkage',
        'training',
        'other'
      ] as ServiceType[],
      message: 'Service type must be a valid service type'
    },
    required: [true, 'Service type is required'],
    index: true,
  },
  title: {
    type: String,
    required: [true, 'Service title is required'],
    trim: true,
    minlength: [5, 'Title must be at least 5 characters long'],
    maxlength: [200, 'Title cannot exceed 200 characters'],
  },
  description: {
    type: String,
    required: [true, 'Service description is required'],
    trim: true,
    minlength: [10, 'Description must be at least 10 characters long'],
    maxlength: [2000, 'Description cannot exceed 2000 characters'],
  },
  priority: {
    type: String,
    enum: {
      values: ['low', 'medium', 'high', 'urgent'] as ServiceRequestPriority[],
      message: 'Priority must be low, medium, high, or urgent'
    },
    default: 'medium' as ServiceRequestPriority,
    index: true,
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'on_hold'] as ServiceRequestStatus[],
      message: 'Status must be a valid service request status'
    },
    default: 'pending' as ServiceRequestStatus,
    index: true,
  },
  requested_date: {
    type: Date,
    default: Date.now,
    index: true,
  },
  preferred_date: {
    type: Date,
    validate: {
      validator: function(this: any, v: Date) {
        return !v || v >= new Date();
      },
      message: 'Preferred date cannot be in the past'
    },
  },
  scheduled_date: {
    type: Date,
    validate: {
      validator: function(this: any, v: Date) {
        return !v || v >= new Date();
      },
      message: 'Scheduled date cannot be in the past'
    },
  },
  completed_date: {
    type: Date,
    validate: {
      validator: function(this: any, v: Date) {
        // We need to access the requested_date from the document context
        const requestedDate = this.get('requested_date');
        return !v || !requestedDate || v >= requestedDate;
      },
      message: 'Completed date cannot be before requested date'
    },
  },
  location: {
    type: serviceLocationSchema,
    required: [true, 'Service location is required'],
  },
  cost_estimate: {
    type: Number,
    min: [0, 'Cost estimate must be non-negative'],
  },
  actual_cost: {
    type: Number,
    min: [0, 'Actual cost must be non-negative'],
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot exceed 1000 characters'],
  },
  feedback: {
    type: serviceFeedbackSchema,
  },
  attachments: [{
    type: String,
    trim: true,
    validate: {
      validator: function(v: string) {
        return /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/.test(v);
      },
      message: 'Attachment must be a valid URL'
    },
  }],
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  versionKey: false,
});

// Compound indexes for better query performance
serviceRequestSchema.index({ farmer_id: 1, status: 1 });
serviceRequestSchema.index({ agent_id: 1, status: 1 });
serviceRequestSchema.index({ service_type: 1, status: 1 });
serviceRequestSchema.index({ 'location.province': 1, 'location.city': 1 });
serviceRequestSchema.index({ requested_date: -1, priority: 1 });
serviceRequestSchema.index({ status: 1, priority: 1 });
serviceRequestSchema.index({ created_at: -1 });

// Text search index
serviceRequestSchema.index({ 
  title: 'text', 
  description: 'text',
  'location.farm_name': 'text'
});

// Pre-save middleware to generate request number and validate status transitions
serviceRequestSchema.pre('save', function(this: IServiceRequest, next) {
  // Generate request number if not provided
  if (!this.request_number) {
    const timestamp = Date.now().toString();
    const serviceCode = this.service_type.substring(0, 3).toUpperCase();
    const randomSuffix = Math.random().toString(36).substring(2, 4).toUpperCase();
    this.request_number = `SR-${serviceCode}-${timestamp}-${randomSuffix}`;
  }

  // Auto-assign completed_date when status changes to completed
  if (this.status === 'completed' && !this.completed_date) {
    this.completed_date = new Date();
  }

  // Clear completed_date if status is not completed
  if (this.status !== 'completed' && this.completed_date) {
    (this as any).completed_date = undefined;
  }

  // Validate agent assignment
  if (['assigned', 'in_progress', 'completed'].includes(this.status) && !this.agent_id) {
    return next(new Error('Agent must be assigned for this status'));
  }

  next();
});

// Instance method to check if request can be cancelled
serviceRequestSchema.methods.canBeCancelled = function(this: IServiceRequest): boolean {
  return ['pending', 'assigned'].includes(this.status);
};

// Instance method to check if request can be assigned
serviceRequestSchema.methods.canBeAssigned = function(this: IServiceRequest): boolean {
  return this.status === 'pending';
};

// Instance method to check if feedback can be submitted
serviceRequestSchema.methods.canSubmitFeedback = function(this: IServiceRequest): boolean {
  return this.status === 'completed' && !this.feedback;
};

// Instance method to calculate duration
serviceRequestSchema.methods.getDuration = function(this: IServiceRequest): number | null {
  if (!this.completed_date) return null;
  
  const startDate = this.scheduled_date || this.requested_date;
  const endDate = this.completed_date;
  
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Duration in days
};

// Instance method to get public service request data
serviceRequestSchema.methods.toPublicJSON = function(this: IServiceRequest) {
  const request = this.toObject();
  return {
    id: request._id,
    request_number: request.request_number,
    farmer_id: request.farmer_id,
    agent_id: request.agent_id,
    service_type: request.service_type,
    title: request.title,
    description: request.description,
    priority: request.priority,
    status: request.status,
    requested_date: request.requested_date,
    preferred_date: request.preferred_date,
    scheduled_date: request.scheduled_date,
    completed_date: request.completed_date,
    location: request.location,
    cost_estimate: request.cost_estimate,
    actual_cost: request.actual_cost,
    notes: request.notes,
    feedback: request.feedback,
    attachments: request.attachments,
    created_at: request.created_at,
    updated_at: request.updated_at,
  };
};

// Static method to find requests by farmer
serviceRequestSchema.statics.findByFarmer = function(this: Model<IServiceRequest>, farmerId: string) {
  return this.find({ farmer_id: farmerId }).sort({ created_at: -1 });
};

// Static method to find requests by agent
serviceRequestSchema.statics.findByAgent = function(this: Model<IServiceRequest>, agentId: string) {
  return this.find({ agent_id: agentId }).sort({ created_at: -1 });
};

// Static method to find pending requests
serviceRequestSchema.statics.findPending = function(this: Model<IServiceRequest>) {
  return this.find({ status: 'pending' }).sort({ priority: -1, created_at: 1 });
};

// Static method to find urgent requests
serviceRequestSchema.statics.findUrgent = function(this: Model<IServiceRequest>) {
  return this.find({ 
    priority: 'urgent', 
    status: { $in: ['pending', 'assigned', 'in_progress'] }
  }).sort({ created_at: 1 });
};

// Static method to find overdue requests
serviceRequestSchema.statics.findOverdue = function(this: Model<IServiceRequest>) {
  const now = new Date();
  return this.find({
    status: { $in: ['assigned', 'in_progress'] },
    scheduled_date: { $lt: now }
  }).sort({ scheduled_date: 1 });
};

// Static method for advanced search
serviceRequestSchema.statics.searchRequests = function(
  this: Model<IServiceRequest>,
  query: string,
  options: { 
    service_type?: ServiceType; 
    status?: ServiceRequestStatus;
    priority?: ServiceRequestPriority;
    limit?: number 
  } = {}
) {
  const filter: any = {
    $and: [
      {
        $or: [
          { $text: { $search: query } },
          { title: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
          { request_number: { $regex: query, $options: 'i' } },
        ]
      }
    ]
  };

  if (options.service_type) {
    filter.$and.push({ service_type: options.service_type });
  }

  if (options.status) {
    filter.$and.push({ status: options.status });
  }

  if (options.priority) {
    filter.$and.push({ priority: options.priority });
  }

  return this.find(filter)
    .limit(options.limit || 20)
    .sort({ _id: { $meta: 'textScore' }, created_at: -1 });
};

// Virtual for request age in days
serviceRequestSchema.virtual('ageInDays').get(function(this: IServiceRequest) {
  const now = new Date();
  const requestDate = this.requested_date;
  const diffTime = Math.abs(now.getTime() - requestDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for status description
serviceRequestSchema.virtual('statusDescription').get(function(this: IServiceRequest) {
  const statusMap = {
    pending: 'Awaiting Assignment',
    assigned: 'Agent Assigned',
    in_progress: 'Work in Progress',
    completed: 'Service Completed',
    cancelled: 'Request Cancelled',
    on_hold: 'Temporarily On Hold'
  };
  return statusMap[this.status] || 'Unknown Status';
});

// Virtual for average feedback rating
serviceRequestSchema.virtual('averageFeedbackRating').get(function(this: IServiceRequest) {
  if (!this.feedback) return null;
  
  const { farmer_satisfaction, agent_professionalism, service_quality } = this.feedback;
  return (farmer_satisfaction + agent_professionalism + service_quality) / 3;
});

// Ensure virtual fields are included in JSON output
serviceRequestSchema.set('toJSON', { virtuals: true });
serviceRequestSchema.set('toObject', { virtuals: true });

// Export the model
export const ServiceRequest: Model<IServiceRequest> = mongoose.model<IServiceRequest>('ServiceRequest', serviceRequestSchema);
export default ServiceRequest;