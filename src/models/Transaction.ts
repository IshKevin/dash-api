import mongoose, { Schema, Model } from 'mongoose';
import { 
  ITransaction,
  TransactionType, 
  TransactionStatus, 
  PaymentMethod 
} from '../types/transaction';

// Main Transaction Schema
const transactionSchema = new Schema<ITransaction>({
  transaction_number: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  order_id: {
    type: String,
    trim: true,
    index: true,
  },
  service_request_id: {
    type: String,
    trim: true,
    index: true,
  },
  payer_id: {
    type: String,
    required: [true, 'Payer ID is required'],
    trim: true,
    index: true,
  },
  payee_id: {
    type: String,
    required: [true, 'Payee ID is required'],
    trim: true,
    index: true,
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0.01, 'Amount must be greater than zero'],
    validate: {
      validator: function(v: number) {
        return Number.isFinite(v) && v > 0;
      },
      message: 'Amount must be a valid positive number'
    },
    index: true,
  },
  currency: {
    type: String,
    required: [true, 'Currency is required'],
    trim: true,
    uppercase: true,
    default: 'RWF',
    match: [
      /^[A-Z]{3}$/,
      'Currency must be a valid 3-letter currency code'
    ],
  },
  type: {
    type: String,
    enum: {
      values: ['payment', 'refund', 'adjustment', 'fee', 'commission'] as TransactionType[],
      message: 'Type must be a valid transaction type'
    },
    required: [true, 'Transaction type is required'],
    index: true,
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'completed', 'failed', 'cancelled', 'processing'] as TransactionStatus[],
      message: 'Status must be a valid transaction status'
    },
    default: 'pending' as TransactionStatus,
    index: true,
  },
  payment_method: {
    type: String,
    enum: {
      values: ['cash', 'mobile_money', 'bank_transfer', 'credit_card', 'debit_card', 'check'] as PaymentMethod[],
      message: 'Payment method must be a valid payment method'
    },
    required: [true, 'Payment method is required'],
    index: true,
  },
  reference_number: {
    type: String,
    trim: true,
    index: true,
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters'],
  },
  fees: {
    type: Number,
    default: 0,
    min: [0, 'Fees cannot be negative'],
  },
  net_amount: {
    type: Number,
    required: [true, 'Net amount is required'],
    min: [0, 'Net amount cannot be negative'],
  },
  processed_at: {
    type: Date,
    validate: {
      validator: function(v: Date) {
        return !v || v <= new Date();
      },
      message: 'Processed date cannot be in the future'
    },
    index: true,
  },
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  versionKey: false,
});

// Compound indexes for better query performance
transactionSchema.index({ payer_id: 1, status: 1 });
transactionSchema.index({ payee_id: 1, status: 1 });
transactionSchema.index({ order_id: 1, status: 1 });
transactionSchema.index({ service_request_id: 1, status: 1 });
transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ payment_method: 1, status: 1 });
transactionSchema.index({ created_at: -1, amount: -1 });
transactionSchema.index({ processed_at: -1 });

// Text search index
transactionSchema.index({ 
  transaction_number: 'text', 
  reference_number: 'text',
  description: 'text'
});

// Pre-save middleware to generate transaction number and calculate net amount
transactionSchema.pre('save', function(this: ITransaction, next) {
  // Generate transaction number if not provided
  if (!this.transaction_number) {
    const timestamp = Date.now().toString();
    const typeCode = this.type.substring(0, 3).toUpperCase();
    const randomSuffix = Math.random().toString(36).substring(2, 4).toUpperCase();
    this.transaction_number = `TXN-${typeCode}-${timestamp}-${randomSuffix}`;
  }

  // Calculate net amount (amount - fees)
  this.net_amount = Math.max(0, this.amount - (this.fees || 0));

  // Auto-set processed_at when status changes to completed
  if (this.status === 'completed' && !this.processed_at) {
    this.processed_at = new Date();
  }

  // Clear processed_at if status is not completed
  if (this.status !== 'completed' && this.processed_at) {
    (this as any).processed_at = null;
  }

  next();
});

// Instance method to check if transaction can be processed
transactionSchema.methods.canBeProcessed = function(this: ITransaction): boolean {
  return ['pending', 'processing'].includes(this.status);
};

// Instance method to check if transaction can be refunded
transactionSchema.methods.canBeRefunded = function(this: ITransaction): boolean {
  return this.status === 'completed' && this.type === 'payment';
};

// Instance method to get public transaction data
transactionSchema.methods.toPublicJSON = function(this: ITransaction) {
  const transaction = this.toObject();
  return {
    id: transaction._id,
    transaction_number: transaction.transaction_number,
    order_id: transaction.order_id,
    service_request_id: transaction.service_request_id,
    payer_id: transaction.payer_id,
    payee_id: transaction.payee_id,
    amount: transaction.amount,
    currency: transaction.currency,
    type: transaction.type,
    status: transaction.status,
    payment_method: transaction.payment_method,
    reference_number: transaction.reference_number,
    description: transaction.description,
    fees: transaction.fees,
    net_amount: transaction.net_amount,
    processed_at: transaction.processed_at,
    created_at: transaction.created_at,
    updated_at: transaction.updated_at,
  };
};

// Static method to find transactions by payer
transactionSchema.statics.findByPayer = function(this: Model<ITransaction>, payerId: string) {
  return this.find({ payer_id: payerId }).sort({ created_at: -1 });
};

// Static method to find transactions by payee
transactionSchema.statics.findByPayee = function(this: Model<ITransaction>, payeeId: string) {
  return this.find({ payee_id: payeeId }).sort({ created_at: -1 });
};

// Static method to find transactions by order
transactionSchema.statics.findByOrder = function(this: Model<ITransaction>, orderId: string) {
  return this.find({ order_id: orderId }).sort({ created_at: -1 });
};

// Static method to find recent transactions
transactionSchema.statics.findRecent = function(this: Model<ITransaction>, days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.find({ 
    created_at: { $gte: startDate } 
  }).sort({ created_at: -1 });
};

// Static method to get transaction summary
transactionSchema.statics.getTransactionSummary = function(
  this: Model<ITransaction>,
  startDate: Date,
  endDate: Date
) {
  return this.aggregate([
    {
      $match: {
        created_at: { $gte: startDate, $lte: endDate },
        status: 'completed'
      }
    },
    {
      $group: {
        _id: null,
        totalTransactions: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        totalFees: { $sum: '$fees' },
        netAmount: { $sum: '$net_amount' },
        typeBreakdown: {
          $push: {
            type: '$type',
            amount: '$amount',
            fees: '$fees'
          }
        },
        statusBreakdown: {
          $push: '$status'
        },
        paymentMethodBreakdown: {
          $push: {
            method: '$payment_method',
            amount: '$amount'
          }
        }
      }
    }
  ]);
};

// Static method for advanced search
transactionSchema.statics.searchTransactions = function(
  this: Model<ITransaction>,
  query: string,
  options: { 
    type?: TransactionType; 
    status?: TransactionStatus;
    payment_method?: PaymentMethod;
    limit?: number 
  } = {}
) {
  const filter: any = {
    $and: [
      {
        $or: [
          { $text: { $search: query } },
          { transaction_number: { $regex: query, $options: 'i' } },
          { reference_number: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
        ]
      }
    ]
  };

  if (options.type) {
    filter.$and.push({ type: options.type });
  }

  if (options.status) {
    filter.$and.push({ status: options.status });
  }

  if (options.payment_method) {
    filter.$and.push({ payment_method: options.payment_method });
  }

  return this.find(filter)
    .limit(options.limit || 20)
    .sort({ _id: { $meta: 'textScore' }, created_at: -1 });
};

// Virtual for transaction age in days
transactionSchema.virtual('ageInDays').get(function(this: ITransaction) {
  const now = new Date();
  const createdAt = this.created_at;
  const diffTime = Math.abs(now.getTime() - createdAt.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for transaction status description
transactionSchema.virtual('statusDescription').get(function(this: ITransaction) {
  const statusMap = {
    pending: 'Awaiting Processing',
    processing: 'Being Processed',
    completed: 'Successfully Completed',
    failed: 'Processing Failed',
    cancelled: 'Transaction Cancelled'
  };
  return statusMap[this.status] || 'Unknown Status';
});

// Virtual for payment method description
transactionSchema.virtual('paymentMethodDescription').get(function(this: ITransaction) {
  const methodMap = {
    cash: 'Cash Payment',
    mobile_money: 'Mobile Money Transfer',
    bank_transfer: 'Bank Transfer',
    credit_card: 'Credit Card Payment',
    debit_card: 'Debit Card Payment',
    check: 'Check Payment'
  };
  return methodMap[this.payment_method] || 'Other Payment Method';
});

// Ensure virtual fields are included in JSON output
transactionSchema.set('toJSON', { virtuals: true });
transactionSchema.set('toObject', { virtuals: true });

// Export the model
export const Transaction: Model<ITransaction> = mongoose.model<ITransaction>('Transaction', transactionSchema);
export default Transaction;