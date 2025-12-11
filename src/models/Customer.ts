import mongoose, { Schema, Model } from 'mongoose';

export interface ICustomer extends mongoose.Document {
  _id: string;
  name: string;
  email: string;
  phone: string;
  address?: string;
  shop_id?: string;
  status: 'active' | 'inactive';
  total_orders: number;
  total_spent: number;
  last_order_date?: Date;
  created_at: Date;
  updated_at: Date;
  
  // Instance methods
  updateOrderStats(orderAmount: number): void;
  getAverageOrderValue(): number;
}

const customerSchema = new Schema<ICustomer>({
  name: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters long'],
    maxlength: [100, 'Name cannot exceed 100 characters'],
    index: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    match: [
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      'Please provide a valid email address'
    ],
    index: true,
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    match: [
      /^[+]?[\d\s\-\(\)]{10,15}$/,
      'Please provide a valid phone number'
    ],
  },
  address: {
    type: String,
    trim: true,
    maxlength: [500, 'Address cannot exceed 500 characters'],
  },
  shop_id: {
    type: Schema.Types.ObjectId,
    ref: 'Shop',
    index: true,
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
    index: true,
  },
  total_orders: {
    type: Number,
    default: 0,
    min: [0, 'Total orders cannot be negative'],
  },
  total_spent: {
    type: Number,
    default: 0,
    min: [0, 'Total spent cannot be negative'],
  },
  last_order_date: {
    type: Date,
  },
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  versionKey: false,
});

// Indexes for better query performance
customerSchema.index({ shop_id: 1, status: 1 });
customerSchema.index({ total_spent: -1 });
customerSchema.index({ last_order_date: -1 });
customerSchema.index({ created_at: -1 });

// Text search index
customerSchema.index({ 
  name: 'text', 
  email: 'text',
  phone: 'text'
});

// Instance methods
customerSchema.methods.updateOrderStats = function(orderAmount: number): void {
  this.total_orders += 1;
  this.total_spent += orderAmount;
  this.last_order_date = new Date();
};

customerSchema.methods.getAverageOrderValue = function(): number {
  return this.total_orders > 0 ? this.total_spent / this.total_orders : 0;
};

// Static methods
customerSchema.statics.findByShop = function(this: Model<ICustomer>, shopId: string) {
  return this.find({ shop_id: shopId, status: 'active' });
};

customerSchema.statics.findTopCustomers = function(this: Model<ICustomer>, limit: number = 10) {
  return this.find({ status: 'active' })
    .sort({ total_spent: -1 })
    .limit(limit);
};

export const Customer: Model<ICustomer> = mongoose.model<ICustomer>('Customer', customerSchema);
export default Customer;