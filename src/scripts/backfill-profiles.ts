import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';

/**
 * One-off backfill: earlier versions of the app stored farmer/agent profile
 * data in the ad-hoc User.profile JSON blob instead of the relational
 * FarmerProfile/AgentProfile tables. This creates the relational row for any
 * user missing one, sourced from that JSON blob.
 *
 * Run manually: npx ts-node src/scripts/backfill-profiles.ts
 */
async function backfillProfiles() {
  logger.info('Starting profile backfill...');

  const farmers = await prisma.user.findMany({
    where: { role: 'farmer', farmer_profile: null, profile: { not: Prisma.JsonNull } },
  });

  let farmersBackfilled = 0;
  for (const user of farmers) {
    const profile = (user.profile as any) || {};
    if (Object.keys(profile).length === 0) continue;

    await prisma.farmerProfile.create({
      data: {
        user_id: user.id,
        age: profile.age,
        id_number: profile.id_number,
        gender: profile.gender,
        marital_status: profile.marital_status,
        education_level: profile.education_level,
        province: profile.province,
        district: profile.district,
        sector: profile.sector,
        cell: profile.cell,
        village: profile.village,
        farm_age: profile.farm_age,
        planted: profile.planted,
        avocado_type: profile.avocado_type,
        mixed_percentage: profile.mixed_percentage,
        farm_size: profile.farm_size,
        tree_count: profile.tree_count ?? 0,
        upi_number: profile.upi_number,
        farm_province: profile.farm_province,
        farm_district: profile.farm_district,
        farm_sector: profile.farm_sector,
        farm_cell: profile.farm_cell,
        farm_village: profile.farm_village,
        assistance: profile.assistance || [],
      },
    });
    farmersBackfilled++;
  }

  const agents = await prisma.user.findMany({
    where: { role: 'agent', agent_profile: null, profile: { not: Prisma.JsonNull } },
  });

  let agentsBackfilled = 0;
  for (const user of agents) {
    const profile = (user.profile as any) || {};
    if (Object.keys(profile).length === 0) continue;

    await prisma.agentProfile.create({
      data: {
        user_id: user.id,
        agentId: user.id,
        province: profile.province,
        district: profile.district,
        sector: profile.sector || (Array.isArray(profile.service_areas) ? profile.service_areas[0] : undefined),
        territory: profile.district
          ? [{ district: profile.district, sector: profile.sector, isPrimary: true, assignedDate: new Date().toISOString() }]
          : [],
        statistics: {},
      },
    });
    agentsBackfilled++;
  }

  logger.info(`Backfill complete: ${farmersBackfilled} farmer profiles, ${agentsBackfilled} agent profiles created.`);
}

backfillProfiles()
  .catch((err) => {
    logger.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
