import { expect } from 'chai';
import { describe, it, before, after } from 'mocha';
import request from 'supertest';
import app from '../src/server';
import { prisma } from '../src/lib/prisma';

describe('Service requests, profile /me routes, and shop-manager module (in-process)', function () {
  this.timeout(20000);

  const createdUserIds: string[] = [];
  const createdRequestIds: string[] = [];
  let farmerToken: string;
  let farmerId: string;
  let adminToken: string;

  before(async () => {
    const farmerRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: `sr-farmer-${Date.now()}@example.com`,
        password: 'TestPass123!',
        full_name: 'Service Request Farmer',
        phone: '+250788100001',
        role: 'farmer',
        gender: 'Female',
        province: 'Eastern Province',
        district: 'Gatsibo',
        farm_size: 3,
        avocado_type: 'Fuerte',
      });
    farmerToken = farmerRes.body.data.token;
    farmerId = farmerRes.body.data.user.id;
    createdUserIds.push(farmerId);

    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@dashboardavocado.com', password: 'admin123456' });
    adminToken = adminLogin.body.data.token;
  });

  after(async () => {
    await prisma.notification.deleteMany({ where: { recipient_id: { in: createdUserIds } } });
    await prisma.signature.deleteMany({ where: { signer_id: { in: createdUserIds } } });
    await prisma.document.deleteMany({ where: { owner_id: { in: createdUserIds } } });
    await prisma.serviceRequest.deleteMany({ where: { id: { in: createdRequestIds } } });
    await prisma.farm.deleteMany({ where: { farmer_id: { in: createdUserIds } } });
    await prisma.farmerProfile.deleteMany({ where: { user_id: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it('creates an IPM routine request', async () => {
    const res = await request(app)
      .post('/api/service-requests/ipm-routine')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({
        scheduledDate: '2026-08-01',
        farmSize: 2.5,
        pestType: ['Avocado Thrips'],
        ipmMethod: ['Biological Control'],
        laborRequired: 3,
        targetArea: 'North block',
        location: { province: 'Eastern Province', district: 'Gatsibo', sector: 'Kageyo', cell: 'Karangazi', village: 'Nyagatare' },
      });

    expect(res.status).to.equal(201);
    expect(res.body.data.service_type).to.equal('ipm_routine');
    createdRequestIds.push(res.body.data.id);
  });

  it('lists IPM routine requests scoped to the requesting farmer', async () => {
    const res = await request(app)
      .get('/api/service-requests/ipm-routine')
      .set('Authorization', `Bearer ${farmerToken}`);

    expect(res.status).to.equal(200);
    expect(res.body.data.some((r: any) => r.id === createdRequestIds[0])).to.be.true;
  });

  it('returns the farmer\'s requests via the scoped /farmer/:farmerId listing', async () => {
    const res = await request(app)
      .get(`/api/service-requests/farmer/${farmerId}`)
      .set('Authorization', `Bearer ${farmerToken}`);

    expect(res.status).to.equal(200);
    expect(res.body.data.some((r: any) => r.id === createdRequestIds[0])).to.be.true;
  });

  it('blocks a different farmer from reading via /farmer/:farmerId', async () => {
    const otherRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: `sr-other-farmer-${Date.now()}@example.com`,
        password: 'TestPass123!',
        full_name: 'Other Farmer',
        phone: '+250788100002',
        role: 'farmer',
        gender: 'Male',
        province: 'Kigali City',
        district: 'Gasabo',
        farm_size: 1,
        avocado_type: 'Hass',
      });
    createdUserIds.push(otherRes.body.data.user.id);

    const res = await request(app)
      .get(`/api/service-requests/farmer/${farmerId}`)
      .set('Authorization', `Bearer ${otherRes.body.data.token}`);

    expect(res.status).to.equal(403);
  });

  it('allows admin to update status via the generic PUT /:id/status route', async () => {
    const res = await request(app)
      .put(`/api/service-requests/${createdRequestIds[0]}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' });

    expect(res.status).to.equal(200);
    expect(res.body.data.status).to.equal('approved');
    expect(res.body.data.approved_at).to.not.be.null;
  });

  it('updates the farmer\'s own profile via PUT /farmer-information/me', async () => {
    const res = await request(app)
      .put('/api/farmer-information/me')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({ tree_count: 250 });

    expect(res.status).to.equal(200);
    expect(res.body.data.tree_count).to.equal(250);
  });
});

describe('Suppliers, inventory, and customers CRUD (in-process)', function () {
  this.timeout(20000);

  let adminToken: string;
  let supplierId: string;
  let productId: string;
  let customerId: string;

  before(async () => {
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@dashboardavocado.com', password: 'admin123456' });
    adminToken = adminLogin.body.data.token;
  });

  after(async () => {
    if (productId) await prisma.stockHistory.deleteMany({ where: { product_id: productId } });
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    if (supplierId) await prisma.supplier.deleteMany({ where: { id: supplierId } });
    if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
  });

  it('creates a supplier', async () => {
    const res = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Test Supplier ${Date.now()}`,
        category: 'fertilizer_supplier',
        contact_person: 'Test Contact',
        email: `supplier-${Date.now()}@example.com`,
        phone: '+250788200001',
        address: { street_address: 'KG 1', city: 'Kigali', province: 'Kigali City', postal_code: '000', country: 'Rwanda' },
      });

    expect(res.status).to.equal(201);
    supplierId = res.body.data.id;
  });

  it('creates an inventory item against that supplier', async () => {
    const res = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Test Avocado Batch',
        category: 'produce',
        variety: 'Hass Avocados',
        price: 2500,
        quantity: 50,
        unit: 'kg',
        supplier_id: supplierId,
        min_stock: 5,
      });

    expect(res.status).to.equal(200);
    productId = res.body.data.id;
    expect(res.body.data.variety).to.equal('Hass Avocados');
  });

  it('updates the inventory item via PUT /inventory/:id', async () => {
    const res = await request(app)
      .put(`/api/inventory/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quantity: 40 });

    expect(res.status).to.equal(200);
    expect(res.body.data.quantity).to.equal(40);
  });

  it('creates a customer with the extended fields', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        first_name: 'Jean',
        last_name: 'Paul',
        email: `customer-${Date.now()}@example.com`,
        phone: '+250788200002',
        type: 'individual',
      });

    expect(res.status).to.equal(201);
    customerId = res.body.data.id;
    expect(res.body.data.name).to.equal('Jean Paul');
  });
});
