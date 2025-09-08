import { Document } from 'mongoose';

// Supplier Status
export type SupplierStatus = 'active' | 'inactive' | 'pending_approval' | 'suspended';

// Supplier Category
export type SupplierCategory = 
  | 'seeds_supplier'
  | 'fertilizer_supplier' 
  | 'equipment_supplier'
  | 'produce_buyer'
  | 'input_distributor'
  | 'logistics_provider'
  | 'financial_services'
  | 'other';

// Base Supplier Interface
export interface ISupplier extends Document {
  _id: string;
  name: string;
  category: SupplierCategory;
  contact_person: string;
  email: string;
  phone: string;
  website?: string;
  address: ISupplierAddress;
  business_license?: string;
  tax_id?: string;
  bank_details?: IBankDetails;
  status: SupplierStatus;
  rating: number;
  total_orders: number;
  products_supplied?: string[];
  services_offered?: string[];
  delivery_areas?: string[];
  payment_terms?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

// Supplier Address Interface
export interface ISupplierAddress {
  street_address: string;
  city: string;
  province: string;
  postal_code?: string;
  country: string;
}

// Bank Details Interface
export interface IBankDetails {
  bank_name: string;
  account_name: string;
  account_number: string;
  routing_number?: string;
  swift_code?: string;
}

// Transaction Type
export type TransactionType = 'payment' | 'refund' | 'adjustment' | 'fee' | 'commission';

// Transaction Status
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'cancelled' | 'processing';

// Payment Method
export type PaymentMethod = 'cash' | 'mobile_money' | 'bank_transfer' | 'credit_card' | 'debit_card' | 'check';

// Base Transaction Interface
export interface ITransaction extends Document {
  _id: string;
  transaction_number: string;
  order_id?: string;
  service_request_id?: string;
  payer_id: string;
  payee_id: string;
  amount: number;
  currency: string;
  type: TransactionType;
  status: TransactionStatus;
  payment_method: PaymentMethod;
  reference_number?: string;
  description?: string;
  fees?: number;
  net_amount: number;
  processed_at?: Date;
  created_at: Date;
  updated_at: Date;
  toPublicJSON(): import('./supplier').TransactionResponse;
}

// Supplier Create Request
export interface CreateSupplierRequest {
  name: string;
  category: SupplierCategory;
  contact_person: string;
  email: string;
  phone: string;
  website?: string;
  address: ISupplierAddress;
  business_license?: string;
  tax_id?: string;
  bank_details?: IBankDetails;
  products_supplied?: string[];
  services_offered?: string[];
  delivery_areas?: string[];
  payment_terms?: string;
  notes?: string;
}

// Supplier Update Request
export interface UpdateSupplierRequest {
  name?: string;
  category?: SupplierCategory;
  contact_person?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: ISupplierAddress;
  business_license?: string;
  tax_id?: string;
  bank_details?: IBankDetails;
  status?: SupplierStatus;
  products_supplied?: string[];
  services_offered?: string[];
  delivery_areas?: string[];
  payment_terms?: string;
  notes?: string;
}

// Transaction Create Request
export interface CreateTransactionRequest {
  order_id?: string;
  service_request_id?: string;
  payer_id: string;
  payee_id: string;
  amount: number;
  currency?: string;
  type: TransactionType;
  payment_method: PaymentMethod;
  reference_number?: string;
  description?: string;
  fees?: number;
}

// Transaction Update Request
export interface UpdateTransactionRequest {
  status?: TransactionStatus;
  reference_number?: string;
  description?: string;
  fees?: number;
  processed_at?: Date;
}

// Supplier Response
export interface SupplierResponse {
  id: string;
  name: string;
  category: SupplierCategory;
  contact_person: string;
  email: string;
  phone: string;
  website?: string;
  address: ISupplierAddress;
  business_license?: string;
  tax_id?: string;
  bank_details?: IBankDetails;
  status: SupplierStatus;
  rating: number;
  total_orders: number;
  products_supplied?: string[];
  services_offered?: string[];
  delivery_areas?: string[];
  payment_terms?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

// Transaction Response
export interface TransactionResponse {
  id: string;
  transaction_number: string;
  order_id?: string;
  service_request_id?: string;
  payer_id: string;
  payee_id: string;
  amount: number;
  currency: string;
  type: TransactionType;
  status: TransactionStatus;
  payment_method: PaymentMethod;
  reference_number?: string;
  description?: string;
  fees?: number;
  net_amount: number;
  processed_at?: Date;
  created_at: Date;
  updated_at: Date;
}