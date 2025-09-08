import { 
  TransactionType as SupplierTransactionType,
  TransactionStatus as SupplierTransactionStatus,
  PaymentMethod as SupplierPaymentMethod,
  ITransaction as SupplierITransaction,
  CreateTransactionRequest as SupplierCreateTransactionRequest,
  UpdateTransactionRequest as SupplierUpdateTransactionRequest,
  TransactionResponse as SupplierTransactionResponse
} from './supplier';

// Re-export the types with proper names
export type TransactionType = SupplierTransactionType;
export type TransactionStatus = SupplierTransactionStatus;
export type PaymentMethod = SupplierPaymentMethod;
export type ITransaction = SupplierITransaction;
export type CreateTransactionRequest = SupplierCreateTransactionRequest;
export type UpdateTransactionRequest = SupplierUpdateTransactionRequest;
export type TransactionResponse = SupplierTransactionResponse;

// Transaction Filter Options
export interface TransactionFilterOptions {
  payer_id?: string;
  payee_id?: string;
  order_id?: string;
  service_request_id?: string;
  type?: TransactionType;
  status?: TransactionStatus;
  payment_method?: PaymentMethod;
  date_from?: Date;
  date_to?: Date;
  amount_min?: number;
  amount_max?: number;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'created_at' | 'updated_at' | 'processed_at' | 'amount';
  sortOrder?: 'asc' | 'desc';
}

// Transaction List Response
export interface TransactionListResponse {
  transactions: TransactionResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: {
    totalAmount: number;
    totalFees: number;
    netAmount: number;
    typeBreakdown: Record<TransactionType, number>;
    statusBreakdown: Record<TransactionStatus, number>;
    paymentMethodBreakdown: Record<PaymentMethod, number>;
  };
}

// Financial Analytics
export interface FinancialAnalytics {
  period: string;
  totalTransactions: number;
  totalAmount: number;
  totalFees: number;
  netAmount: number;
  averageTransactionAmount: number;
  typeBreakdown: Record<TransactionType, {
    count: number;
    amount: number;
    fees: number;
  }>;
  statusBreakdown: Record<TransactionStatus, number>;
  paymentMethodBreakdown: Record<PaymentMethod, {
    count: number;
    amount: number;
  }>;
  dailyTrend: Array<{
    date: string;
    count: number;
    amount: number;
    fees: number;
  }>;
}