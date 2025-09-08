import mongoose, { Schema, Model } from 'mongoose';
import { 
  IOrder, 
  IOrderItem, 
  IShippingAddress as IAddress, 
  OrderStatus, 
  PaymentStatus,
  PaymentMethod
} from '../types/order';

// Address Schema
const addressSchema = new Schema<IAddress>({
  full_name: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
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
  postal_code: {
    type: String,
    trim: true,
  },
  country: {
    type: String,
    required: [true, 'Country is required'],
    trim: true,
  },
}, {
  _id: false,
});

// Order Item Schema
const orderItemSchema = new Schema<IOrderItem>({
  product_id: {
    type: String,
    required: [true, 'Product ID is required'],
    trim: true,
  },
  product_name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
  },
  unit_price: {
    type: Number,
    required: [true, 'Unit price is required'],
    min: [0, 'Unit price must be non-negative'],
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [1, 'Quantity must be at least 1'],
  },
  total_price: {
    type: Number,
    required: [true, 'Total price is required'],
    min: [0, 'Total price must be non-negative'],
  },
}, {
  _id: false,
});

// Main Order Schema
const orderSchema = new Schema<IOrder>({
  order_number: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  customer_id: {
    type: String,
    required: [true, 'Customer ID is required'],
    trim: true,
    index: true,
  },
  items: {
    type: [orderItemSchema],
    required: [true, 'Order items are required'],
    validate: {
      validator: function(items: IOrderItem[]) {
        return items && items.length > 0;
      },
      message: 'Order must have at least one item'
    },
  },
  subtotal: {
    type: Number,
    required: [true, 'Subtotal is required'],
    min: [0, 'Subtotal must be non-negative'],
  },
  tax_amount: {
    type: Number,
    default: 0,
    min: [0, 'Tax amount must be non-negative'],
  },
  shipping_cost: {
    type: Number,
    default: 0,
    min: [0, 'Shipping cost must be non-negative'],
  },
  discount_amount: {
    type: Number,
    default: 0,
    min: [0, 'Discount amount must be non-negative'],
  },
  total_amount: {
    type: Number,
    required: [true, 'Total amount is required'],
    min: [0, 'Total amount must be non-negative'],
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'] as OrderStatus[],
      message: 'Status must be a valid order status'
    },
    default: 'pending' as OrderStatus,
    index: true,
  },
  payment_status: {
    type: String,
    enum: {
      values: ['pending', 'paid', 'failed', 'refunded'] as PaymentStatus[],
      message: 'Payment status must be a valid payment status'
    },
    default: 'pending' as PaymentStatus,
    index: true,
  },
  payment_method: {
    type: String,
    enum: {
      values: ['cash', 'mobile_money', 'bank_transfer', 'credit_card', 'debit_card'] as PaymentMethod[],
      message: 'Payment method must be a valid payment method'
    },
    default: 'cash' as PaymentMethod,
  },
  shipping_address: {
    type: addressSchema,
    required: [true, 'Shipping address is required'],
  },
  billing_address: {
    type: addressSchema,
  },
  order_date: {
    type: Date,
    default: Date.now,
    index: true,
  },
  expected_delivery_date: {
    type: Date,
  },
  delivered_date: {
    type: Date,
    validate: {
      validator: function(this: any, v: Date) {
        // We need to access the order_date from the document context
        const orderDate = this.get('order_date');
        return !v || !orderDate || v >= orderDate;
      },
      message: 'Delivered date cannot be before order date'
    },
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters'],
  },
  tracking_number: {
    type: String,
    trim: true,
    sparse: true,
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
orderSchema.index({ customer_id: 1, status: 1 });
orderSchema.index({ customer_id: 1, order_date: -1 });
orderSchema.index({ status: 1, payment_status: 1 });
orderSchema.index({ order_date: -1, total_amount: -1 });
orderSchema.index({ created_at: -1 });

// Pre-save middleware to generate order number and calculate totals
orderSchema.pre('save', function(this: IOrder, next) {
  // Generate order number if not provided
  if (!this.order_number) {
    const timestamp = Date.now().toString();
    const randomSuffix = Math.random().toString(36).substring(2, 5).toUpperCase();
    this.order_number = `ORD-${timestamp}-${randomSuffix}`;
  }

  // Calculate subtotal from items
  this.subtotal = this.items.reduce((sum, item) => sum + item.total_price, 0);

  // Calculate total amount
  this.total_amount = this.subtotal + this.tax_amount + this.shipping_cost - this.discount_amount;

  // Ensure total amount is not negative
  this.total_amount = Math.max(0, this.total_amount);

  // Copy shipping address to billing address if not provided
  if (!this.billing_address) {
    this.billing_address = { ...this.shipping_address };
  }

  next();
});

// Pre-save middleware for item validation
orderSchema.pre('save', function(this: IOrder, next) {
  // Validate and calculate item totals
  for (const item of this.items) {
    if (item.unit_price < 0) {
      return next(new Error('Unit price cannot be negative'));
    }
    if (item.quantity <= 0) {
      return next(new Error('Quantity must be positive'));
    }
    // Recalculate total price for each item
    item.total_price = item.unit_price * item.quantity;
  }
  next();
});

// Instance method to calculate order summary
orderSchema.methods.calculateSummary = function(this: IOrder) {
  const itemCount = this.items.length;
  const totalQuantity = this.items.reduce((sum, item) => sum + item.quantity, 0);
  
  return {
    itemCount,
    totalQuantity,
    subtotal: this.subtotal,
    tax_amount: this.tax_amount,
    shipping_cost: this.shipping_cost,
    discount_amount: this.discount_amount,
    total_amount: this.total_amount,
  };
};

// Instance method to check if order can be cancelled
orderSchema.methods.canBeCancelled = function(this: IOrder): boolean {
  return ['pending', 'confirmed'].includes(this.status);
};

// Instance method to check if order can be returned
orderSchema.methods.canBeReturned = function(this: IOrder): boolean {
  if (this.status !== 'delivered' || !this.delivered_date) {
    return false;
  }
  
  // Allow returns within 7 days of delivery
  const returnPeriod = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  const now = new Date().getTime();
  const deliveryTime = this.delivered_date.getTime();
  
  return (now - deliveryTime) <= returnPeriod;
};

// Instance method to get public order data
orderSchema.methods.toPublicJSON = function(this: IOrder) {
  const order = this.toObject();
  return {
    id: order._id,
    order_number: order.order_number,
    customer_id: order.customer_id,
    items: order.items,
    subtotal: order.subtotal,
    tax_amount: order.tax_amount,
    shipping_cost: order.shipping_cost,
    discount_amount: order.discount_amount,
    total_amount: order.total_amount,
    status: order.status,
    payment_status: order.payment_status,
    payment_method: order.payment_method,
    shipping_address: order.shipping_address,
    billing_address: order.billing_address,
    order_date: order.order_date,
    expected_delivery_date: order.expected_delivery_date,
    delivered_date: order.delivered_date,
    notes: order.notes,
    tracking_number: order.tracking_number,
    created_at: order.created_at,
    updated_at: order.updated_at,
  };
};

// Static method to find orders by customer
orderSchema.statics.findByCustomer = function(this: Model<IOrder>, customerId: string) {
  return this.find({ customer_id: customerId }).sort({ created_at: -1 });
};

// Static method to find orders by status
orderSchema.statics.findByStatus = function(this: Model<IOrder>, status: OrderStatus) {
  return this.find({ status }).sort({ created_at: -1 });
};

// Static method to find recent orders
orderSchema.statics.findRecent = function(this: Model<IOrder>, days: number = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.find({ 
    order_date: { $gte: startDate } 
  }).sort({ created_at: -1 });
};

// Static method to get order analytics
orderSchema.statics.getAnalytics = function(this: Model<IOrder>, startDate: Date, endDate: Date) {
  return this.aggregate([
    {
      $match: {
        order_date: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalRevenue: { $sum: '$total_amount' },
        averageOrderValue: { $avg: '$total_amount' },
        statusCounts: {
          $push: '$status'
        },
        paymentStatusCounts: {
          $push: '$payment_status'
        }
      }
    }
  ]);
};

// Virtual for order age in days
orderSchema.virtual('ageInDays').get(function(this: IOrder) {
  const now = new Date();
  const orderDate = this.order_date;
  const diffTime = Math.abs(now.getTime() - orderDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for delivery status
orderSchema.virtual('deliveryStatus').get(function(this: IOrder) {
  if (this.status === 'delivered') return 'Delivered';
  if (this.status === 'shipped' && this.expected_delivery_date) {
    const now = new Date();
    if (now > this.expected_delivery_date) return 'Overdue';
    return 'In Transit';
  }
  if (this.status === 'processing') return 'Processing';
  if (this.status === 'confirmed') return 'Confirmed';
  return 'Pending';
});

// Virtual for payment status description
orderSchema.virtual('paymentStatusDescription').get(function(this: IOrder) {
  const statusMap: Record<PaymentStatus, string> = {
    pending: 'Payment Pending',
    paid: 'Payment Completed',
    failed: 'Payment Failed',
    refunded: 'Payment Refunded',
    partial: 'Partial Payment'
  };
  return statusMap[this.payment_status] || 'Unknown Payment Status';
});

// Ensure virtual fields are included in JSON output
orderSchema.set('toJSON', { virtuals: true });
orderSchema.set('toObject', { virtuals: true });

// Export the model
export const Order: Model<IOrder> = mongoose.model<IOrder>('Order', orderSchema);
export default Order;