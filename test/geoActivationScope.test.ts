import { expect } from 'chai';
import { describe, it, before, after } from 'mocha';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../src/server';
import { prisma } from '../src/lib/prisma';
import { locate } from '../src/services/rwandaBoundaries';

/**
 * Official geography (boundaries, locate, divisions, per-area stats), staff
 * completing farmer details, bulk invites, VBA territory limits and the
 * OpenStreetMap facility import (no network: only the save step is exercised).
 */

const uniq = Date.now().toString().slice(-6);
const phone = (n: number) => `+25073${uniq}${n}`;

async function login(email: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return { token: res.body.data.token as string, id: res.body.data.user.id as string };
}

describe('Geography, staff farmer edits and VBA territory (in-process)', function () {
  this.timeout(60000);
  let admin: { token: string; id: string };
  let gasaboVba: { token: string; id: string };
  let inGasabo: string; // farmer in Gasabo
  let inMusanze: string; // farmer in Musanze
  const created: string[] = [];

  async function farmer(name: string, district: string, sector: string, n: number) {
    const province = district === 'Musanze' ? 'Northern Province' : 'Kigali City';
    const u = await prisma.user.create({
      data: {
        email: `geo-${uniq}-${n}@survey-import.local`, password: 'x', full_name: name, phone: n === 3 ? null : phone(n), role: 'farmer',
        credentials_claimed: false,
        farmer_profile: { create: { province, district, farm_province: province, farm_district: district, farm_sector: sector } },
        farms: { create: { farmName: `${name} farm`, farmerName: name, location: { province, district, sector }, farm_size: 1, tree_count: 50, varieties: ['Hass'], planting_date: new Date('2020-01-01'), latitude: -1.94, longitude: 30.06 } },
      },
    });
    created.push(u.id);
    return u.id;
  }

  before(async () => {
    admin = await login('admin@dashboardavocado.com', 'admin123456');
    const vba = await prisma.user.create({
      data: {
        email: `gasabo-vba-${uniq}@example.com`, password: await bcrypt.hash('VbaPass123!', 8), full_name: 'Gasabo VBA', role: 'agent', status: 'active', credentials_claimed: true,
        agent_profile: { create: { agentId: `VBA-${uniq}`, territory: [{ province: 'Kigali City', district: 'Gasabo' }] } },
      },
    });
    created.push(vba.id);
    gasaboVba = await login(vba.email, 'VbaPass123!');
    inGasabo = await farmer('Gasabo Farmer', 'Gasabo', 'Remera', 1);
    inMusanze = await farmer('Musanze Farmer', 'Musanze', 'Muhoza', 2);
    await farmer('No Phone Farmer', 'Gasabo', 'Kimironko', 3);
  });

  after(async () => {
    await prisma.facility.deleteMany({ where: { external_id: { startsWith: `osm:node/9${uniq}` } } });
    await prisma.farm.deleteMany({ where: { farmer_id: { in: created } } });
    await prisma.farmerProfile.deleteMany({ where: { user_id: { in: created } } });
    await prisma.agentProfile.deleteMany({ where: { user_id: { in: created } } });
    await prisma.user.deleteMany({ where: { id: { in: created } } });
  });

  describe('Official geography', () => {
    it('locates GPS points in the official province / district / sector / cell', () => {
      expect(locate(-1.9441, 30.0619)).to.deep.include({ province: 'Kigali City', district: 'Nyarugenge' });
      expect(locate(-1.4995, 29.6347)).to.deep.include({ province: 'Northern Province', district: 'Musanze' });
      expect(locate(0, 0).district).to.equal(null);
    });

    it('serves boundaries and a locate endpoint', async () => {
      const d = await request(app).get('/api/geography/boundaries/district').set('Authorization', `Bearer ${gasaboVba.token}`);
      expect(d.status).to.equal(200);
      expect(d.body.data.features).to.have.length(30);
      expect(d.body.data.attribution).to.match(/geoBoundaries/);
      const s = await request(app).get('/api/geography/boundaries/sector?district=Gasabo').set('Authorization', `Bearer ${gasaboVba.token}`);
      expect(s.body.data.features).to.have.length(15);
      const cellsAll = await request(app).get('/api/geography/boundaries/cell').set('Authorization', `Bearer ${gasaboVba.token}`);
      expect(cellsAll.status).to.equal(400);
      const at = await request(app).get('/api/geography/locate?lat=-1.4995&lng=29.6347').set('Authorization', `Bearer ${gasaboVba.token}`);
      expect(at.body.data).to.include({ district: 'Musanze', inside_rwanda: true });
    });

    it('loads the official divisions once (admin only)', async () => {
      const denied = await request(app).post('/api/geography/sync').set('Authorization', `Bearer ${gasaboVba.token}`);
      expect(denied.status).to.equal(403);
      const res = await request(app).post('/api/geography/sync').set('Authorization', `Bearer ${admin.token}`);
      expect(res.status, JSON.stringify(res.body)).to.equal(200);
      expect(res.body.data.districts.total).to.equal(30);
      expect(res.body.data.sectors.total).to.equal(416);
      expect(res.body.data.villages.total).to.be.above(14000);
      const again = await request(app).post('/api/geography/sync').set('Authorization', `Bearer ${admin.token}`);
      expect(again.body.data.villages.added).to.equal(0);
    });

    it('per-area stats only count the VBA’s own territory and flag GPS outside the area', async () => {
      const res = await request(app).get('/api/geography/stats').set('Authorization', `Bearer ${gasaboVba.token}`);
      expect(res.status).to.equal(200);
      const areas = res.body.data.items.map((r: any) => r.area);
      expect(areas).to.include('Gasabo');
      expect(areas).to.not.include('Musanze');
      // the test farms sit at a Nyarugenge point while recorded in Gasabo
      expect(res.body.data.items.find((r: any) => r.area === 'Gasabo').gps_elsewhere).to.be.at.least(1);
    });
  });

  describe('Staff complete farmer details; VBAs stay in their area', () => {
    it('a VBA sees only farmers in their territory', async () => {
      const list = await request(app).get('/api/activation/farmers?limit=100&search=Farmer').set('Authorization', `Bearer ${gasaboVba.token}`);
      const ids = list.body.data.map((f: any) => f.id);
      expect(ids).to.include(inGasabo);
      expect(ids).to.not.include(inMusanze);
      const other = await request(app).get(`/api/activation/farmers/${inMusanze}`).set('Authorization', `Bearer ${gasaboVba.token}`);
      expect(other.status).to.equal(403);
      const edit = await request(app).patch(`/api/activation/farmers/${inMusanze}`).set('Authorization', `Bearer ${gasaboVba.token}`).send({ gender: 'Male' });
      expect(edit.status).to.equal(403);
    });

    it('lets the VBA add a missing phone and details, one phone per farmer', async () => {
      const noPhone = await prisma.user.findFirst({ where: { email: `geo-${uniq}-3@survey-import.local` } });
      const taken = await request(app).patch(`/api/activation/farmers/${noPhone!.id}`).set('Authorization', `Bearer ${gasaboVba.token}`).send({ phone: phone(1) });
      expect(taken.status).to.equal(409);
      const res = await request(app).patch(`/api/activation/farmers/${noPhone!.id}`).set('Authorization', `Bearer ${gasaboVba.token}`)
        .send({ phone: `073${uniq}3`, national_id: `11990800${uniq}77`, gender: 'Female', age: 44, farm_district: 'gasabo', farm_sector: 'Kimironko' });
      expect(res.status, JSON.stringify(res.body)).to.equal(200);
      expect(res.body.data.phone).to.equal(phone(3));
      expect(res.body.data.farmer_profile).to.include({ id_number: `11990800${uniq}77`, gender: 'Female', age: 44, farm_district: 'Gasabo' });
      const bad = await request(app).patch(`/api/activation/farmers/${noPhone!.id}`).set('Authorization', `Bearer ${gasaboVba.token}`).send({ national_id: '123' });
      expect(bad.status).to.equal(400);
    });

    it('invites several selected farmers at once, only those in the VBA’s area', async () => {
      const dry = await request(app).post('/api/activation/invites').set('Authorization', `Bearer ${gasaboVba.token}`)
        .send({ farmer_ids: [inGasabo, inMusanze], resend: true, dry_run: true });
      expect(dry.status).to.equal(200);
      expect(dry.body.data.recipients).to.equal(1); // Musanze is outside the area
    });

    it('scopes survey records and import batches for VBAs', async () => {
      const surveys = await request(app).get('/api/surveys?limit=100').set('Authorization', `Bearer ${gasaboVba.token}`);
      expect(surveys.status).to.equal(200);
      expect(surveys.body.data.every((s: any) => s.district === 'Gasabo' || s.farmer_id)).to.equal(true);
      const batches = await request(app).get('/api/surveys/import/batches').set('Authorization', `Bearer ${gasaboVba.token}`);
      expect(batches.body.data).to.deep.equal([]); // only their own uploads
    });
  });

  describe('OpenStreetMap facilities', () => {
    it('rejects unknown types and non-admins', async () => {
      const vba = await request(app).post('/api/facilities/osm/search').set('Authorization', `Bearer ${gasaboVba.token}`).send({ types: ['market'] });
      expect(vba.status).to.equal(403);
      const bad = await request(app).post('/api/facilities/osm/search').set('Authorization', `Bearer ${admin.token}`).send({ types: ['casino'] });
      expect(bad.status).to.equal(400);
    });

    it('saves picked places once, with the district from the official boundaries', async () => {
      const item = { external_id: `osm:node/9${uniq}`, name: 'Kimironko Market', type: 'market', latitude: -1.9497, longitude: 30.1263, district: 'Musanze' };
      const res = await request(app).post('/api/facilities/osm/import').set('Authorization', `Bearer ${admin.token}`).send({ items: [item] });
      expect(res.status, JSON.stringify(res.body)).to.equal(201);
      expect(res.body.data.created).to.equal(1);
      const f = await prisma.facility.findUnique({ where: { external_id: item.external_id } });
      expect(f).to.include({ district: 'Gasabo', source: 'osm' }); // client's "Musanze" ignored
      const again = await request(app).post('/api/facilities/osm/import').set('Authorization', `Bearer ${admin.token}`).send({ items: [item] });
      expect(again.body.data).to.include({ created: 0, skipped_already_imported: 1 });
    });
  });
});
