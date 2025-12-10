import { Document } from 'mongoose';

// Order Status
export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'returned';

// Payment Status
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'partial';

// Payment Method
export type PaymentMethod = 'cash' | 'mobile_money' | 'bank_transfer' | 'credit_card' | 'debit_card';

// Order Item Interface
export interface IOrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  specifications?: Record<string, any>;
}

// Shipping Address Interface
export interface IShippingAddress {
  full_name: string;
  phone: string;
  street_address: string;
  city: string;
  province: string;
  postal_code?: string;
  country: string;
  is_default?: boolean;
}

// Base Order 
export interface IOrder extends Document {
  _id: string;
  order_number: string;
  customer_id: string;
  items: IOrderItem[];
  subtotal: number;
  tax_amount: number;
  shipping_cost: number;
  discount_amount: number;
  total_amount: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method?: PaymentMethod;
  shipping_address: IShippingAddress;
  billing_address?: IShippingAddress;
  order_date: Date;
  expected_delivery_date?: Date;
  delivered_date?: Date;
  notes?: string;
  tracking_number?: string;
  created_at: Date;
  updated_at: Date;
  toPublicJSON(): import('./order').OrderResponse;
}

// Order Create Request - customer_id removed, will be auto-generated from auth context
export interface CreateOrderRequest {
  items: Array<{
    product_id: string;
    quantity: number;
    specifications?: Record<string, any>;
  }>;
  shipping_address: IShippingAddress;
  billing_address?: IShippingAddress;
  payment_method?: PaymentMethod;
  notes?: string;
  discount_code?: string;
}



// Order Update Request
export interface UpdateOrderRequest {
  status?: OrderStatus;
  payment_status?: PaymentStatus;
  payment_method?: PaymentMethod;
  shipping_address?: IShippingAddress;
  billing_address?: IShippingAddress;
  expected_delivery_date?: Date;
  delivered_date?: Date;
  notes?: string;
  tracking_number?: string;
}

// Order Response
export interface OrderResponse {
  id: string;
  order_number: string;
  customer_id: string;
  items: IOrderItem[];
  subtotal: number;
  tax_amount: number;
  shipping_cost: number;
  discount_amount: number;
  total_amount: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method?: PaymentMethod;
  shipping_address: IShippingAddress;
  billing_address?: IShippingAddress;
  order_date: Date;
  expected_delivery_date?: Date;
  delivered_date?: Date;
  notes?: string;
  tracking_number?: string;
  created_at: Date;
  updated_at: Date;
}

// Order Filter Options
export interface OrderFilterOptions {
  customer_id?: string;
  status?: OrderStatus;
  payment_status?: PaymentStatus;
  order_date_from?: Date;
  order_date_to?: Date;
  total_amount_min?: number;
  total_amount_max?: number;
  search?: string; // Search by order number or customer name
  page?: number;
  limit?: number;
  sortBy?: 'created_at' | 'updated_at' | 'order_date' | 'total_amount';
  sortOrder?: 'asc' | 'desc';
}

// Order List Response
export interface OrderListResponse {
  orders: OrderResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: {
    totalRevenue: number;
    averageOrderValue: number;
    statusCounts: Record<OrderStatus, number>;
  };
}

// Order Status Update Request
export interface OrderStatusUpdateRequest {
  status: OrderStatus;
  notes?: string;
  tracking_number?: string;
}

// Order Analytics
export interface OrderAnalytics {
  period: string;
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  statusBreakdown: Record<OrderStatus, number>;
  paymentStatusBreakdown: Record<PaymentStatus, number>;
  topProducts: Array<{
    product_id: string;
    product_name: string;
    quantity_sold: number;
    revenue: number;
  }>;
}