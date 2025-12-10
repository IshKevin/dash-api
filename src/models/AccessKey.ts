import mongoose, { Schema, Model, Document } from 'mongoose';

export interface IAccessKey extends Document {
  _id: string;
  user_id: mongoose.Types.ObjectId;
  access_key: string;
  is_used: boolean;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

const accessKeySchema = new Schema<IAccessKey>({
  user_id: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  access_key: {
    type: String,
    required: [true, 'Access key is required'],
    unique: true,
    index: true
  },
  is_used: {
    type: Boolean,
    default: false,
    index: true
  },
  expires_at: {
    type: Date,
    required: [true, 'Expiration date is required'],
    index: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: false
});

// Index for cleanup of expired keys
accessKeySchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

// Compound index for efficient queries
accessKeySchema.index({ access_key: 1, is_used: 1, expires_at: 1 });

export const AccessKey: Model<IAccessKey> = mongoose.model<IAccessKey>('AccessKey', accessKeySchema);
export default AccessKey;