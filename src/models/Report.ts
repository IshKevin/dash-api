import mongoose, { Schema, Model } from 'mongoose';

export interface IReportLocation {
  lat: number;
  lng: number;
  address: string;
}

export interface IReport extends mongoose.Document {
  _id: string;
  title: string;
  description: string;
  report_type: 'inspection' | 'audit' | 'assessment' | 'survey' | 'other';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  agent_id: string;
  farmer_id?: string;
  scheduled_date: Date;
  completed_date?: Date;
  location: IReportLocation;
  attachments: string[];
  findings?: string;
  recommendations?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

const reportLocationSchema = new Schema<IReportLocation>({
  lat: {
    type: Number,
    required: [true, 'Latitude is required'],
    min: [-90, 'Latitude must be between -90 and 90'],
    max: [90, 'Latitude must be between -90 and 90'],
  },
  lng: {
    type: Number,
    required: [true, 'Longitude is required'],
    min: [-180, 'Longitude must be between -180 and 180'],
    max: [180, 'Longitude must be between -180 and 180'],
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true,
    maxlength: [500, 'Address cannot exceed 500 characters'],
  },
}, {
  _id: false,
});

const reportSchema = new Schema<IReport>({
  title: {
    type: String,
    required: [true, 'Report title is required'],
    trim: true,
    minlength: [5, 'Title must be at least 5 characters long'],
    maxlength: [200, 'Title cannot exceed 200 characters'],
    index: true,
  },
  description: {
    type: String,
    required: [true, 'Report description is required'],
    trim: true,
    minlength: [10, 'Description must be at least 10 characters long'],
    maxlength: [2000, 'Description cannot exceed 2000 characters'],
  },
  report_type: {
    type: String,
    enum: ['inspection', 'audit', 'assessment', 'survey', 'other'],
    required: [true, 'Report type is required'],
    index: true,
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'cancelled'],
    default: 'pending',
    index: true,
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
    index: true,
  },
  agent_id: {
    type: String,
    required: [true, 'Agent ID is required'],
    index: true,
  },
  farmer_id: {
    type: String,
    index: true,
  },
  scheduled_date: {
    type: Date,
    required: [true, 'Scheduled date is required'],
    index: true,
  },
  completed_date: {
    type: Date,
  },
  location: {
    type: reportLocationSchema,
    required: [true, 'Location is required'],
  },
  attachments: [{
    type: String,
    trim: true,
  }],
  findings: {
    type: String,
    trim: true,
    maxlength: [5000, 'Findings cannot exceed 5000 characters'],
  },
  recommendations: {
    type: String,
    trim: true,
    maxlength: [5000, 'Recommendations cannot exceed 5000 characters'],
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [2000, 'Notes cannot exceed 2000 characters'],
  },
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  versionKey: false,
});

// Indexes for better query performance
reportSchema.index({ agent_id: 1, status: 1 });
reportSchema.index({ farmer_id: 1, status: 1 });
reportSchema.index({ report_type: 1, priority: 1 });
reportSchema.index({ scheduled_date: 1 });
reportSchema.index({ created_at: -1 });

// Text search index
reportSchema.index({ 
  title: 'text', 
  description: 'text',
  findings: 'text',
  recommendations: 'text'
});

// Instance methods
reportSchema.methods.markCompleted = function(this: IReport): void {
  this.status = 'completed';
  this.completed_date = new Date();
};

reportSchema.methods.isOverdue = function(this: IReport): boolean {
  return this.status !== 'completed' && this.scheduled_date < new Date();
};

// Static methods
reportSchema.statics.findByAgent = function(agentId: string) {
  return this.find({ agent_id: agentId });
};

reportSchema.statics.findOverdue = function() {
  return this.find({
    status: { $nin: ['completed', 'cancelled'] },
    scheduled_date: { $lt: new Date() }
  });
};

reportSchema.statics.getStatistics = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        total_reports: { $sum: 1 },
        completed_reports: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        pending_reports: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        },
        overdue_reports: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ['$status', 'completed'] },
                  { $ne: ['$status', 'cancelled'] },
                  { $lt: ['$scheduled_date', new Date()] }
                ]
              },
              1,
              0
            ]
          }
        }
      }
    }
  ]);

  const typeStats = await this.aggregate([
    {
      $group: {
        _id: '$report_type',
        count: { $sum: 1 }
      }
    }
  ]);

  return {
    ...stats[0],
    reports_by_type: typeStats.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {})
  };
};

// Define the model interface with static methods
interface IReportModel extends Model<IReport> {
  getStatistics(): Promise<any>;
}

export const Report: IReportModel = mongoose.model<IReport, IReportModel>('Report', reportSchema);
export default Report;