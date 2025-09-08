import mongoose, { Schema, Model } from 'mongoose';
import { 
  ISupplier, 
  ISupplierAddress, 
  IBankDetails,
  SupplierStatus, 
  SupplierCategory 
} from '../types/supplier';

// Supplier Address Schema
const supplierAddressSchema = new Schema<ISupplierAddress>({
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
    default: 'Rwanda',
  },
}, {
  _id: false,
});

// Bank Details Schema
const bankDetailsSchema = new Schema<IBankDetails>({
  bank_name: {
    type: String,
    required: [true, 'Bank name is required'],
    trim: true,
  },
  account_name: {
    type: String,
    required: [true, 'Account name is required'],
    trim: true,
  },
  account_number: {
    type: String,
    required: [true, 'Account number is required'],
    trim: true,
  },
  routing_number: {
    type: String,
    trim: true,
  },
  swift_code: {
    type: String,
    trim: true,
  },
}, {
  _id: false,
});

// Main Supplier Schema
const supplierSchema = new Schema<ISupplier>({
  name: {
    type: String,
    required: [true, 'Supplier name is required'],
    trim: true,
    minlength: [2, 'Supplier name must be at least 2 characters long'],
    maxlength: [200, 'Supplier name cannot exceed 200 characters'],
    index: true,
  },
  category: {
    type: String,
    enum: {
      values: [
        'seeds_supplier',
        'fertilizer_supplier', 
        'equipment_supplier',
        'produce_buyer',
        'input_distributor',
        'logistics_provider',
        'financial_services',
        'other'
      ] as SupplierCategory[],
      message: 'Category must be a valid supplier category'
    },
    required: [true, 'Supplier category is required'],
    index: true,
  },
  contact_person: {
    type: String,
    required: [true, 'Contact person is required'],
    trim: true,
    minlength: [2, 'Contact person name must be at least 2 characters long'],
    maxlength: [100, 'Contact person name cannot exceed 100 characters'],
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
  website: {
    type: String,
    trim: true,
    match: [
      /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/,
      'Please provide a valid website URL'
    ],
  },
  address: {
    type: supplierAddressSchema,
    required: [true, 'Supplier address is required'],
  },
  business_license: {
    type: String,
    trim: true,
  },
  tax_id: {
    type: String,
    trim: true,
  },
  bank_details: {
    type: bankDetailsSchema,
  },
  status: {
    type: String,
    enum: {
      values: ['active', 'inactive', 'pending_approval', 'suspended'] as SupplierStatus[],
      message: 'Status must be active, inactive, pending_approval, or suspended'
    },
    default: 'pending_approval' as SupplierStatus,
    index: true,
  },
  rating: {
    type: Number,
    default: 0,
    min: [0, 'Rating must be between 0 and 5'],
    max: [5, 'Rating must be between 0 and 5'],
    index: true,
  },
  total_orders: {
    type: Number,
    default: 0,
    min: [0, 'Total orders cannot be negative'],
  },
  products_supplied: [{
    type: String,
    trim: true,
  }],
  services_offered: [{
    type: String,
    trim: true,
  }],
  delivery_areas: [{
    type: String,
    trim: true,
  }],
  payment_terms: {
    type: String,
    trim: true,
    maxlength: [500, 'Payment terms cannot exceed 500 characters'],
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot exceed 1000 characters'],
  },
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  versionKey: false,
});

// Compound indexes for better query performance
supplierSchema.index({ category: 1, status: 1 });
supplierSchema.index({ 'address.province': 1, 'address.city': 1 });
supplierSchema.index({ rating: -1, total_orders: -1 });
supplierSchema.index({ created_at: -1 });

// Text search index
supplierSchema.index({ 
  name: 'text', 
  contact_person: 'text',
  'address.city': 'text',
  'address.province': 'text'
});

// Pre-save middleware
supplierSchema.pre('save', function(this: ISupplier, next) {
  // Ensure rating is between 0 and 5
  this.rating = Math.max(0, Math.min(5, this.rating));
  
  // Ensure total_orders is not negative
  this.total_orders = Math.max(0, this.total_orders);
  
  next();
});

// Instance method to update rating
supplierSchema.methods.updateRating = function(this: ISupplier, newRating: number): void {
  if (newRating < 0 || newRating > 5) {
    throw new Error('Rating must be between 0 and 5');
  }
  
  // Simple average calculation - in a real system, you'd want to store ratings separately
  this.rating = (this.rating + newRating) / 2;
};

// Instance method to increment total orders
supplierSchema.methods.incrementOrders = function(this: ISupplier, count: number = 1): void {
  this.total_orders = Math.max(0, this.total_orders + count);
};

// Instance method to check if supplier is active
supplierSchema.methods.isActive = function(this: ISupplier): boolean {
  return this.status === 'active';
};

// Instance method to get public supplier data
supplierSchema.methods.toPublicJSON = function(this: ISupplier) {
  const supplier = this.toObject();
  return {
    id: supplier._id,
    name: supplier.name,
    category: supplier.category,
    contact_person: supplier.contact_person,
    email: supplier.email,
    phone: supplier.phone,
    website: supplier.website,
    address: supplier.address,
    business_license: supplier.business_license,
    tax_id: supplier.tax_id,
    bank_details: supplier.bank_details,
    status: supplier.status,
    rating: supplier.rating,
    total_orders: supplier.total_orders,
    products_supplied: supplier.products_supplied,
    services_offered: supplier.services_offered,
    delivery_areas: supplier.delivery_areas,
    payment_terms: supplier.payment_terms,
    notes: supplier.notes,
    created_at: supplier.created_at,
    updated_at: supplier.updated_at,
  };
};

// Static method to find suppliers by category
supplierSchema.statics.findByCategory = function(this: Model<ISupplier>, category: SupplierCategory) {
  return this.find({ category, status: 'active' });
};

// Static method to find active suppliers
supplierSchema.statics.findActive = function(this: Model<ISupplier>) {
  return this.find({ status: 'active' });
};

// Static method to find top rated suppliers
supplierSchema.statics.findTopRated = function(this: Model<ISupplier>, limit: number = 10) {
  return this.find({ status: 'active' })
    .sort({ rating: -1, total_orders: -1 })
    .limit(limit);
};

// Static method for advanced search
supplierSchema.statics.searchSuppliers = function(
  this: Model<ISupplier>,
  query: string,
  options: { 
    category?: SupplierCategory; 
    province?: string;
    limit?: number 
  } = {}
) {
  const filter: any = {
    $and: [
      {
        $or: [
          { $text: { $search: query } },
          { name: { $regex: query, $options: 'i' } },
          { contact_person: { $regex: query, $options: 'i' } },
        ]
      },
      { status: 'active' }
    ]
  };

  if (options.category) {
    filter.$and.push({ category: options.category });
  }

  if (options.province) {
    filter.$and.push({ 'address.province': options.province });
  }

  return this.find(filter)
    .limit(options.limit || 20)
    .sort({ _id: { $meta: 'textScore' }, rating: -1 });
};

// Virtual for supplier rating description
supplierSchema.virtual('ratingDescription').get(function(this: ISupplier) {
  if (this.rating >= 4.5) return 'Excellent';
  if (this.rating >= 4.0) return 'Very Good';
  if (this.rating >= 3.0) return 'Good';
  if (this.rating >= 2.0) return 'Fair';
  return 'Poor';
});

// Virtual for full address
supplierSchema.virtual('fullAddress').get(function(this: ISupplier) {
  const addr = this.address;
  return `${addr.street_address}, ${addr.city}, ${addr.province}${addr.postal_code ? `, ${addr.postal_code}` : ''}, ${addr.country}`;
});

// Ensure virtual fields are included in JSON output
supplierSchema.set('toJSON', { virtuals: true });
supplierSchema.set('toObject', { virtuals: true });

// Export the model
export const Supplier: Model<ISupplier> = mongoose.model<ISupplier>('Supplier', supplierSchema);
export default Supplier;