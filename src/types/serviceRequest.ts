import { Document } from 'mongoose';

// Service Request Status
export type ServiceRequestStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled' | 'on_hold';

// Service Request Priority
export type ServiceRequestPriority = 'low' | 'medium' | 'high' | 'urgent';

// Service Types
export type ServiceType = 
  | 'crop_consultation' 
  | 'pest_control' 
  | 'soil_testing' 
  | 'irrigation_setup' 
  | 'equipment_maintenance' 
  | 'fertilizer_application' 
  | 'harvest_assistance' 
  | 'market_linkage'
  | 'training'
  | 'other';

// Base Service Request Interface
export interface IServiceRequest extends Document {
  _id: string;
  request_number: string;
  farmer_id: string;
  agent_id?: string;
  service_type: ServiceType;
  title: string;
  description: string;
  priority: ServiceRequestPriority;
  status: ServiceRequestStatus;
  requested_date: Date;
  preferred_date?: Date;
  scheduled_date?: Date;
  completed_date?: Date;
  location: IServiceLocation;
  cost_estimate?: number;
  actual_cost?: number;
  notes?: string;
  feedback?: IServiceFeedback;
  attachments?: string[];
  created_at: Date;
  updated_at: Date;
  toPublicJSON(): import('./serviceRequest').ServiceRequestResponse;
}

// Service Location Interface
export interface IServiceLocation {
  farm_name?: string;
  street_address: string;
  city: string;
  province: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  access_instructions?: string;
}

// Service Feedback Interface
export interface IServiceFeedback {
  rating: number; // 1-5 scale
  comment?: string;
  farmer_satisfaction: number; // 1-5 scale
  agent_professionalism: number; // 1-5 scale
  service_quality: number; // 1-5 scale
  would_recommend: boolean;
  submitted_at: Date;
}

// Service Request Create Request
export interface CreateServiceRequestRequest {
  farmer_id: string;
  service_type: ServiceType;
  title: string;
  description: string;
  priority?: ServiceRequestPriority;
  preferred_date?: Date;
  location: IServiceLocation;
  attachments?: string[];
}

// Service Request Update Request
export interface UpdateServiceRequestRequest {
  agent_id?: string;
  service_type?: ServiceType;
  title?: string;
  description?: string;
  priority?: ServiceRequestPriority;
  status?: ServiceRequestStatus;
  preferred_date?: Date;
  scheduled_date?: Date;
  completed_date?: Date;
  location?: IServiceLocation;
  cost_estimate?: number;
  actual_cost?: number;
  notes?: string;
  attachments?: string[];
}

// Service Request Response
export interface ServiceRequestResponse {
  id: string;
  request_number: string;
  farmer_id: string;
  agent_id?: string;
  service_type: ServiceType;
  title: string;
  description: string;
  priority: ServiceRequestPriority;
  status: ServiceRequestStatus;
  requested_date: Date;
  preferred_date?: Date;
  scheduled_date?: Date;
  completed_date?: Date;
  location: IServiceLocation;
  cost_estimate?: number;
  actual_cost?: number;
  notes?: string;
  feedback?: IServiceFeedback;
  attachments?: string[];
  created_at: Date;
  updated_at: Date;
}

// Service Request Filter Options
export interface ServiceRequestFilterOptions {
  farmer_id?: string;
  agent_id?: string;
  service_type?: ServiceType;
  status?: ServiceRequestStatus;
  priority?: ServiceRequestPriority;
  province?: string;
  city?: string;
  date_from?: Date;
  date_to?: Date;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'created_at' | 'updated_at' | 'requested_date' | 'priority';
  sortOrder?: 'asc' | 'desc';
}

// Service Request List Response
export interface ServiceRequestListResponse {
  requests: ServiceRequestResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: {
    statusCounts: Record<ServiceRequestStatus, number>;
    serviceTypeCounts: Record<ServiceType, number>;
    averageCompletionTime: number; // in days
  };
}

// Agent Assignment Request
export interface AgentAssignmentRequest {
  agent_id: string;
  scheduled_date?: Date;
  cost_estimate?: number;
  notes?: string;
}

// Service Feedback Request
export interface ServiceFeedbackRequest {
  rating: number;
  comment?: string;
  farmer_satisfaction: number;
  agent_professionalism: number;
  service_quality: number;
  would_recommend: boolean;
}

// Service Request Analytics
export interface ServiceRequestAnalytics {
  period: string;
  totalRequests: number;
  completedRequests: number;
  completionRate: number;
  averageCompletionTime: number;
  serviceTypeBreakdown: Record<ServiceType, number>;
  statusBreakdown: Record<ServiceRequestStatus, number>;
  averageCost: number;
  averageRating: number;
  topAgents: Array<{
    agent_id: string;
    requests_handled: number;
    average_rating: number;
    completion_rate: number;
  }>;
}