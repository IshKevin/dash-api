import { expect } from 'chai';
import { describe, it, before, after } from 'mocha';
import request from 'supertest';
import app from '../src/server';
import { prisma } from '../src/lib/prisma';

async function registerFarmer(tag: string, district: string, province: string) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      email: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
      password: 'TestPass123!',
      full_name: `Farmer ${tag}`,
      phone: '+250788200009',
      role: 'farmer',
      gender: 'Female',
      province,
      district,
      sector: 'Musha',
      farm_size: 1,
      avocado_type: 'Hass',
      tree_count: 40,
    });
  expect(res.status, JSON.stringify(res.body)).to.equal(201);
  return { token: res.body.data.token as string, id: res.body.data.user.id as string };
}

async function login(email: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status, JSON.stringify(res.body)).to.equal(200);
  return { token: res.body.data.token as string, id: res.body.data.user.id as string };
}

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('Nearby services, opportunities & monthly harvest summary (in-process)', function () {
  this.timeout(30000);

  const userIds: string[] = [];
  const facilityIds: string[] = [];
  const opportunityIds: string[] = [];
  let admin: { token: string; id: string };
  let agent: { token: string; id: string };
  let east: { token: string; id: string }; // Rwamagana
  let west: { token: string; id: string }; // Rusizi

  before(async () => {
    admin = await login('admin@dashboardavocado.com', 'admin123456');
    agent = await login('agent@dashboardavocado.com', 'agent123456');
    east = await registerFarmer('near-east', 'Rwamagana', 'Eastern Province');
    west = await registerFarmer('near-west', 'Rusizi', 'Western Province');
    userIds.push(east.id, west.id);
  });

  after(async () => {
    await prisma.opportunityInterest.deleteMany({ where: { farmer_id: { in: userIds } } });
    await prisma.opportunity.deleteMany({ where: { id: { in: opportunityIds } } });
    await prisma.facility.deleteMany({ where: { id: { in: facilityIds } } });
    await prisma.harvestLot.deleteMany({ where: { farmer_id: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { OR: [{ recipient_id: { in: userIds } }, { related_entity_id: { in: opportunityIds } }] } });
    await prisma.signature.deleteMany({ where: { signer_id: { in: userIds } } });
    await prisma.document.deleteMany({ where: { owner_id: { in: userIds } } });
    await prisma.farm.deleteMany({ where: { farmer_id: { in: userIds } } });
    await prisma.farmerProfile.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.cart.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  describe('Facilities & nearby', () => {
    it('farmers cannot create facilities (403)', async () => {
      const res = await request(app).post('/api/facilities').set(auth(east.token))
        .send({ name: 'X', type: 'market', district: 'Rwamagana', latitude: -1.95, longitude: 30.43 });
      expect(res.status).to.equal(403);
    });

    it('rejects coordinates outside Rwanda and unknown districts', async () => {
      const outside = await request(app).post('/api/facilities').set(auth(admin.token))
        .send({ name: 'Nairobi', type: 'airport', district: 'Rwamagana', latitude: -1.29, longitude: 36.82 });
      expect(outside.status).to.equal(400);
      const badDistrict = await request(app).post('/api/facilities').set(auth(admin.token))
        .send({ name: 'X', type: 'market', district: 'Atlantis', latitude: -1.95, longitude: 30.43 });
      expect(badDistrict.status).to.equal(400);
    });

    it('agent creates facilities; district fills in the province', async () => {
      const near = await request(app).post('/api/facilities').set(auth(agent.token))
        .send({ name: 'Test Rwamagana collection centre', type: 'collection_center', district: 'rwamagana', latitude: -1.95, longitude: 30.44 });
      expect(near.status, JSON.stringify(near.body)).to.equal(201);
      expect(near.body.data.province).to.equal('Eastern Province');
      expect(near.body.data.district).to.equal('Rwamagana');
      const far = await request(app).post('/api/facilities').set(auth(agent.token))
        .send({ name: 'Test Rusizi collection centre', type: 'collection_center', district: 'Rusizi', latitude: -2.48, longitude: 28.91 });
      const inactive = await request(app).post('/api/facilities').set(auth(agent.token))
        .send({ name: 'Test closed market', type: 'market', district: 'Rwamagana', latitude: -1.95, longitude: 30.43, active: false });
      facilityIds.push(near.body.data.id, far.body.data.id, inactive.body.data.id);
    });

    it('farmer without GPS gets nearby services from their district centre, nearest first', async () => {
      const res = await request(app).get('/api/facilities/nearby').set(auth(east.token));
      expect(res.status, JSON.stringify(res.body)).to.equal(200);
      const d = res.body.data;
      expect(d.origin.source).to.equal('district_centre');
      expect(d.origin.district).to.equal('Rwamagana');
      const centres = d.facilities.collection_center.filter((f: any) => facilityIds.includes(f.id));
      expect(centres[0].name).to.equal('Test Rwamagana collection centre');
      expect(centres[0].distance_km).to.be.lessThan(centres[1].distance_km);
      // Inactive facilities are hidden from farmers.
      expect((d.facilities.market || []).some((f: any) => f.id === facilityIds[2])).to.equal(false);
      expect(d.agents).to.be.an('array');
      expect(d.shops).to.be.an('array');
    });

    it('explicit lat/lng wins; farm GPS is used when present', async () => {
      const q = await request(app).get('/api/facilities/nearby?lat=-2.48&lng=28.91&types=collection_center').set(auth(east.token));
      expect(q.status).to.equal(200);
      expect(q.body.data.origin.source).to.equal('query');
      expect(q.body.data.facilities.collection_center.filter((f: any) => facilityIds.includes(f.id))[0].name).to.equal('Test Rusizi collection centre');

      await prisma.farm.updateMany({ where: { farmer_id: west.id }, data: { latitude: -2.48, longitude: 28.91 } });
      const gps = await request(app).get('/api/facilities/nearby').set(auth(west.token));
      expect(gps.body.data.origin.source).to.equal('farm_gps');
    });

    it('rejects bad coordinates and unknown types (400)', async () => {
      expect((await request(app).get('/api/facilities/nearby?lat=10&lng=10').set(auth(east.token))).status).to.equal(400);
      expect((await request(app).get('/api/facilities/nearby?types=spaceport').set(auth(east.token))).status).to.equal(400);
    });
  });

  describe('Opportunities', () => {
    let eastOnly: string;
    let nationwide: string;
    let expired: string;

    it('farmers cannot post (403); bad payloads are rejected (400)', async () => {
      expect((await request(app).post('/api/opportunities').set(auth(east.token)).send({ title: 'x', type: 'other', description: 'y' })).status).to.equal(403);
      expect((await request(app).post('/api/opportunities').set(auth(admin.token)).send({ title: 'x', type: 'nope', description: 'y' })).status).to.equal(400);
      expect((await request(app).post('/api/opportunities').set(auth(admin.token)).send({ title: 'x', type: 'other', description: 'y', link: 'javascript:alert(1)' })).status).to.equal(400);
    });

    it('agent posts a district opportunity and farmers there are notified', async () => {
      const res = await request(app).post('/api/opportunities').set(auth(agent.token)).send({
        title: 'Test exporter needs 2 t Hass', type: 'buyer_demand', description: 'Grade A, collected at farm gate',
        district: 'Rwamagana', quantity_kg: 2000, price_per_kg: 600, min_grade: 'grade_a',
        deadline: new Date(Date.now() + 7 * 864e5).toISOString(),
      });
      expect(res.status, JSON.stringify(res.body)).to.equal(201);
      eastOnly = res.body.data.id;
      opportunityIds.push(eastOnly);
      expect(res.body.data.province).to.equal('Eastern Province');
      expect(res.body.data.farmers_notified).to.be.greaterThan(0);
      const n = await prisma.notification.count({ where: { recipient_id: east.id, related_entity_id: eastOnly } });
      expect(n).to.equal(1);
      const nWest = await prisma.notification.count({ where: { recipient_id: west.id, related_entity_id: eastOnly } });
      expect(nWest).to.equal(0);

      const nat = await request(app).post('/api/opportunities').set(auth(admin.token))
        .send({ title: 'Test GAP certification grant', type: 'grant_funding', description: 'Nationwide', notify: false });
      nationwide = nat.body.data.id;
      opportunityIds.push(nationwide);
      const old = await prisma.opportunity.create({
        data: { title: 'Test expired', type: 'other', description: 'old', created_by: admin.id, deadline: new Date(Date.now() - 3 * 864e5) },
      });
      expired = old.id;
      opportunityIds.push(expired);
    });

    it('farmers only see open, unexpired opportunities for their area or nationwide', async () => {
      const e = await request(app).get('/api/opportunities?limit=100').set(auth(east.token));
      const eIds = e.body.data.map((o: any) => o.id);
      expect(eIds).to.include.members([eastOnly, nationwide]);
      expect(eIds).to.not.include(expired);

      const w = await request(app).get('/api/opportunities?limit=100').set(auth(west.token));
      const wIds = w.body.data.map((o: any) => o.id);
      expect(wIds).to.include(nationwide);
      expect(wIds).to.not.include(eastOnly);
      expect((await request(app).get(`/api/opportunities/${eastOnly}`).set(auth(west.token))).status).to.equal(404);
    });

    it('farmer expresses interest; poster is notified once and sees the farmer', async () => {
      const first = await request(app).post(`/api/opportunities/${eastOnly}/interest`).set(auth(east.token)).send({ quantity_kg: 300, message: 'Ready next week' });
      expect(first.status, JSON.stringify(first.body)).to.equal(201);
      const again = await request(app).post(`/api/opportunities/${eastOnly}/interest`).set(auth(east.token)).send({ quantity_kg: 350 });
      expect(again.status).to.equal(200);
      const notes = await prisma.notification.count({ where: { recipient_id: agent.id, related_entity_id: eastOnly } });
      expect(notes).to.equal(1);

      const out = await request(app).post(`/api/opportunities/${eastOnly}/interest`).set(auth(west.token)).send({});
      expect(out.status).to.equal(404);

      const list = await request(app).get(`/api/opportunities/${eastOnly}/interests`).set(auth(agent.token));
      expect(list.status).to.equal(200);
      expect(list.body.data).to.have.length(1);
      expect(list.body.data[0].quantity_kg).to.equal(350);
      expect(list.body.data[0].farmer.id).to.equal(east.id);

      const mine = await request(app).get(`/api/opportunities/${eastOnly}`).set(auth(east.token));
      expect(mine.body.data.my_interest.quantity_kg).to.equal(350);
      expect(mine.body.data.interest_count).to.equal(1);
    });

    it('agents cannot edit opportunities they did not post; closing hides it from farmers', async () => {
      expect((await request(app).put(`/api/opportunities/${nationwide}`).set(auth(agent.token)).send({ status: 'closed' })).status).to.equal(403);
      expect((await request(app).put(`/api/opportunities/${eastOnly}`).set(auth(agent.token)).send({ status: 'closed' })).status).to.equal(200);
      const e = await request(app).get('/api/opportunities?limit=100').set(auth(east.token));
      expect(e.body.data.map((o: any) => o.id)).to.not.include(eastOnly);
      expect((await request(app).delete(`/api/opportunities/${eastOnly}/interest`).set(auth(east.token))).status).to.equal(200);
    });

    it('insights endpoint answers for a farmer', async () => {
      const res = await request(app).get('/api/opportunities/insights').set(auth(east.token));
      expect(res.status).to.equal(200);
      expect(res.body.data.district).to.equal('Rwamagana');
      expect(res.body.data.insights).to.be.an('array');
    });
  });

  describe('Harvest summary by month', () => {
    it('returns the same figures per month and filters totals by month', async () => {
      const farm = await prisma.farm.findFirstOrThrow({ where: { farmer_id: east.id } });
      const mk = (date: string, kg: number, status: any, value?: number) => prisma.harvestLot.create({
        data: {
          lot_code: `AVO-TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, farm_id: farm.id, farmer_id: east.id,
          harvest_date: new Date(date), quantity_kg: kg, status, total_value: value, price_per_kg: value ? value / kg : undefined,
        },
      });
      await mk('2025-03-05T00:00:00Z', 100, 'sold', 50000);
      await mk('2025-03-20T00:00:00Z', 50, 'rejected');
      await mk('2025-07-01T00:00:00Z', 200, 'recorded');

      const year = await request(app).get('/api/harvest-lots/summary?year=2025').set(auth(east.token));
      expect(year.status, JSON.stringify(year.body)).to.equal(200);
      expect(year.body.data.total_kg).to.equal(350);
      expect(year.body.data.by_month).to.have.length(12);
      const march = year.body.data.by_month.find((m: any) => m.month === '2025-03');
      expect(march).to.include({ lots: 2, total_kg: 150, sold_kg: 100, revenue: 50000, rejected_kg: 50, average_price_per_kg: 500 });
      expect(year.body.data.by_month.find((m: any) => m.month === '2025-01')).to.include({ lots: 0, total_kg: 0 });

      const m = await request(app).get('/api/harvest-lots/summary?year=2025&month=7').set(auth(east.token));
      expect(m.body.data.total_kg).to.equal(200);
      expect(m.body.data.total_lots).to.equal(1);

      const recent = await request(app).get('/api/harvest-lots/summary').set(auth(east.token));
      expect(recent.body.data.by_month).to.have.length(12);

      expect((await request(app).get('/api/harvest-lots/summary?month=13').set(auth(east.token))).status).to.equal(400);

      // Another farmer's monthly numbers never include these lots.
      const other = await request(app).get('/api/harvest-lots/summary?year=2025').set(auth(west.token));
      expect(other.body.data.by_month.find((x: any) => x.month === '2025-03').lots).to.equal(0);
    });
  });
  describe('Farmer-side regressions', () => {
    it('saving the profile with a blank tree count stores 0 instead of failing', async () => {
      const res = await request(app).put('/api/farmer-information/me').set(auth(east.token)).send({ tree_count: null, farm_size: 1.5 });
      expect(res.status, JSON.stringify(res.body)).to.equal(200);
      const p = await prisma.farmerProfile.findUniqueOrThrow({ where: { user_id: east.id } });
      expect(p.tree_count).to.equal(0);
    });

    it('saving land without changing it keeps the agent verification; moving the point clears it', async () => {
      const farm = await prisma.farm.findFirstOrThrow({ where: { farmer_id: east.id } });
      await prisma.farm.update({ where: { id: farm.id }, data: { latitude: -1.95, longitude: 30.44, land_use: 'agriculture', land_verified_at: new Date() } });
      const same = await request(app).put(`/api/land/farms/${farm.id}`).set(auth(east.token)).send({ latitude: -1.95, longitude: 30.44, land_use: 'agriculture' });
      expect(same.status, JSON.stringify(same.body)).to.equal(200);
      expect((await prisma.farm.findUniqueOrThrow({ where: { id: farm.id } })).land_verified_at).to.not.equal(null);
      const moved = await request(app).put(`/api/land/farms/${farm.id}`).set(auth(east.token)).send({ latitude: -1.96, longitude: 30.45 });
      expect(moved.status).to.equal(200);
      expect((await prisma.farm.findUniqueOrThrow({ where: { id: farm.id } })).land_verified_at).to.equal(null);
    });

    it('PUT /farms/:id rejects an unknown status and coordinates outside Rwanda', async () => {
      const farm = await prisma.farm.findFirstOrThrow({ where: { farmer_id: east.id } });
      expect((await request(app).put(`/api/farms/${farm.id}`).set(auth(east.token)).send({ status: 'flying' })).status).to.equal(400);
      expect((await request(app).put(`/api/farms/${farm.id}`).set(auth(east.token)).send({ latitude: 48.85, longitude: 2.35 })).status).to.equal(400);
    });

    it("farm history only lists the farm owner's own service requests", async () => {
      const farmE = await prisma.farm.findFirstOrThrow({ where: { farmer_id: east.id } });
      const sr = await prisma.serviceRequest.create({
        data: {
          farmer_id: west.id, service_type: 'harvest', title: 'Someone else', description: 'x',
          request_number: `SR-TEST-${Date.now()}`, location: { farm_name: farmE.farmName },
        },
      });
      try {
        const res = await request(app).get(`/api/farms/${farmE.id}/history`).set(auth(east.token));
        expect(res.status, JSON.stringify(res.body)).to.equal(200);
        const ids = JSON.stringify(res.body.data);
        expect(ids).to.not.include(sr.id);
      } finally {
        await prisma.serviceRequest.delete({ where: { id: sr.id } });
      }
    });

    it('checkout with a plain-text address stores the name, phone and district shops need', async () => {
      const supplier = await prisma.supplier.create({
        data: { name: 'Test supplier', category: 'seeds_supplier', contact_person: 'T', email: `sup-${Date.now()}@example.com`, phone: '+250788000000', address: {} },
      });
      const product = await prisma.product.create({
        data: { name: 'Test crate', category: 'seeds', price: 1000, unit: 'kg', supplier_id: supplier.id, quantity: 10, status: 'available' } as any,
      });
      let orderId: string | undefined;
      try {
        const add = await request(app).post('/api/cart/items').set(auth(east.token)).send({ product_id: product.id, quantity: 1 });
        expect(add.status, JSON.stringify(add.body)).to.equal(201);
        const res = await request(app).post('/api/cart/checkout').set(auth(east.token)).send({ shipping_address: 'Near Musha sector office', payment_method: 'cash' });
        expect(res.status, JSON.stringify(res.body)).to.equal(201);
        orderId = res.body.data.order.id;
        const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
        expect(order.shipping_address).to.deep.include({ full_name: 'Farmer near-east', street_address: 'Near Musha sector office', district: 'Rwamagana' });
        expect((order.shipping_address as any).phone).to.be.a('string').and.not.equal('');
      } finally {
        if (orderId) {
          await prisma.transaction.deleteMany({ where: { order_id: orderId } }).catch(() => undefined);
          await prisma.orderItem.deleteMany({ where: { order_id: orderId } });
          await prisma.order.delete({ where: { id: orderId } });
        }
        await prisma.stockHistory.deleteMany({ where: { product_id: product.id } }).catch(() => undefined);
        await prisma.cartItem.deleteMany({ where: { product_id: product.id } });
        const me = await prisma.user.findUniqueOrThrow({ where: { id: east.id }, select: { email: true } });
        await prisma.customer.deleteMany({ where: { email: { equals: me.email, mode: 'insensitive' } } }).catch(() => undefined);
        await prisma.product.delete({ where: { id: product.id } });
        await prisma.supplier.delete({ where: { id: supplier.id } });
      }
    });
  });
});
