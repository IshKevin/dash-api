import mongoose from 'mongoose';
import { env } from '../config/environment';
import logger from '../config/logger';
import User from '../models/User';
import Product from '../models/Product';

/**
 * Seed script for initial data setup
 */
async function seed() {
  try {
    // Connect to database
    await mongoose.connect(env.MONGODB_URI);
    logger.info('Connected to database for seeding');

    // Create admin user if doesn't exist
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
      const adminUser = new User({
        email: 'admin@dashboardavocado.com',
        password: 'admin123456', // Change this in production
        full_name: 'System Administrator',
        role: 'admin',
        status: 'active'
      });
      await adminUser.save();
      logger.info('Admin user created');
    }

    // Create sample agent if doesn't exist
    const agentExists = await User.findOne({ role: 'agent' });
    if (!agentExists) {
      const agentUser = new User({
        email: 'agent@dashboardavocado.com',
        password: 'agent123456',
        full_name: 'Sample Agent',
        phone: '+250788123456',
        role: 'agent',
        status: 'active',
        profile: {
          province: 'Kigali',
          district: 'Gasabo',
          sector: 'Kimironko',
          service_areas: ['Kigali', 'Eastern Province']
        }
      });
      await agentUser.save();
      logger.info('Sample agent created');
    }

    // Create sample products if none exist
    const productCount = await Product.countDocuments();
    if (productCount === 0) {
      const sampleProducts = [
        {
          name: 'Avocado Seedlings - Hass Variety',
          description: 'High-quality Hass avocado seedlings, disease-resistant and high-yielding',
          price: 2500,
          category: 'seeds',
          stock_quantity: 100,
          status: 'active',
          images: []
        },
        {
          name: 'Organic Fertilizer - NPK 15-15-15',
          description: 'Balanced organic fertilizer suitable for avocado trees',
          price: 15000,
          category: 'fertilizers',
          stock_quantity: 50,
          status: 'active',
          images: []
        },
        {
          name: 'Pruning Shears - Professional Grade',
          description: 'High-quality pruning shears for avocado tree maintenance',
          price: 8500,
          category: 'tools',
          stock_quantity: 25,
          status: 'active',
          images: []
        },
        {
          name: 'Organic Pesticide - Neem Oil Based',
          description: 'Natural pesticide for pest control in avocado farming',
          price: 12000,
          category: 'pesticides',
          stock_quantity: 30,
          status: 'active',
          images: []
        }
      ];

      await Product.insertMany(sampleProducts);
      logger.info(`${sampleProducts.length} sample products created`);
    }

    logger.info('Seeding completed successfully');
    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    logger.error('Seeding failed:', error);
    process.exit(1);
  }
}

// Run seed if this file is executed directly
if (require.main === module) {
  seed();
}

export default seed;