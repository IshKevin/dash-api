import mongoose, { Schema, Document } from 'mongoose';

export interface IShop extends Document {
  id: number;
  shopName: string;
  description: string;
  province: string;
  district: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ShopSchema: Schema = new Schema(
  {
    id: {
      type: Number,
      required: true,
      unique: true
    },
    shopName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 200
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },
    province: {
      type: String,
      required: true,
      trim: true
    },
    district: {
      type: String,
      required: true,
      trim: true
    },
    ownerName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2
    },
    ownerEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    ownerPhone: {
      type: String,
      required: true,
      trim: true
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true // Automatically adds createdAt and updatedAt
  }
);

// Method to get the next shop ID
ShopSchema.statics.getNextId = async function(): Promise<number> {
  const lastShop = await this.findOne().sort({ id: -1 }).limit(1);
  return lastShop ? lastShop.id + 1 : 1;
};

const Shop = mongoose.model<IShop>('Shop', ShopSchema);

export default Shop;
