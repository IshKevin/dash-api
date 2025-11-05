import { Schema, model, Document } from 'mongoose';

// Territory interface
export interface ITerritory {
  district: string;
  sector: string;
  isPrimary: boolean;
  assignedDate: Date;
}

// Territory Coverage interface
export interface ITerritoryCoverage {
  totalDistricts: number;
  totalSectors: number;
  districts: string[];
}

// Statistics interface
export interface IStatistics {
  farmersAssisted: number;
  totalTransactions: number;
  performance: string;
  activeFarmers: number;
  territoryUtilization: string;
}

export interface IAgentProfile extends Document {
  user_id: string;
  
  // Agent Information
  agentId: string;
  province?: string;
  territory?: ITerritory[];
  
  // Legacy fields (kept for backward compatibility)
  district?: string;
  sector?: string;
  cell?: string;
  village?: string;
  
  specialization?: string;
  experience?: string;
  certification?: string;
  
  // Statistics
  statistics?: IStatistics;
  
  // Legacy stats fields (kept for backward compatibility)
  farmersAssisted?: number;
  totalTransactions?: number;
  performance?: string;
  
  profileImage?: string;
  
  created_at: Date;
  updated_at: Date;
}

const agentProfileSchema = new Schema<IAgentProfile>({
  user_id: {
    type: String,
    required: true,
    unique: true,
    ref: 'User'
  },
  
  // Agent Information
  agentId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  province: { type: String, trim: true },
  
  // Territory array
  territory: [{
    district: { type: String, required: true, trim: true },
    sector: { type: String, required: true, trim: true },
    isPrimary: { type: Boolean, default: false },
    assignedDate: { type: Date, default: Date.now }
  }],
  
  // Legacy location fields (kept for backward compatibility)
  district: { type: String, trim: true },
  sector: { type: String, trim: true },
  cell: { type: String, trim: true },
  village: { type: String, trim: true },
  
  specialization: { type: String, trim: true },
  experience: { type: String, trim: true },
  certification: { type: String, trim: true },
  
  // Statistics object
  statistics: {
    farmersAssisted: { type: Number, min: 0, default: 0 },
    totalTransactions: { type: Number, min: 0, default: 0 },
    performance: { type: String, trim: true },
    activeFarmers: { type: Number, min: 0, default: 0 },
    territoryUtilization: { type: String, trim: true }
  },
  
  // Legacy stats fields (kept for backward compatibility)
  farmersAssisted: { type: Number, min: 0, default: 0 },
  totalTransactions: { type: Number, min: 0, default: 0 },
  performance: { type: String, trim: true },
  
  profileImage: { type: String, trim: true }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes
agentProfileSchema.index({ user_id: 1 });
agentProfileSchema.index({ agentId: 1 });
agentProfileSchema.index({ district: 1 });
agentProfileSchema.index({ province: 1 });

// Static method to generate next agent ID
agentProfileSchema.statics.getNextAgentId = async function(): Promise<string> {
  const lastAgent = await this.findOne({}, { agentId: 1 })
    .sort({ agentId: -1 })
    .limit(1);
  
  if (!lastAgent) {
    return 'AGT000001';
  }
  
  // Extract number from AGT000001 format
  const lastNumber = parseInt(lastAgent.agentId.replace('AGT', ''), 10);
  const nextNumber = lastNumber + 1;
  
  // Pad with zeros to maintain 6 digits
  return `AGT${nextNumber.toString().padStart(6, '0')}`;
};

export default model<IAgentProfile>('AgentProfile', agentProfileSchema);
