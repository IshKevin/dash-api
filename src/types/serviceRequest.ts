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
  | 'harvest'
  | 'planting'
  | 'maintenance'
  | 'consultation'
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
  pest_management_details?: IPestManagementDetails;
  farmer_info?: IFarmerInfo;
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

// Add these to your types/serviceRequest.ts file

export interface HassBreakdown {
  selectedSizes: string[];
  c12c14?: string;
  c16c18?: string;
  c20c24?: string;
}

export interface ServiceLocation {
  province: string;
  district: string;
  sector?: string;
  cell?: string;
  village?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export interface HarvestDetails {
  workers_needed: number;
  equipment_needed: string[];
  trees_to_harvest: number;
  harvest_date_from: Date;
  harvest_date_to: Date;
  harvest_images?: string[];
  hass_breakdown?: HassBreakdown;
  
  // Admin approval details
  approved_workers?: number;
  approved_equipment?: string[];
  
  // Completion details
  actual_workers_used?: number;
  actual_harvest_amount?: string;
  harvest_quality_notes?: string;
  completion_images?: string[];
}

// Request body interfaces
export interface CreateHarvestRequest {
  workersNeeded: number | string;
  equipmentNeeded?: string[];
  treesToHarvest: number | string;
  harvestDateFrom: string;
  harvestDateTo: string;
  harvestImages?: string[];
  hassBreakdown?: HassBreakdown;
  location: ServiceLocation;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  notes?: string;
}

export interface ApproveHarvestRequest {
  agent_id?: string;
  scheduled_date?: string;
  cost_estimate?: number;
  notes?: string;
  approved_workers?: number | string;
  approved_equipment?: string[];
}

export interface RejectHarvestRequest {
  rejection_reason: string;
  notes?: string;
}

export interface CompleteHarvestRequest {
  completion_notes?: string;
  actual_workers_used?: number | string;
  actual_harvest_amount?: string;
  harvest_quality_notes?: string;
  completion_images?: string[];
}

export interface StartHarvestRequest {
  start_notes?: string;
  actual_start_date?: string;
}

// Response interfaces
export interface HarvestRequestResponse {
  id: string;
  farmer_id: string;
  agent_id?: string;
  service_type: 'harvest';
  title: string;
  description: string;
  request_number: string;
  status: 'pending' | 'approved' | 'rejected' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  requested_date: Date;
  scheduled_date?: Date;
  started_at?: Date;
  completed_at?: Date;
  approved_at?: Date;
  rejected_at?: Date;
  rejection_reason?: string;
  location: ServiceLocation;
  cost_estimate?: number;
  final_cost?: number;
  notes?: string;
  start_notes?: string;
  completion_notes?: string;
  harvest_details?: HarvestDetails;
  feedback?: {
    rating: number;
    comment?: string;
    submitted_at: Date;
  };
  created_at: Date;
  updated_at: Date;
}

export interface HarvestRequestListResponse {
  success: boolean;
  message: string;
  data: HarvestRequestResponse[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    limit: number;
  };
}

// Pest Control specific interfaces
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

export interface CreatePestControlRequest {
  service_type: 'pest_control';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  preferred_date: Date;
  location: {
    farm_name?: string;
    street_address?: string;
    city?: string;
    province: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
    access_instructions?: string;
  };
  pest_management_details: IPestManagementDetails;
  farmer_info: IFarmerInfo;
  attachments?: string[];
  notes?: string;
}