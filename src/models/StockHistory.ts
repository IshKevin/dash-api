import mongoose, { Schema, Document } from 'mongoose';

export interface IStockHistory extends Document {
    product_id: string;
    shop_id?: string; // Optional, if linked to a specific shop context
    previous_quantity: number;
    new_quantity: number;
    change_amount: number;
    reason: 'restock' | 'sale' | 'adjustment' | 'damage' | 'return' | 'other';
    notes?: string;
    created_by?: string; // User ID
    created_at: Date;
}

const StockHistorySchema: Schema = new Schema({
    product_id: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
        index: true
    },
    shop_id: {
        type: String, // Can be Shop ID or Supplier ID
        index: true
    },
    previous_quantity: {
        type: Number,
        required: true
    },
    new_quantity: {
        type: Number,
        required: true
    },
    change_amount: {
        type: Number,
        required: true
    },
    reason: {
        type: String,
        enum: ['restock', 'sale', 'adjustment', 'damage', 'return', 'other'],
        required: true
    },
    notes: {
        type: String,
        trim: true
    },
    created_by: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    created_at: {
        type: Date,
        default: Date.now,
        index: true
    }
});

export const StockHistory = mongoose.model<IStockHistory>('StockHistory', StockHistorySchema);
export default StockHistory;
