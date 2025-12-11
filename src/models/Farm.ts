import mongoose, { Schema, Model } from 'mongoose';

export interface IFarmLocation {
  province: string;
  district: string;
  sector: string;
  cell?: string;
  village?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface IHarvestWindow {
  start_date: Date;
  end_date: Date;
  variety: string;
  estimated_quantity: string;
}

export interface IFarm extends mongoose.Document {
  _id: string;
  farmName: string;
  farmerName: string;
  farmer_id: string;
  location: IFarmLocation;
  crop_type: string;
  farm_size: number; // in hectares
  tree_count: number;
  varieties: string[];
  planting_date: Date;
  expected_harvest?: Date;
  status: 'preparing' | 'planted' | 'growing' | 'producing' | 'harvesting' | 'dormant';
  organic_certified: boolean;
  irrigation_system?: string;
  soil_type?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
  
  // Instance methods
  getHarvestSchedule(): IHarvestWindow[];
  isHarvestReady(): boolean;
  getProductionStats(period?: string): any;
}

const farmLocationSchema = new Schema<IFarmLocation>({
  province: {
    type: String,
    required: [true, 'Province is required'],
    trim: true,
  },
  district: {
    type: String,
    required: [true, 'District is required'],
    trim: true,
  },
  sector: {
    type: String,
    required: [true, 'Sector is required'],
    trim: true,
  },
  cell: {
    type: String,
    trim: true,
  },
  village: {
    type: String,
    trim: true,
  },
  coordinates: {
    lat: {
      type: Number,
      min: [-90, 'Latitude must be between -90 and 90'],
      max: [90, 'Latitude must be between -90 and 90'],
    },
    lng: {
      type: Number,
      min: [-180, 'Longitude must be between -180 and 180'],
      max: [180, 'Longitude must be between -180 and 180'],
    },
  },
}, {
  _id: false,
});

const farmSchema = new Schema<IFarm>({
  farmName: {
    type: String,
    required: [true, 'Farm name is required'],
    trim: true,
    minlength: [2, 'Farm name must be at least 2 characters long'],
    maxlength: [200, 'Farm name cannot exceed 200 characters'],
    index: true,
  },
  farmerName: {
    type: String,
    required: [true, 'Farmer name is required'],
    trim: true,
    minlength: [2, 'Farmer name must be at least 2 characters long'],
    maxlength: [100, 'Farmer name cannot exceed 100 characters'],
  },
  farmer_id: {
    type: String,
    required: [true, 'Farmer ID is required'],
    index: true,
  },
  location: {
    type: farmLocationSchema,
    required: [true, 'Location is required'],
  },
  crop_type: {
    type: String,
    required: [true, 'Crop type is required'],
    trim: true,
    default: 'avocado',
    index: true,
  },
  farm_size: {
    type: Number,
    required: [true, 'Farm size is required'],
    min: [0.1, 'Farm size must be at least 0.1 hectares'],
    max: [10000, 'Farm size cannot exceed 10000 hectares'],
  },
  tree_count: {
    type: Number,
    required: [true, 'Tree count is required'],
    min: [1, 'Tree count must be at least 1'],
    max: [100000, 'Tree count cannot exceed 100000'],
  },
  varieties: [{
    type: String,
    trim: true,
    required: [true, 'At least one variety is required'],
  }],
  planting_date: {
    type: Date,
    required: [true, 'Planting date is required'],
  },
  expected_harvest: {
    type: Date,
  },
  status: {
    type: String,
    enum: ['preparing', 'planted', 'growing', 'producing', 'harvesting', 'dormant'],
    default: 'planted',
    index: true,
  },
  organic_certified: {
    type: Boolean,
    default: false,
    index: true,
  },
  irrigation_system: {
    type: String,
    trim: true,
  },
  soil_type: {
    type: String,
    trim: true,
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
farmSchema.index({ farmer_id: 1, status: 1 });
farmSchema.index({ crop_type: 1, status: 1 });
farmSchema.index({ 'location.province': 1, 'location.district': 1 });
farmSchema.index({ organic_certified: 1 });
farmSchema.index({ expected_harvest: 1 });
farmSchema.index({ created_at: -1 });

// Text search index
farmSchema.index({ 
  farmName: 'text', 
  farmerName: 'text',
  'location.district': 'text',
  'location.sector': 'text'
});

// Instance methods
farmSchema.methods.getHarvestSchedule = function(): IHarvestWindow[] {
  // Simple calculation - in reality this would be more complex
  const harvestWindows: IHarvestWindow[] = [];
  
  if (this.expected_harvest) {
    this.varieties.forEach((variety: string, index: number) => {
      const startDate = new Date(this.expected_harvest!);
      startDate.setDate(startDate.getDate() + (index * 7)); // Stagger by week
      
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 30); // 30-day harvest window
      
      harvestWindows.push({
        start_date: startDate,
        end_date: endDate,
        variety,
        estimated_quantity: `${(this.tree_count * 0.01).toFixed(1)} tons` // Rough estimate
      });
    });
  }
  
  return harvestWindows;
};

farmSchema.methods.isHarvestReady = function(): boolean {
  if (!this.expected_harvest) return false;
  
  const now = new Date();
  const harvestDate = new Date(this.expected_harvest);
  const daysDiff = Math.ceil((harvestDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
  
  return daysDiff <= 30 && daysDiff >= 0; // Ready if harvest is within 30 days
};

farmSchema.methods.getProductionStats = function(period: string = '30d') {
  // This would typically query production records
  // For now, return estimated data
  const baseProduction = this.tree_count * 0.01; // 10kg per tree estimate
  
  return {
    farm_id: this._id,
    period,
    total_production: `${baseProduction.toFixed(1)} tons`,
    average_quality_grade: 'A',
    revenue: baseProduction * 2000000, // 2M RWF per ton estimate
    production_trend: [] // Would be populated from actual records
  };
};

// Static methods
farmSchema.statics.findByLocation = function(
  province: string, 
  district?: string, 
  sector?: string
) {
  const query: any = { 'location.province': province };
  if (district) query['location.district'] = district;
  if (sector) query['location.sector'] = sector;
  
  return this.find(query);
};

farmSchema.statics.findHarvestReady = function(variety?: string) {
  const now = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(now.getDate() + 30);
  
  const query: any = {
    expected_harvest: {
      $gte: now,
      $lte: thirtyDaysFromNow
    },
    status: { $in: ['producing', 'harvesting'] }
  };
  
  if (variety) {
    query.varieties = variety;
  }
  
  return this.find(query);
};

farmSchema.statics.getOverview = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        total_farms: { $sum: 1 },
        total_trees: { $sum: '$tree_count' },
        average_farm_size: { $avg: '$farm_size' },
        organic_farms: {
          $sum: { $cond: ['$organic_certified', 1, 0] }
        }
      }
    }
  ]);

  const harvestReady = await this.countDocuments({
    expected_harvest: {
      $gte: new Date(),
      $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });

  const topDistricts = await this.aggregate([
    {
      $group: {
        _id: '$location.district',
        farm_count: { $sum: 1 },
        total_trees: { $sum: '$tree_count' }
      }
    },
    { $sort: { farm_count: -1 } },
    { $limit: 5 }
  ]);

  return {
    ...stats[0],
    harvest_ready_farms: harvestReady,
    total_production_this_season: '150 tons', // Would be calculated from actual records
    top_producing_districts: topDistricts.map(d => ({
      district: d._id,
      farm_count: d.farm_count,
      production: `${(d.total_trees * 0.01).toFixed(1)} tons`
    }))
  };
};

// Define the model interface with static methods
interface IFarmModel extends Model<IFarm> {
  findByLocation(province: string, district?: string, sector?: string): Promise<IFarm[]>;
  findHarvestReady(variety?: string): Promise<IFarm[]>;
  getOverview(): Promise<any>;
}

export const Farm: IFarmModel = mongoose.model<IFarm, IFarmModel>('Farm', farmSchema);
export default Farm;