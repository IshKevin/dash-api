// Standard API Response Interface
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: ValidationError[] | undefined;
  meta?: ResponseMeta | undefined;
}

// Response Metadata
export interface ResponseMeta {
  timestamp: string;
  version: string;
  pagination?: PaginationMeta | undefined;
}

// Pagination Metadata
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Validation Error Interface
export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

// Success Response Builder
export interface SuccessResponse<T = any> extends ApiResponse<T> {
  success: true;
  data: T;
  errors?: undefined;
  meta?: ResponseMeta | undefined;
}

// Error Response Builder
export interface ErrorResponse extends ApiResponse<undefined> {
  success: false;
  data?: undefined;
  errors?: ValidationError[] | undefined;
  meta?: ResponseMeta | undefined;
}

// HTTP Status Codes
export enum HttpStatusCode {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,
}

// Request Query Parameters
export interface QueryParams {
  page?: string;
  limit?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  search?: string;
  filter?: Record<string, any>;
}

// File Upload Response
export interface FileUploadResponse {
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  uploadedAt: Date;
}

// Bulk Operation Response
export interface BulkOperationResponse {
  totalProcessed: number;
  successful: number;
  failed: number;
  errors: Array<{
    index: number;
    error: string;
  }>;
}

// Health Check Response
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  uptime: number;
  timestamp: string;
  services: {
    database: 'connected' | 'disconnected';
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
  };
}

// Analytics Response Types
export interface AnalyticsResponse {
  period: string;
  data: Record<string, number | string>;
  summary: {
    total: number;
    change: number;
    changePercentage: number;
  };
}

// Search Response
export interface SearchResponse<T> {
  results: T[];
  total: number;
  query: string;
  suggestions?: string[];
  facets?: Record<string, number>;
}