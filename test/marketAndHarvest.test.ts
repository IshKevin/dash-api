import { expect } from 'chai';
import { describe, it, before, after } from 'mocha';
import request from 'supertest';
import app from '../src/server';
import { prisma } from '../src/lib/prisma';

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

async function registerFarmer(tag: string) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      email: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
      password: 'TestPass123!',
      full_name: `Farmer ${tag}`,
      phone: '+250788200001',
      role: 'farmer',
      gender: 'Female',
      province: 'Eastern Province',
      district: 'Rwamagana',
      sector: 'Musha',
      farm_size: 2,
      avocado_type: 'Hass',
      tree_count: 80,
    });
  expect(res.status, JSON.stringify(res.body)).to.equal(201);
  return { token: res.body.data.token as string, id: res.body.data.user.id as string };
}

async function login(email: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status, JSON.stringify(res.body)).to.equal(200);
  return { token: res.body.data.token as string, id: res.body.data.user.id as string };
}

describe('Market prices, harvest lots & traceability, public files (in-process)', function () {
  this.timeout(30000);

  const userIds: string[] = [];
  const priceIds: string[] = [];
  let admin: { token: string; id: string };
  let agent: { token: string; id: string };
  let farmerA: { token: string; id: string };
  let farmerB: { token: string; id: string };
  let farmAId: string;
  let farmBId: string;

  before(async () => {
    admin = await login('admin@dashboardavocado.com', 'admin123456');
    agent = await login('agent@dashboardavocado.com', 'agent123456');
    farmerA = await registerFarmer('lot-a');
    farmerB = await registerFarmer('lot-b');
    userIds.push(farmerA.id, farmerB.id);
    farmAId = (await prisma.farm.findFirstOrThrow({ where: { farmer_id: farmerA.id } })).id;
    farmBId = (await prisma.farm.findFirstOrThrow({ where: { farmer_id: farmerB.id } })).id;
  });

  after(async () => {
    await prisma.marketPrice.deleteMany({ where: { id: { in: priceIds } } });
    await prisma.harvestLot.deleteMany({ where: { farmer_id: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { recipient_id: { in: userIds } } });
    await prisma.signature.deleteMany({ where: { signer_id: { in: userIds } } });
    await prisma.document.deleteMany({ where: { owner_id: { in: userIds } } });
    await prisma.farm.deleteMany({ where: { farmer_id: { in: userIds } } });
    await prisma.farmerProfile.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  // ── Market prices ──────────────────────────────────────────────────────────
  describe('Market prices', () => {
    it('rejects price creation by a farmer (403)', async () => {
      const res = await request(app)
        .post('/api/market-prices')
        .set('Authorization', `Bearer ${farmerA.token}`)
        .send({ price_per_kg: 400, province: 'Eastern Province', district: 'Rwamagana' });
      expect(res.status).to.equal(403);
    });

    it('validates the payload (400)', async () => {
      const res = await request(app)
        .post('/api/market-prices')
        .set('Authorization', `Bearer ${agent.token}`)
        .send({ price_per_kg: -5, province: 'Eastern Province', district: 'Rwamagana' });
      expect(res.status).to.equal(400);

      const res2 = await request(app)
        .post('/api/market-prices')
        .set('Authorization', `Bearer ${agent.token}`)
        .send({ price_per_kg: 400, province: 'Eastern Province', district: 'Rwamagana', price_type: 'barter' });
      expect(res2.status).to.equal(400);
    });

    it('lets an agent record a price, and anyone authenticated read it', async () => {
      const res = await request(app)
        .post('/api/market-prices')
        .set('Authorization', `Bearer ${agent.token}`)
        .send({ price_per_kg: 455, province: 'Southern Province', district: 'Nyaruguru', price_type: 'wholesale', variety: 'Hass' });
      expect(res.status, JSON.stringify(res.body)).to.equal(201);
      expect(res.body.data.recorded_by).to.equal(agent.id);
      priceIds.push(res.body.data.id);

      const list = await request(app)
        .get('/api/market-prices?district=Nyaruguru')
        .set('Authorization', `Bearer ${farmerA.token}`);
      expect(list.status).to.equal(200);
      expect(list.body.data).to.have.length(1);
      expect(list.body.data[0].price_per_kg).to.equal(455);
    });

    it('stores the official district/province/variety spelling and rejects mismatches', async () => {
      const ok = await request(app)
        .post('/api/market-prices')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ price_per_kg: 470, district: ' nyaruguru ', price_type: 'retail', variety: 'hass' });
      expect(ok.status, JSON.stringify(ok.body)).to.equal(201);
      priceIds.push(ok.body.data.id);
      expect(ok.body.data.district).to.equal('Nyaruguru');
      expect(ok.body.data.province).to.equal('Southern Province');
      expect(ok.body.data.variety).to.equal('Hass');

      const wrongProvince = await request(app)
        .post('/api/market-prices')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ price_per_kg: 470, province: 'Eastern Province', district: 'Huye' });
      expect(wrongProvince.status).to.equal(400);
      expect(wrongProvince.body.message).to.match(/Huye is in Southern Province/);

      const unknown = await request(app)
        .post('/api/market-prices')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ price_per_kg: 470, province: 'Eastern Province', district: 'Atlantis' });
      expect(unknown.status).to.equal(400);

      // Filters ignore case.
      const list = await request(app)
        .get('/api/market-prices?district=NYARUGURU&variety=HASS&price_type=retail')
        .set('Authorization', `Bearer ${farmerA.token}`);
      expect(list.body.data.map((p: any) => p.id)).to.include(ok.body.data.id);
    });

    it('bulk import is admin-only and returns latest per district/type', async () => {
      const prices = [
        { price_per_kg: 300, province: 'Southern Province', district: 'Nyaruguru', price_type: 'farm_gate', price_date: new Date(Date.now() - 14 * 864e5).toISOString() },
        { price_per_kg: 350, province: 'Southern Province', district: 'Nyaruguru', price_type: 'farm_gate', price_date: new Date(Date.now() - 864e5).toISOString() },
      ];
      const denied = await request(app).post('/api/market-prices/bulk').set('Authorization', `Bearer ${agent.token}`).send({ prices });
      expect(denied.status).to.equal(403);

      const ok = await request(app).post('/api/market-prices/bulk').set('Authorization', `Bearer ${admin.token}`).send({ prices });
      expect(ok.status, JSON.stringify(ok.body)).to.equal(201);
      expect(ok.body.data.created).to.equal(2);
      const created = await prisma.marketPrice.findMany({ where: { district: 'Nyaruguru' }, select: { id: true } });
      created.forEach((p) => priceIds.includes(p.id) || priceIds.push(p.id));

      const latest = await request(app)
        .get('/api/market-prices/latest?district=Nyaruguru')
        .set('Authorization', `Bearer ${farmerA.token}`);
      expect(latest.status).to.equal(200);
      const farmGate = latest.body.data.filter((p: any) => p.price_type === 'farm_gate');
      expect(farmGate).to.have.length(1);
      expect(farmGate[0].price_per_kg).to.equal(350); // most recent wins
    });

    it('returns summary and weekly trends', async () => {
      const summary = await request(app).get('/api/market-prices/summary').set('Authorization', `Bearer ${farmerA.token}`);
      expect(summary.status).to.equal(200);
      expect(summary.body.data.summary.map((s: any) => s.price_type)).to.include.members(['farm_gate', 'wholesale', 'retail', 'export']);

      const trends = await request(app)
        .get('/api/market-prices/trends?district=Nyaruguru&price_type=farm_gate&interval=week')
        .set('Authorization', `Bearer ${farmerA.token}`);
      expect(trends.status).to.equal(200);
      expect(trends.body.data.interval).to.equal('week');
      expect(trends.body.data.series.length).to.be.at.least(2);
      for (const point of trends.body.data.series) expect(point.period).to.match(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('stops an agent editing a price they did not record; admin can delete', async () => {
      const adminOwned = await prisma.marketPrice.findFirstOrThrow({ where: { district: 'Nyaruguru', recorded_by: admin.id } });
      const res = await request(app)
        .put(`/api/market-prices/${adminOwned.id}`)
        .set('Authorization', `Bearer ${agent.token}`)
        .send({ price_per_kg: 1 });
      expect(res.status).to.equal(403);

      const del = await request(app).delete(`/api/market-prices/${adminOwned.id}`).set('Authorization', `Bearer ${admin.token}`);
      expect(del.status).to.equal(200);
      expect(await prisma.marketPrice.findUnique({ where: { id: adminOwned.id } })).to.be.null;
    });
  });

  // ── Harvest lots ───────────────────────────────────────────────────────────
  describe('Harvest lots & traceability', () => {
    let lotId: string;
    let lotCode: string;

    it('lists only the farmer\'s own farms as options', async () => {
      const res = await request(app).get('/api/harvest-lots/farm-options').set('Authorization', `Bearer ${farmerA.token}`);
      expect(res.status).to.equal(200);
      expect(res.body.data.map((f: any) => f.id)).to.deep.equal([farmAId]);
      const staff = await request(app).get('/api/harvest-lots/farm-options').set('Authorization', `Bearer ${agent.token}`);
      expect(staff.body.data.map((f: any) => f.id)).to.include.members([farmAId, farmBId]);
    });

    it('lets a farmer record a lot on their own farm', async () => {
      const res = await request(app)
        .post('/api/harvest-lots')
        .set('Authorization', `Bearer ${farmerA.token}`)
        .send({ farm_id: farmAId, harvest_date: new Date().toISOString(), quantity_kg: 500, crates: 20, grade: 'grade_a' });
      expect(res.status, JSON.stringify(res.body)).to.equal(201);
      expect(res.body.data.lot_code).to.match(/^AVO-\d{8}-[0-9A-F]{6}$/);
      expect(res.body.data.status).to.equal('recorded');
      expect(res.body.data.farmer_id).to.equal(farmerA.id);
      lotId = res.body.data.id;
      lotCode = res.body.data.lot_code;
    });

    it("forbids recording on another farmer's farm and reading another farmer's lot", async () => {
      const res = await request(app)
        .post('/api/harvest-lots')
        .set('Authorization', `Bearer ${farmerB.token}`)
        .send({ farm_id: farmAId, harvest_date: new Date().toISOString(), quantity_kg: 10 });
      expect(res.status).to.equal(403);

      const read = await request(app).get(`/api/harvest-lots/${lotId}`).set('Authorization', `Bearer ${farmerB.token}`);
      expect(read.status).to.equal(403);

      const list = await request(app).get('/api/harvest-lots').set('Authorization', `Bearer ${farmerB.token}`);
      expect(list.status).to.equal(200);
      expect(list.body.data.map((l: any) => l.id)).to.not.include(lotId);
    });

    it('validates quantity and future dates', async () => {
      const bad = await request(app)
        .post('/api/harvest-lots')
        .set('Authorization', `Bearer ${farmerB.token}`)
        .send({ farm_id: farmBId, harvest_date: new Date().toISOString(), quantity_kg: 0 });
      expect(bad.status).to.equal(400);
      const future = await request(app)
        .post('/api/harvest-lots')
        .set('Authorization', `Bearer ${farmerB.token}`)
        .send({ farm_id: farmBId, harvest_date: new Date(Date.now() + 10 * 864e5).toISOString(), quantity_kg: 10 });
      expect(future.status).to.equal(400);
    });

    it('cannot be sold before verification (409), and farmers cannot verify (403)', async () => {
      const sell = await request(app)
        .post(`/api/harvest-lots/${lotId}/sell`)
        .set('Authorization', `Bearer ${farmerA.token}`)
        .send({ buyer_name: 'X', price_per_kg: 500 });
      expect(sell.status).to.equal(409);

      const verify = await request(app).post(`/api/harvest-lots/${lotId}/verify`).set('Authorization', `Bearer ${farmerA.token}`).send({});
      expect(verify.status).to.equal(403);
    });

    it('refuses export grade when dry matter is below the threshold', async () => {
      const res = await request(app)
        .post(`/api/harvest-lots/${lotId}/verify`)
        .set('Authorization', `Bearer ${agent.token}`)
        .send({ grade: 'export', dry_matter_pct: 19.5 });
      expect(res.status).to.equal(400);
      expect(res.body.message).to.match(/dry matter/i);
    });

    it('verifies, sells and delivers the lot, notifying the farmer', async () => {
      const verify = await request(app)
        .post(`/api/harvest-lots/${lotId}/verify`)
        .set('Authorization', `Bearer ${agent.token}`)
        .send({ grade: 'export', dry_matter_pct: 24.2, quantity_kg: 480 });
      expect(verify.status, JSON.stringify(verify.body)).to.equal(200);
      expect(verify.body.data.status).to.equal('verified');
      expect(verify.body.data.maturity_passed).to.equal(true);
      expect(verify.body.data.quantity_kg).to.equal(480);
      expect(verify.body.data.verified_by).to.equal(agent.id);

      const notes = await prisma.notification.findMany({ where: { recipient_id: farmerA.id, related_entity_id: lotId } });
      expect(notes.some((n) => /verified/i.test(n.title))).to.equal(true);

      const sell = await request(app)
        .post(`/api/harvest-lots/${lotId}/sell`)
        .set('Authorization', `Bearer ${farmerA.token}`)
        .send({ buyer_name: 'Kigali Fresh Exports', price_per_kg: 800 });
      expect(sell.status).to.equal(200);
      expect(sell.body.data.total_value).to.equal(384000);

      const edit = await request(app).put(`/api/harvest-lots/${lotId}`).set('Authorization', `Bearer ${agent.token}`).send({ quantity_kg: 1 });
      expect(edit.status).to.equal(409);

      const deliver = await request(app).post(`/api/harvest-lots/${lotId}/deliver`).set('Authorization', `Bearer ${farmerA.token}`);
      expect(deliver.status).to.equal(200);
      expect(deliver.body.data.status).to.equal('delivered');
    });

    it('rejection requires a reason', async () => {
      const created = await request(app)
        .post('/api/harvest-lots')
        .set('Authorization', `Bearer ${agent.token}`)
        .send({ farm_id: farmBId, harvest_date: new Date().toISOString(), quantity_kg: 50 });
      expect(created.status).to.equal(201);
      expect(created.body.data.farmer_id).to.equal(farmerB.id); // recorded on behalf of the farm owner

      const noReason = await request(app).post(`/api/harvest-lots/${created.body.data.id}/reject`).set('Authorization', `Bearer ${agent.token}`).send({});
      expect(noReason.status).to.equal(400);
      const rejected = await request(app)
        .post(`/api/harvest-lots/${created.body.data.id}/reject`)
        .set('Authorization', `Bearer ${agent.token}`)
        .send({ reason: 'Immature fruit' });
      expect(rejected.status).to.equal(200);
      expect(rejected.body.data.status).to.equal('rejected');
    });

    it('summarises revenue for the farmer', async () => {
      const res = await request(app).get('/api/harvest-lots/summary').set('Authorization', `Bearer ${farmerA.token}`);
      expect(res.status).to.equal(200);
      expect(res.body.data.total_lots).to.equal(1);
      expect(res.body.data.revenue).to.equal(384000);
      expect(res.body.data.average_price_per_kg).to.equal(800);
    });

    it('generates a QR code pointing at the public trace page', async () => {
      const res = await request(app).get(`/api/harvest-lots/${lotId}/qr`).set('Authorization', `Bearer ${farmerA.token}`);
      expect(res.status).to.equal(200);
      expect(res.body.data.qr_code).to.match(/^data:image\/png;base64,/);
      expect(res.body.data.trace_url).to.match(new RegExp(`/trace/${lotCode}$`));
    });

    it('public trace lookup works without auth and leaks no personal or commercial data', async () => {
      const res = await request(app).get(`/api/traceability/${lotCode.toLowerCase()}`);
      expect(res.status).to.equal(200);
      expect(res.body.data.lot_code).to.equal(lotCode);
      expect(res.body.data.verified).to.equal(true);
      expect(res.body.data.origin.district).to.equal('Rwamagana');
      const body = JSON.stringify(res.body);
      for (const leaked of ['farmer', 'phone', 'buyer', 'price', 'total_value', 'Farmer lot-a']) {
        expect(body, `should not contain "${leaked}"`).to.not.include(leaked);
      }

      expect((await request(app).get('/api/traceability/not-a-code')).status).to.equal(400);
      expect((await request(app).get('/api/traceability/AVO-20200101-ABCDEF')).status).to.equal(404);
    });
  });

  // ── Public files via SeaweedFS ─────────────────────────────────────────────
  describe('Public files (object storage)', () => {
    it('uploads an image and serves it back through /api/files with cross-origin headers', async () => {
      const up = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${farmerA.token}`)
        .attach('file', PNG, { filename: 'pixel.png', contentType: 'image/png' });
      expect(up.status, JSON.stringify(up.body)).to.equal(200);
      expect(up.body.data.url).to.match(/\/api\/files\/public\/pixel-.*\.png$/);

      const path = new URL(up.body.data.url).pathname;
      const get = await request(app).get(path).buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(get.status, `${path} -> ${(get.body as Buffer).toString()}`).to.equal(200); // body shown on failure
      expect(get.headers['content-type']).to.equal('image/png');
      expect(get.headers['cross-origin-resource-policy']).to.equal('cross-origin');
      expect(Buffer.compare(get.body as Buffer, PNG)).to.equal(0);
    });

    it('returns 404 for missing files and 400 for traversal attempts', async () => {
      expect((await request(app).get('/api/files/public/does-not-exist.png')).status).to.equal(404);
      expect((await request(app).get('/api/files/public/..%2Fprivate%2Fx.pdf')).status).to.equal(400);
    });

    it('does not expose private/ objects through the public route', async () => {
      const res = await request(app).get('/api/files/private/anything.pdf');
      expect(res.status).to.equal(404); // no such route
    });
  });
});
