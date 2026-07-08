import { expect } from 'chai';
import { describe, it, after } from 'mocha';
import request from 'supertest';
import app from '../src/server';
import { prisma } from '../src/lib/prisma';

describe('Comprehensive registration (in-process, via supertest)', function () {
  this.timeout(15000);

  const createdUserIds: string[] = [];

  after(async () => {
    // Clean up in dependency order: profiles/shops/farms first, then users.
    await prisma.farm.deleteMany({ where: { farmer_id: { in: createdUserIds } } });
    await prisma.farmerProfile.deleteMany({ where: { user_id: { in: createdUserIds } } });
    await prisma.agentProfile.deleteMany({ where: { user_id: { in: createdUserIds } } });
    await prisma.shop.deleteMany({ where: { manager_id: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it('registers a farmer, creates a relational FarmerProfile row, and seeds a Farm record', async () => {
    const email = `farmer-reg-${Date.now()}@example.com`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password: 'TestPass123!',
        full_name: 'Test Farmer',
        phone: '+250788000001',
        role: 'farmer',
        gender: 'Male',
        province: 'Eastern Province',
        district: 'Gatsibo',
        farm_size: 2.5,
        avocado_type: 'Hass',
        tree_count: 100,
        planted: '2018',
        organic_certified: true,
        irrigation_system: 'Drip irrigation',
        soil_type: 'Loam',
      });

    expect(res.status).to.equal(201);
    expect(res.body.success).to.be.true;
    expect(res.body.data.token).to.be.a('string');
    expect(res.body.data.refreshToken).to.be.a('string');
    createdUserIds.push(res.body.data.user.id);

    const profile = await prisma.farmerProfile.findUnique({ where: { user_id: res.body.data.user.id } });
    expect(profile).to.not.be.null;
    expect(profile?.province).to.equal('Eastern Province');
    expect(profile?.farm_size).to.equal(2.5);

    const farm = await prisma.farm.findFirst({ where: { farmer_id: res.body.data.user.id } });
    expect(farm).to.not.be.null;
    expect(farm?.farm_size).to.equal(2.5);
    expect(farm?.tree_count).to.equal(100);
    expect(farm?.varieties).to.deep.equal(['Hass']);
    expect(farm?.organic_certified).to.be.true;
    expect(farm?.irrigation_system).to.equal('Drip irrigation');
    expect(farm?.soil_type).to.equal('Loam');
    expect(farm?.planting_date.getFullYear()).to.equal(2018);
  });

  it('registers an agent and creates a relational AgentProfile row', async () => {
    const email = `agent-reg-${Date.now()}@example.com`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password: 'TestPass123!',
        full_name: 'Test Agent',
        phone: '+250788000002',
        role: 'agent',
        province: 'Kigali City',
        district: 'Gasabo',
        specialization: 'Pest Management',
      });

    expect(res.status).to.equal(201);
    createdUserIds.push(res.body.data.user.id);

    const profile = await prisma.agentProfile.findUnique({ where: { user_id: res.body.data.user.id } });
    expect(profile).to.not.be.null;
    expect(profile?.specialization).to.equal('Pest Management');
    expect(profile?.district).to.equal('Gasabo');
  });

  it('registers a shop_manager and creates a Shop linked via manager_id', async () => {
    const email = `shopmgr-reg-${Date.now()}@example.com`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password: 'TestPass123!',
        full_name: 'Test Shop Manager',
        phone: '+250788000003',
        role: 'shop_manager',
        shopName: 'Test Shop',
        description: 'A test shop created at registration',
        province: 'Kigali City',
        district: 'Nyarugenge',
      });

    expect(res.status).to.equal(201);
    createdUserIds.push(res.body.data.user.id);

    const shop = await prisma.shop.findUnique({ where: { manager_id: res.body.data.user.id } });
    expect(shop).to.not.be.null;
    expect(shop?.shopName).to.equal('Test Shop');
    expect(shop?.ownerEmail).to.equal(email.toLowerCase());
  });

  it('rejects role=admin from the public registration endpoint', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: `admin-reg-${Date.now()}@example.com`,
        password: 'TestPass123!',
        full_name: 'Should Not Work',
        phone: '+250788000004',
        role: 'admin',
      });

    expect(res.status).to.equal(400);
    expect(res.body.success).to.be.false;
  });

  it('rejects a farmer registration missing required role-specific fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: `incomplete-farmer-${Date.now()}@example.com`,
        password: 'TestPass123!',
        full_name: 'Incomplete Farmer',
        phone: '+250788000005',
        role: 'farmer',
        // missing gender/province/district/farm_size/avocado_type
      });

    expect(res.status).to.equal(400);
    expect(res.body.message).to.include('Missing required fields');
  });

  it('issues a working refresh token that survives access-token expiry logic', async () => {
    const email = `refresh-reg-${Date.now()}@example.com`;
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password: 'TestPass123!',
        full_name: 'Refresh Tester',
        phone: '+250788000006',
        role: 'agent',
        province: 'Kigali City',
        district: 'Kicukiro',
        specialization: 'General',
      });
    createdUserIds.push(registerRes.body.data.user.id);

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: registerRes.body.data.refreshToken });

    expect(refreshRes.status).to.equal(200);
    expect(refreshRes.body.data.token).to.be.a('string');
  });
});
