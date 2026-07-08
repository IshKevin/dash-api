import { Prisma } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

export interface FarmerProfileFields {
  age?: number;
  id_number?: string;
  gender?: string;
  marital_status?: string;
  education_level?: string;
  province?: string;
  district?: string;
  sector?: string;
  cell?: string;
  village?: string;
  farm_age?: number;
  planted?: string;
  avocado_type?: string;
  mixed_percentage?: number;
  farm_size?: number;
  tree_count?: number;
  upi_number?: string;
  farm_province?: string;
  farm_district?: string;
  farm_sector?: string;
  farm_cell?: string;
  farm_village?: string;
  assistance?: string[];
  image?: string;
}

export async function createFarmerProfileForUser(tx: TxClient, userId: string, fields: FarmerProfileFields) {
  return tx.farmerProfile.create({
    data: {
      user_id: userId,
      age: fields.age,
      id_number: fields.id_number,
      gender: fields.gender as any,
      marital_status: fields.marital_status as any,
      education_level: fields.education_level as any,
      province: fields.province,
      district: fields.district,
      sector: fields.sector,
      cell: fields.cell,
      village: fields.village,
      farm_age: fields.farm_age,
      planted: fields.planted,
      avocado_type: fields.avocado_type,
      mixed_percentage: fields.mixed_percentage,
      farm_size: fields.farm_size,
      tree_count: fields.tree_count ?? 0,
      upi_number: fields.upi_number,
      farm_province: fields.farm_province,
      farm_district: fields.farm_district,
      farm_sector: fields.farm_sector,
      farm_cell: fields.farm_cell,
      farm_village: fields.farm_village,
      assistance: fields.assistance || [],
      image: fields.image,
    },
  });
}

export interface FarmFields {
  farm_size?: number;
  tree_count?: number;
  avocado_type?: string;
  planted?: string;
  province?: string;
  district?: string;
  sector?: string;
  cell?: string;
  village?: string;
  farm_province?: string;
  farm_district?: string;
  farm_sector?: string;
  farm_cell?: string;
  farm_village?: string;
  organic_certified?: boolean;
  irrigation_system?: string;
  soil_type?: string;
}

function parsePlantingDate(planted?: string): Date {
  if (!planted) return new Date();
  const parsed = new Date(planted);
  if (!isNaN(parsed.getTime())) return parsed;
  const year = parseInt(planted, 10);
  if (!isNaN(year)) return new Date(year, 0, 1);
  return new Date();
}

function deriveVarieties(avocadoType?: string): string[] {
  if (!avocadoType) return [];
  return avocadoType.toLowerCase() === 'mixed' ? ['Hass', 'Fuerte'] : [avocadoType];
}

// Creates the farmer's first Farm record from data already collected at
// registration, since TreeRecord/DiseaseCase/HarvestForecast/FarmVisit all
// reference a Farm — without this, a newly registered farmer has nothing
// for those subsystems to attach to.
export async function createFarmForUser(tx: TxClient, userId: string, fullName: string, fields: FarmFields) {
  return tx.farm.create({
    data: {
      farmName: `${fullName}'s Farm`,
      farmerName: fullName,
      farmer_id: userId,
      location: {
        province: fields.farm_province || fields.province,
        district: fields.farm_district || fields.district,
        sector: fields.farm_sector || fields.sector,
        cell: fields.farm_cell || fields.cell,
        village: fields.farm_village || fields.village,
      },
      crop_type: 'avocado',
      farm_size: fields.farm_size ?? 0,
      tree_count: fields.tree_count ?? 0,
      varieties: deriveVarieties(fields.avocado_type),
      planting_date: parsePlantingDate(fields.planted),
      organic_certified: fields.organic_certified ?? false,
      irrigation_system: fields.irrigation_system,
      soil_type: fields.soil_type,
    },
  });
}

export interface AgentProfileFields {
  province?: string;
  district?: string;
  sector?: string;
  cell?: string;
  village?: string;
  specialization?: string;
  experience?: string;
  certification?: string;
}

export async function createAgentProfileForUser(tx: TxClient, userId: string, fields: AgentProfileFields) {
  const territory = fields.district || fields.sector
    ? [{ district: fields.district, sector: fields.sector, isPrimary: true, assignedDate: new Date().toISOString() }]
    : [];

  return tx.agentProfile.create({
    data: {
      user_id: userId,
      agentId: userId,
      province: fields.province,
      district: fields.district,
      sector: fields.sector,
      cell: fields.cell,
      village: fields.village,
      specialization: fields.specialization,
      experience: fields.experience,
      certification: fields.certification,
      territory,
      statistics: {},
    },
  });
}

export interface ShopManagerFields {
  shopName: string;
  description: string;
  province: string;
  district: string;
}

export async function createShopForManager(
  tx: TxClient,
  userId: string,
  owner: { ownerName: string; ownerEmail: string; ownerPhone: string },
  fields: ShopManagerFields
) {
  return tx.shop.create({
    data: {
      shopName: fields.shopName,
      description: fields.description,
      province: fields.province,
      district: fields.district,
      ownerName: owner.ownerName,
      ownerEmail: owner.ownerEmail,
      ownerPhone: owner.ownerPhone,
      created_by: userId,
      manager_id: userId,
    },
  });
}
