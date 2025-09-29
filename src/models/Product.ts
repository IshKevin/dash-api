import mongoose, { Schema, Model } from 'mongoose';
import { IProduct, ProductCategory, ProductStatus } from '../types/product';

// Product Schema
const productSchema = new Schema<IProduct>({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    minlength: [2, 'Product name must be at least 2 characters long'],
    maxlength: [200, 'Product name cannot exceed 200 characters'],
    index: true,
  },
  category: {
    type: String,
    enum: {
      values: [
        'irrigation',
        'harvesting', 
        'containers', 
        'pest-management'
      ] as ProductCategory[],
      message: 'Category must be a valid product category'
    },
    required: [true, 'Product category is required'],
    index: true,
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters'],
  },
  price: {
    type: Number,
    required: [true, 'Product price is required'],
    min: [0, 'Price must be a positive number'],
    validate: {
      validator: function(v: number) {
        return Number.isFinite(v) && v >= 0;
      },
      message: 'Price must be a valid positive number'
    },
    index: true,
  },
  quantity: {
    type: Number,
    required: [true, 'Product quantity is required'],
    min: [0, 'Quantity cannot be negative'],
    default: 0,
    validate: {
      validator: function(v: number) {
        return Number.isInteger(v) && v >= 0;
      },
      message: 'Quantity must be a non-negative integer'
    },
    index: true,
  },
  unit: {
    type: String,
    required: [true, 'Unit of measurement is required'],
    trim: true,
    enum: {
      values: ['kg', 'g', 'lb', 'oz', 'ton', 'liter', 'ml', 'gallon', 'piece', 'dozen', 'box', 'bag', 'bottle', 'can', 'packet'],
      message: 'Unit must be a valid measurement unit'
    },
  },
  supplier_id: {
    type: String,
    required: [true, 'Supplier ID is required'],
    trim: true,
    index: true,
  },
  status: {
    type: String,
    enum: {
      values: ['available', 'out_of_stock', 'discontinued'] as ProductStatus[],
      message: 'Status must be available, out_of_stock, or discontinued'
    },
    default: 'available' as ProductStatus,
    index: true,
  },
  harvest_date: {
    type: Date,
    validate: {
      validator: function(v: Date) {
        return !v || v <= new Date();
      },
      message: 'Harvest date cannot be in the future'
    },
  },
  expiry_date: {
    type: Date,
    validate: {
      validator: function(v: Date) {
        return !v || v > new Date();
      },
      message: 'Expiry date must be in the future'
    },
  },
  sku: {
    type: String,
    trim: true,
    unique: true,
    sparse: true, // Allow multiple null values but unique non-null values
    index: true,
  },
  brand: {
    type: String,
    trim: true,
    maxlength: [100, 'Brand name cannot exceed 100 characters'],
  },
  images: [{
    type: String,
    trim: true,
    validate: {
      validator: function(v: string) {
        return /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/.test(v);
      },
      message: 'Image must be a valid URL'
    },
  }],
  specifications: {
    type: Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  versionKey: false,
});

// Compound indexes for better query performance
productSchema.index({ category: 1, status: 1 });
productSchema.index({ supplier_id: 1, status: 1 });
productSchema.index({ price: 1, category: 1 });
productSchema.index({ name: 'text', description: 'text' }); // Text search index
productSchema.index({ created_at: -1 });
productSchema.index({ quantity: 1, status: 1 }); // For low stock queries

// Pre-save middleware to update status based on quantity
productSchema.pre('save', function(this: IProduct, next) {
  // Auto-update status based on quantity
  if (this.quantity <= 0 && this.status === 'available') {
    this.status = 'out_of_stock';
  } else if (this.quantity > 0 && this.status === 'out_of_stock') {
    this.status = 'available';
  }

  // Generate SKU if not provided
  if (!this.sku) {
    const categoryCode = this.category.substring(0, 3).toUpperCase();
    const nameCode = this.name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '');
    const timestamp = Date.now().toString().slice(-6);
    this.sku = `${categoryCode}-${nameCode}-${timestamp}`;
  }

  next();
});

// Instance method to check if product is in stock
productSchema.methods.isInStock = function(this: IProduct): boolean {
  return this.quantity > 0 && this.status === 'available';
};

// Instance method to check if product is low stock
productSchema.methods.isLowStock = function(this: IProduct, threshold: number = 10): boolean {
  return this.quantity <= threshold && this.quantity > 0;
};

// Instance method to update stock
productSchema.methods.updateStock = function(
  this: IProduct, 
  operation: 'add' | 'subtract' | 'set', 
  amount: number
): void {
  switch (operation) {
    case 'add':
      this.quantity += amount;
      break;
    case 'subtract':
      this.quantity = Math.max(0, this.quantity - amount);
      break;
    case 'set':
      this.quantity = Math.max(0, amount);
      break;
  }
};

// Instance method to get public product data
productSchema.methods.toPublicJSON = function(this: IProduct) {
  const product = this.toObject();
  return {
    id: product._id,
    name: product.name,
    category: product.category,
    description: product.description,
    price: product.price,
    quantity: product.quantity,
    unit: product.unit,
    supplier_id: product.supplier_id,
    status: product.status,
    harvest_date: product.harvest_date,
    expiry_date: product.expiry_date,
    sku: product.sku,
    brand: product.brand,
    images: product.images,
    specifications: product.specifications,
    created_at: product.created_at,
    updated_at: product.updated_at,
  };
};

// Static method to find products by category
productSchema.statics.findByCategory = function(this: Model<IProduct>, category: ProductCategory) {
  return this.find({ category, status: { $ne: 'discontinued' } });
};

// Static method to find available products
productSchema.statics.findAvailable = function(this: Model<IProduct>) {
  return this.find({ status: 'available', quantity: { $gt: 0 } });
};

// Static method to find low stock products
productSchema.statics.findLowStock = function(this: Model<IProduct>, threshold: number = 10) {
  return this.find({ 
    quantity: { $lte: threshold, $gt: 0 }, 
    status: 'available' 
  });
};

// Static method to find out of stock products
productSchema.statics.findOutOfStock = function(this: Model<IProduct>) {
  return this.find({ 
    $or: [
      { quantity: 0 },
      { status: 'out_of_stock' }
    ]
  });
};

// Static method for product search
productSchema.statics.searchProducts = function(
  this: Model<IProduct>,
  query: string,
  options: { category?: ProductCategory; limit?: number } = {}
) {
  const filter: any = {
    $and: [
      {
        $or: [
          { $text: { $search: query } },
          { name: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
          { brand: { $regex: query, $options: 'i' } },
        ]
      },
      { status: { $ne: 'discontinued' } }
    ]
  };

  if (options.category) {
    filter.$and.push({ category: options.category });
  }

  return this.find(filter)
    .limit(options.limit || 20)
    .sort({ _id: { $meta: 'textScore' }, created_at: -1 });
};

// Static method to get products by supplier
productSchema.statics.findBySupplier = function(this: Model<IProduct>, supplierId: string) {
  return this.find({ supplier_id: supplierId, status: { $ne: 'discontinued' } });
};

// Virtual for product value (price * quantity)
productSchema.virtual('totalValue').get(function(this: IProduct) {
  return this.price * this.quantity;
});

// Virtual for stock status description
productSchema.virtual('stockStatus').get(function(this: IProduct) {
  if (this.quantity === 0) return 'Out of Stock';
  if (this.quantity <= 10) return 'Low Stock';
  return 'In Stock';
});

// Ensure virtual fields are included in JSON output
productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

// Export the model
export const Product: Model<IProduct> = mongoose.model<IProduct>('Product', productSchema);
export default Product;