import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import bcrypt from 'bcryptjs';

async function seed() {
  try {
    logger.info('Starting database seeding...');

    // Create admin user if none exists
    const adminExists = await prisma.user.findFirst({ where: { role: 'admin' } });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123456', 12);
      await prisma.user.create({
        data: {
          email: 'admin@dashboardavocado.com',
          password: hashedPassword,
          full_name: 'System Administrator',
          role: 'admin',
          status: 'active',
        },
      });
      logger.info('Admin user created: admin@dashboardavocado.com / admin123456');
    } else {
      logger.info('Admin user already exists, skipping');
    }

    // Create sample agent if none exists
    const agentExists = await prisma.user.findFirst({ where: { role: 'agent' } });
    if (!agentExists) {
      const hashedPassword = await bcrypt.hash('agent123456', 12);
      const agent = await prisma.user.create({
        data: {
          email: 'agent@dashboardavocado.com',
          password: hashedPassword,
          full_name: 'Sample Agent',
          phone: '+250788123456',
          role: 'agent',
          status: 'active',
          profile: {
            province: 'Kigali',
            district: 'Gasabo',
            sector: 'Kimironko',
            service_areas: ['Kigali', 'Eastern Province'],
          },
        },
      });
      // Create agent profile
      await prisma.agentProfile.create({
        data: {
          user_id: agent.id,
          agentId: agent.id,
          territory: ['Kigali', 'Eastern Province'],
          province: 'Kigali',
          district: 'Gasabo',
          sector: 'Kimironko',
          specialization: 'Avocado Farming',
          statistics: { farmers_managed: 0, visits_completed: 0 },
        },
      });
      logger.info('Sample agent created: agent@dashboardavocado.com / agent123456');
    }

    // Create sample farmer if none exists
    const farmerExists = await prisma.user.findFirst({ where: { role: 'farmer' } });
    if (!farmerExists) {
      const hashedPassword = await bcrypt.hash('farmer123456', 12);
      const farmer = await prisma.user.create({
        data: {
          email: 'farmer@dashboardavocado.com',
          password: hashedPassword,
          full_name: 'Sample Farmer',
          phone: '+250789456789',
          role: 'farmer',
          status: 'active',
          qr_code_token: `QR-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          profile: {
            province: 'Eastern Province',
            district: 'Rwamagana',
            sector: 'Musha',
          },
        },
      });
      await prisma.farmerProfile.create({
        data: {
          user_id: farmer.id,
          province: 'Eastern Province',
          district: 'Rwamagana',
          sector: 'Musha',
          farm_province: 'Eastern Province',
          farm_district: 'Rwamagana',
          farm_sector: 'Musha',
          farm_size: 2.5,
          tree_count: 120,
          avocado_type: 'Hass',
          assistance: ['fertilizer', 'pesticide'],
        },
      });
      logger.info('Sample farmer created: farmer@dashboardavocado.com / farmer123456');
    }

    // Create sample products if none exist
    const productCount = await prisma.product.count();
    if (productCount === 0) {
      const shopManagerExists = await prisma.user.findFirst({ where: { role: 'shop_manager' } });
      if (!shopManagerExists) {
        const hashedPassword = await bcrypt.hash('shop123456', 12);
        await prisma.user.create({
          data: {
            email: 'shop@dashboardavocado.com',
            password: hashedPassword,
            full_name: 'Sample Shop Manager',
            phone: '+250788654321',
            role: 'shop_manager',
            status: 'active',
          },
        });
        logger.info('Sample shop manager created: shop@dashboardavocado.com / shop123456');
      }

      // Create a sample supplier first
      let supplier = await prisma.supplier.findFirst();
      if (!supplier) {
        supplier = await prisma.supplier.create({
          data: {
            name: 'Rwanda Agri Supplies Ltd',
            category: 'input_distributor',
            contact_person: 'Jean Baptiste Nzeyimana',
            email: 'supplies@rwandaagri.rw',
            phone: '+250788000001',
            address: { street_address: 'KG 123 St', city: 'Kigali', province: 'Kigali', country: 'Rwanda' },
            status: 'active',
          },
        });
      }

      const supplierId = supplier.id;
      const sampleProducts = [
        {
          name: 'Avocado Seedlings - Hass Variety',
          description: 'High-quality Hass avocado seedlings, disease-resistant and high-yielding',
          price: 2500,
          category: 'seeds' as const,
          unit: 'piece' as const,
          quantity: 100,
          status: 'available' as const,
          sku: 'SEED-HASS-001',
          supplier_id: supplierId,
        },
        {
          name: 'Organic Fertilizer - NPK 15-15-15',
          description: 'Balanced organic fertilizer suitable for avocado trees',
          price: 15000,
          category: 'fertilizers' as const,
          unit: 'kg' as const,
          quantity: 50,
          status: 'available' as const,
          sku: 'FERT-NPK-001',
          supplier_id: supplierId,
        },
        {
          name: 'Pruning Shears - Professional Grade',
          description: 'High-quality pruning shears for avocado tree maintenance',
          price: 8500,
          category: 'tools' as const,
          unit: 'piece' as const,
          quantity: 25,
          status: 'available' as const,
          sku: 'TOOL-PRUNE-001',
          supplier_id: supplierId,
        },
        {
          name: 'Organic Pesticide - Neem Oil Based',
          description: 'Natural pesticide for pest control in avocado farming',
          price: 12000,
          category: 'pest_management' as const,
          unit: 'liter' as const,
          quantity: 30,
          status: 'available' as const,
          sku: 'PEST-NEEM-001',
          supplier_id: supplierId,
        },
        {
          name: 'Drip Irrigation Kit - 1 Acre',
          description: 'Complete drip irrigation system for 1 acre avocado farm',
          price: 85000,
          category: 'irrigation' as const,
          unit: 'piece' as const,
          quantity: 10,
          status: 'available' as const,
          sku: 'IRRI-DRIP-001',
          supplier_id: supplierId,
        },
      ];

      await prisma.product.createMany({ data: sampleProducts });
      logger.info(`${sampleProducts.length} sample products created`);
    }

    // Container & protection-equipment products (added separately so they
    // backfill even on databases already seeded before these categories existed)
    const containerProductExists = await prisma.product.findFirst({ where: { sku: 'CONT-PLASTIC-001' } });
    if (!containerProductExists) {
      const supplier = await prisma.supplier.findFirst();
      if (supplier) {
        await prisma.product.createMany({
          data: [
            {
              name: 'Premium Plastic Avocado Container - 50kg',
              description: 'Heavy-duty plastic container perfect for storing and transporting avocados',
              price: 45000,
              category: 'containers' as const,
              unit: 'piece' as const,
              quantity: 50,
              status: 'available' as const,
              sku: 'CONT-PLASTIC-001',
              supplier_id: supplier.id,
            },
            {
              name: 'Wooden Crate for Avocados - Large',
              description: 'Traditional wooden crate with excellent ventilation',
              price: 35000,
              category: 'containers' as const,
              unit: 'piece' as const,
              quantity: 30,
              status: 'available' as const,
              sku: 'CONT-WOOD-001',
              supplier_id: supplier.id,
            },
          ],
        });
        logger.info('Container products created');
      }
    }

    const protectionProductExists = await prisma.product.findFirst({ where: { sku: 'PROT-BOOTS-001' } });
    if (!protectionProductExists) {
      const supplier = await prisma.supplier.findFirst();
      if (supplier) {
        await prisma.product.createMany({
          data: [
            {
              name: 'Farm Boots - Heavy Duty',
              description: 'Protect feet from mud and sharp objects in the orchard',
              price: 25000,
              category: 'protection' as const,
              unit: 'piece' as const,
              quantity: 40,
              status: 'available' as const,
              sku: 'PROT-BOOTS-001',
              supplier_id: supplier.id,
            },
            {
              name: 'Protective Gloves - Chemical Resistant',
              description: 'Safeguards hands during spraying and tool use',
              price: 8500,
              category: 'protection' as const,
              unit: 'piece' as const,
              quantity: 60,
              status: 'available' as const,
              sku: 'PROT-GLOVES-001',
              supplier_id: supplier.id,
            },
            {
              name: 'Respiratory Mask - Reusable',
              description: 'Chemical inhalation protection during spraying',
              price: 12000,
              category: 'protection' as const,
              unit: 'piece' as const,
              quantity: 35,
              status: 'available' as const,
              sku: 'PROT-MASK-001',
              supplier_id: supplier.id,
            },
          ],
        });
        logger.info('Protection equipment products created');
      }
    }

    logger.info('Database seeding completed successfully');
    logger.info('Credentials:');
    logger.info('  Admin:        admin@dashboardavocado.com / admin123456');
    logger.info('  Agent:        agent@dashboardavocado.com / agent123456');
    logger.info('  Farmer:       farmer@dashboardavocado.com / farmer123456');
    logger.info('  Shop Manager: shop@dashboardavocado.com / shop123456');

  } catch (error) {
    logger.error('Seeding failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seed()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

export default seed;
