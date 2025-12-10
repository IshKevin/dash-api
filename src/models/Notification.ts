import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
    recipient_id: string; // User ID
    type: 'info' | 'success' | 'warning' | 'error' | 'order' | 'system';
    title: string;
    message: string;
    related_entity_id?: string; // e.g., Order ID, ServiceRequest ID
    related_entity_type?: 'order' | 'service_request' | 'product' | 'system';
    is_read: boolean;
    created_at: Date;
}

const NotificationSchema: Schema = new Schema({
    recipient_id: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['info', 'success', 'warning', 'error', 'order', 'system'],
        default: 'info'
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    related_entity_id: {
        type: String,
        trim: true
    },
    related_entity_type: {
        type: String,
        enum: ['order', 'service_request', 'product', 'system']
    },
    is_read: {
        type: Boolean,
        default: false,
        index: true
    },
    created_at: {
        type: Date,
        default: Date.now,
        index: true // For sorting
    }
});

// Method to public JSON
NotificationSchema.methods.toPublicJSON = function () {
    const notification = this.toObject();
    return {
        id: notification._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        related_entity_id: notification.related_entity_id,
        related_entity_type: notification.related_entity_type,
        is_read: notification.is_read,
        created_at: notification.created_at
    };
};

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
export default Notification;
