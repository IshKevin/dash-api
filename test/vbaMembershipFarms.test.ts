import { expect } from 'chai';
import { describe, it, before, after } from 'mocha';
import request from 'supertest';
import app from '../src/server';
import { prisma } from '../src/lib/prisma';
import { listSectors, normalizeLocation } from '../src/services/rwandaLocation';

const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function login(email: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status, JSON.stringify(res.body)).to.equal(200);
  return { token: res.body.data.token as string, id: res.body.data.user.id as string };
}

async function registerFarmer(tag: string, district: string, province: string, sector: string, phone: string) {
  const res = await request(app).post('/api/auth/register').send({
    email: `${tag}-${uniq()}@example.com`, password: 'TestPass123!', full_name: `Farmer ${tag}`, phone, role: 'farmer',
    gender: 'Male', province, district, sector, farm_size: 1, avocado_type: 'Hass', tree_count: 60,
  });
  expect(res.status, JSON.stringify(res.body)).to.equal(201);
  return { token: res.body.data.token as string, id: res.body.data.user.id as string };
}

describe('Rwanda locations, VBA territory, membership card, farms & harvest on behalf (in-process)', function () {
  this.timeout(30000);

  const userIds: string[] = [];
  let admin: { token: string; id: string };
  let vba: { token: string; id: string };
  let east: { token: string; id: string }; // Rwamagana / Musha
  let west: { token: string; id: string }; // Rusizi
  let eastPhone: string;

  before(async () => {
    admin = await login('admin@dashboardavocado.com', 'admin123456');
    // A fresh VBA with no area yet.
    const email = `vba-${uniq()}@example.com`;
    const created = await request(app).post('/api/users/agents').set(auth(admin.token))
      .send({ email, password: 'AgentPass123!', full_name: 'Test VBA', phone: '+250788300001' });
    expect(created.status, JSON.stringify(created.body)).to.be.oneOf([200, 201]);
    const vbaId = created.body.data.id;
    userIds.push(vbaId);
    vba = await login(email, created.body.data.default_password);

    eastPhone = `+25078${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
    east = await registerFarmer('vba-east', 'Rwamagana', 'Eastern Province', 'Musha', eastPhone);
    west = await registerFarmer('vba-west', 'Rusizi', 'Western Province', 'Kamembe', '+250788300003');
    userIds.push(east.id, west.id);
  });

  after(async () => {
    const sr = await prisma.serviceRequest.findMany({ where: { OR: [{ farmer_id: { in: userIds } }, { requested_by: { in: userIds } }] }, select: { id: true } });
    await prisma.serviceRequest.deleteMany({ where: { id: { in: sr.map((r) => r.id) } } });
    await prisma.notification.deleteMany({ where: { recipient_id: { in: userIds } } });
    await prisma.qRActivity.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.signature.deleteMany({ where: { signer_id: { in: userIds } } });
    await prisma.document.deleteMany({ where: { owner_id: { in: userIds } } });
    await prisma.farm.deleteMany({ where: { farmer_id: { in: userIds } } });
    await prisma.farmerProfile.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.agentProfile.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.cart.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  describe('rwanda package wrapper', () => {
    it('lists only the sectors of the chosen district (works around the package bug)', () => {
      const s = listSectors('Rwamagana');
      expect(s).to.have.length(14);
      expect(s).to.include('Musha');
      expect(s).to.not.include('Gashora'); // Bugesera
    });

    it('canonicalises spelling and rejects a sector from another district', () => {
      const [ok] = normalizeLocation({ district: 'rwamagana', sector: 'musha', cell: 'akabare' });
      expect(ok).to.deep.equal({ province: 'Eastern Province', district: 'Rwamagana', sector: 'Musha', cell: 'Akabare' });
      const [, err] = normalizeLocation({ district: 'Rwamagana', sector: 'Gashora' });
      expect(err).to.match(/not a sector of Rwamagana/);
      const [, err2] = normalizeLocation({ province: 'Western Province', district: 'Rwamagana' });
      expect(err2).to.match(/is in Eastern Province/);
    });
  });

  describe('VBA territory', () => {
    it('a VBA with no area sees no farmers', async () => {
      const res = await request(app).get('/api/users/farmers?limit=100').set(auth(vba.token));
      expect(res.status).to.equal(200);
      expect(res.body.data).to.have.length(0);
    });

    it('a VBA cannot set their own area; only admins can', async () => {
      await request(app).put('/api/agent-information/me').set(auth(vba.token)).send({ territory: [{ province: 'Western Province' }] });
      const t = await request(app).get(`/api/agent-information/${vba.id}/territory`).set(auth(vba.token));
      expect(t.body.data.territory).to.have.length(0);
      expect((await request(app).put(`/api/agent-information/${vba.id}/territory`).set(auth(vba.token)).send({ territory: [] })).status).to.equal(403);
    });

    it('rejects an invalid area', async () => {
      const res = await request(app).put(`/api/agent-information/${vba.id}/territory`).set(auth(admin.token))
        .send({ territory: [{ district: 'Rwamagana', sector: 'Gashora' }] });
      expect(res.status).to.equal(400);
    });

    it('admin assigns Musha sector; the VBA then sees the Musha farmer but not the Rusizi one', async () => {
      const res = await request(app).put(`/api/agent-information/${vba.id}/territory`).set(auth(admin.token))
        .send({ territory: [{ district: 'rwamagana', sector: 'musha' }] });
      expect(res.status, JSON.stringify(res.body)).to.equal(200);
      expect(res.body.data.territory).to.deep.equal([{ province: 'Eastern Province', district: 'Rwamagana', sector: 'Musha' }]);
      expect(res.body.data.farmers_covered).to.be.greaterThan(0);

      const list = await request(app).get('/api/users/farmers?limit=100').set(auth(vba.token));
      const ids = list.body.data.map((f: any) => f.id);
      expect(ids).to.include(east.id);
      expect(ids).to.not.include(west.id);

      expect((await request(app).get(`/api/farmer-information/${west.id}`).set(auth(vba.token))).status).to.equal(403);
      expect((await request(app).get(`/api/farmer-information/${east.id}`).set(auth(vba.token))).status).to.equal(200);

      const westFarm = await prisma.farm.findFirstOrThrow({ where: { farmer_id: west.id } });
      expect((await request(app).get(`/api/farms/${westFarm.id}`).set(auth(vba.token))).status).to.equal(403);
      const farms = await request(app).get('/api/farms?limit=100').set(auth(vba.token));
      expect(farms.body.data.every((f: any) => f.farmer_id !== west.id)).to.equal(true);
    });

    it('a VBA cannot book a harvest for a farmer outside their area', async () => {
      const res = await request(app).post('/api/service-requests/harvest').set(auth(vba.token))
        .send({ farmer_id: west.id, harvestDateFrom: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10), treesToHarvest: 10 });
      expect(res.status).to.equal(403);
    });
  });

  describe('Membership card', () => {
    let token: string;

    it('farmer gets a numbered card valid for one year with a QR code', async () => {
      const res = await request(app).get('/api/membership/me').set(auth(east.token));
      expect(res.status, JSON.stringify(res.body)).to.equal(200);
      const c = res.body.data;
      expect(c.member_code).to.match(/^ASR-\d{6}$/);
      expect(c.status).to.equal('active');
      const days = (new Date(c.valid_until).getTime() - new Date(c.valid_from).getTime()) / 864e5;
      expect(days).to.be.within(364, 367);
      expect(c.qr_code).to.match(/^data:image\/png;base64,/);
      expect(c.verify_url).to.match(/\/verify\/[A-Za-z0-9_-]+$/);
      token = c.verify_url.split('/').pop();
    });

    it('public verification shows the card but no phone or national ID', async () => {
      const res = await request(app).get(`/api/membership/verify/${token}`);
      expect(res.status).to.equal(200);
      expect(res.body.data.valid).to.equal(true);
      expect(res.body.data.full_name).to.equal('Farmer vba-east');
      const text = JSON.stringify(res.body.data);
      expect(text).to.not.include(eastPhone);
      expect(res.body.data).to.not.have.any.keys('phone', 'email', 'id_number', 'user_id');
      expect((await request(app).get('/api/membership/verify/not-a-real-token')).status).to.equal(404);
    });

    it('the old public scan endpoint no longer leaks personal data without staff login', async () => {
      const anon = await request(app).get(`/api/profile-access/scan/${token}`);
      expect(anon.status).to.equal(200);
      expect(JSON.stringify(anon.body.data)).to.not.include(eastPhone);
      const staff = await request(app).get(`/api/profile-access/scan/${token}`).set(auth(admin.token));
      expect(JSON.stringify(staff.body.data)).to.include(eastPhone);
    });

    it('shows expired, and renewal by the VBA extends it by a year from today', async () => {
      await prisma.farmerProfile.update({ where: { user_id: east.id }, data: { membership_valid_until: new Date(Date.now() - 864e5) } });
      expect((await request(app).get(`/api/membership/verify/${token}`)).body.data).to.include({ valid: false, status: 'expired' });
      expect((await request(app).post(`/api/membership/${west.id}/renew`).set(auth(vba.token))).status).to.equal(403);
      const res = await request(app).post(`/api/membership/${east.id}/renew`).set(auth(vba.token));
      expect(res.status, JSON.stringify(res.body)).to.equal(200);
      expect(res.body.data.status).to.equal('active');
      const days = (new Date(res.body.data.valid_until).getTime() - Date.now()) / 864e5;
      expect(days).to.be.within(364, 367);
    });
  });

  describe('Multiple farms', () => {
    it('a farmer adds a second farm with just a name and district; the location is validated', async () => {
      const bad = await request(app).post('/api/farms').set(auth(east.token))
        .send({ farm_name: 'Hill plot', location: { district: 'Rwamagana', sector: 'Kamembe' } });
      expect(bad.status).to.equal(400);
      const res = await request(app).post('/api/farms').set(auth(east.token))
        .send({ farm_name: 'Hill plot', tree_count: 25, location: { district: 'Rwamagana', sector: 'Muyumbu' } });
      expect(res.status, JSON.stringify(res.body)).to.equal(201);
      expect(res.body.data.location).to.include({ province: 'Eastern Province', sector: 'Muyumbu' });
      expect(res.body.data.varieties).to.deep.equal(['Hass']);
      const mine = await request(app).get('/api/farms/mine').set(auth(east.token));
      expect(mine.body.data).to.have.length(2);
    });

    it('a farmer cannot add a farm for someone else', async () => {
      const res = await request(app).post('/api/farms').set(auth(east.token)).send({ farm_name: 'X', farmer_id: west.id, location: { district: 'Rusizi' } });
      expect(res.status).to.equal(201);
      expect(res.body.data.farmer_id).to.equal(east.id); // farmer_id is ignored for farmers
      await prisma.farm.delete({ where: { id: res.body.data.id } });
    });
  });

  describe('Harvest requests with less typing', () => {
    const from = () => new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);

    it('only a farm and a start date: trees, crew, end date and location come from the farm', async () => {
      const farm = await prisma.farm.findFirstOrThrow({ where: { farmer_id: east.id, farmName: 'Hill plot' } });
      const res = await request(app).post('/api/service-requests/harvest').set(auth(east.token)).send({ farm_id: farm.id, harvestDateFrom: from() });
      expect(res.status, JSON.stringify(res.body)).to.equal(201);
      const r = res.body.data;
      expect(r.farm_id).to.equal(farm.id);
      expect(r.harvest_details.trees_to_harvest).to.equal(25);
      expect(r.harvest_details.workers_needed).to.equal(2);
      expect(r.location).to.include({ district: 'Rwamagana', sector: 'Muyumbu', farm_name: 'Hill plot' });
      const days = (new Date(r.harvest_details.harvest_date_to).getTime() - new Date(r.harvest_details.harvest_date_from).getTime()) / 864e5;
      expect(days).to.equal(4);
    });

    it('a farmer finds another farmer by phone and requests a harvest for them; both see it', async () => {
      const look = await request(app).get(`/api/service-requests/farmer-lookup?phone=0${eastPhone.slice(-9)}`).set(auth(west.token));
      expect(look.status, JSON.stringify(look.body)).to.equal(200);
      expect(look.body.data.id).to.equal(east.id);
      expect(look.body.data.farms.length).to.equal(2);
      expect(look.body.data).to.not.have.any.keys('phone', 'email');

      const res = await request(app).post('/api/service-requests/harvest').set(auth(west.token))
        .send({ for_farmer_id: east.id, farm_id: look.body.data.farms[0].id, harvestDateFrom: from() });
      expect(res.status, JSON.stringify(res.body)).to.equal(201);
      expect(res.body.data.farmer_id).to.equal(east.id);
      expect(res.body.data.requested_by).to.equal(west.id);

      const mineWest = await request(app).get(`/api/service-requests/farmer/${west.id}`).set(auth(west.token));
      expect(mineWest.body.data.map((r: any) => r.id)).to.include(res.body.data.id);
      const mineEast = await request(app).get(`/api/service-requests/farmer/${east.id}`).set(auth(east.token));
      expect(mineEast.body.data.map((r: any) => r.id)).to.include(res.body.data.id);
      expect(await prisma.notification.count({ where: { recipient_id: east.id, related_entity_id: res.body.data.id } })).to.equal(1);

      // A farm of a different farmer is refused.
      const westFarm = await prisma.farm.findFirstOrThrow({ where: { farmer_id: west.id } });
      expect((await request(app).post('/api/service-requests/harvest').set(auth(west.token))
        .send({ for_farmer_id: east.id, farm_id: westFarm.id, harvestDateFrom: from() })).status).to.equal(400);
    });

    it('a farmer requests a harvest for a neighbour who is not registered', async () => {
      const res = await request(app).post('/api/service-requests/harvest').set(auth(west.token)).send({
        harvestDateFrom: from(), treesToHarvest: 30,
        other_farmer: { name: 'Neighbour Jean', phone: '0788 000 111', location: { district: 'Rusizi', sector: 'Gihundwe' } },
      });
      expect(res.status, JSON.stringify(res.body)).to.equal(201);
      expect(res.body.data.farmer_info).to.include({ name: 'Neighbour Jean', registered: false });
      expect(res.body.data.location).to.include({ district: 'Rusizi', sector: 'Gihundwe' });
      expect(res.body.data.title).to.equal('Harvest request for Neighbour Jean');

      const bad = await request(app).post('/api/service-requests/harvest').set(auth(west.token)).send({
        harvestDateFrom: from(), treesToHarvest: 30, other_farmer: { name: 'X Y', phone: '0788000111', location: { district: 'Rusizi', sector: 'Musha' } },
      });
      expect(bad.status).to.equal(400);
    });
  });
});
