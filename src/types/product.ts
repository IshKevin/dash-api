import { Document } from 'mongoose';

// Product Status
export type ProductStatus = 'available' | 'out_of_stock' | 'discontinued';

// Product Category
export type ProductCategory = 
  | 'seeds' 
  | 'fertilizers' 
  | 'pesticides' 
  | 'tools' 
  | 'equipment' 
  | 'produce' 
  | 'organic_inputs' 
  | 'livestock_feed'
  | 'irrigation'
  | 'other';

// Base Product Interface
export interface IProduct extends Document {
  _id: string;
  name: string;
  category: ProductCategory;
  description?: string;
  price: number;
  quantity: number;
  unit: string;
  supplier_id: string;
  status: ProductStatus;
  harvest_date?: Date;
  expiry_date?: Date;
  sku?: string;
  brand?: string;
  images?: string[];
  specifications?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
  toPublicJSON(): import('./product').ProductResponse;
  isInStock(): boolean;
}

// Product Create Request
export interface CreateProductRequest {
  name: string;
  category: ProductCategory;
  description?: string;
  price: number;
  quantity: number;
  unit: string;
  supplier_id: string;
  harvest_date?: Date;
  expiry_date?: Date;
  sku?: string;
  brand?: string;
  images?: string[];
  specifications?: Record<string, any>;
}

// Product Update Request
export interface UpdateProductRequest {
  name?: string;
  category?: ProductCategory;
  description?: string;
  price?: number;
  quantity?: number;
  unit?: string;
  supplier_id?: string;
  status?: ProductStatus;
  harvest_date?: Date;
  expiry_date?: Date;
  sku?: string;
  brand?: string;
  images?: string[];
  specifications?: Record<string, any>;
}

// Product Response
export interface ProductResponse {
  id: string;
  name: string;
  category: ProductCategory;
  description?: string;
  price: number;
  quantity: number;
  unit: string;
  supplier_id: string;
  status: ProductStatus;
  harvest_date?: Date;
  expiry_date?: Date;
  sku?: string;
  brand?: string;
  images?: string[];
  specifications?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

// Product Filter Options
export interface ProductFilterOptions {
  category?: ProductCategory;
  status?: ProductStatus;
  supplier_id?: string;
  price_min?: number;
  price_max?: number;
  in_stock?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'created_at' | 'updated_at' | 'name' | 'price' | 'quantity';
  sortOrder?: 'asc' | 'desc';
}

// Product List Response
export interface ProductListResponse {
  products: ProductResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  categories: ProductCategory[];
}

// Product Stock Update
export interface StockUpdateRequest {
  quantity: number;
  operation: 'add' | 'subtract' | 'set';
  reason?: string;
}

// Low Stock Alert
export interface LowStockAlert {
  product_id: string;
  product_name: string;
  current_quantity: number;
  minimum_threshold: number;
  supplier_id: string;
}