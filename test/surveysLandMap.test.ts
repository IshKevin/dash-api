import { expect } from 'chai';
import { describe, it, before, after } from 'mocha';
import request from 'supertest';
import * as XLSX from 'xlsx';
import app from '../src/server';
import { prisma } from '../src/lib/prisma';
import { TEMPLATE_HEADERS } from '../src/routes/surveys';

async function login(email: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return { token: res.body.data.token as string, id: res.body.data.user.id as string };
}

const uniq = Date.now().toString().slice(-6);
const nid = (n: number) => `11990800${uniq}${String(n).padStart(2, '0')}`;
const phoneLocal = (n: number) => `78${uniq.slice(-5)}${String(n).padStart(2, '0')}`; // 9 digits

function buildWorkbook(rows: Record<string, unknown>[]) {
  const aoa: unknown[][] = [TEMPLATE_HEADERS];
  for (const values of rows) {
    const cells = TEMPLATE_HEADERS.map(() => null as unknown);
    for (const [header, v] of Object.entries(values)) cells[TEMPLATE_HEADERS.lastIndexOf(header)] = v;
    aoa.push(cells);
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Survey');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('Survey import, land/UPI and farm map (in-process)', function () {
  this.timeout(60000);
  let admin: { token: string; id: string };
  let agent: { token: string; id: string };
  let existingFarmer: { token: string; id: string };
  const cleanupUserIds: string[] = [];
  let batchId: string;

  before(async () => {
    admin = await login('admin@dashboardavocado.com', 'admin123456');
    agent = await login('agent@dashboardavocado.com', 'agent123456');
    const reg = await request(app).post('/api/auth/register').send({
      email: `survey-existing-${uniq}@example.com`, password: 'TestPass123!', full_name: 'Existing Mukamana',
      phone: `+250${phoneLocal(9)}`, role: 'farmer', gender: 'Female', province: 'Eastern Province', district: 'Gatsibo',
      farm_size: 1, avocado_type: 'Hass', tree_count: 30,
    });
    existingFarmer = { token: reg.body.data.token, id: reg.body.data.user.id };
    cleanupUserIds.push(existingFarmer.id);
  });

  after(async () => {
    const batches = await prisma.surveyImportBatch.findMany({ where: { file_name: { startsWith: `survey-${uniq}` } }, select: { id: true, result: true } });
    for (const b of batches) for (const a of ((b.result as any)?.new_accounts ?? [])) cleanupUserIds.push(a.farmer_id);
    await prisma.farmSurvey.deleteMany({ where: { batch_id: { in: batches.map((b) => b.id) } } });
    await prisma.phoneVerificationCode.deleteMany({ where: { phone: { startsWith: '+25078' } } });
    await prisma.surveyImportBatch.deleteMany({ where: { id: { in: batches.map((b) => b.id) } } });
    await prisma.notification.deleteMany({ where: { recipient_id: { in: cleanupUserIds } } });
    await prisma.signature.deleteMany({ where: { signer_id: { in: cleanupUserIds } } });
    await prisma.document.deleteMany({ where: { owner_id: { in: cleanupUserIds } } });
    await prisma.farm.deleteMany({ where: { farmer_id: { in: cleanupUserIds } } });
    await prisma.farmerProfile.deleteMany({ where: { user_id: { in: cleanupUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  });

  describe('Survey import', () => {
    it('serves a template with the official headers', async () => {
      const res = await request(app).get('/api/surveys/template').set('Authorization', `Bearer ${agent.token}`)
        .buffer(true).parse((r, cb) => { const c: Buffer[] = []; r.on('data', (x: Buffer) => c.push(x)); r.on('end', () => cb(null, Buffer.concat(c))); });
      expect(res.status).to.equal(200);
      const wb = XLSX.read(res.body as Buffer, { type: 'buffer' });
      const header = (XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as unknown[][])[0];
      expect(header).to.have.length(TEMPLATE_HEADERS.length);
    });

    it('rejects non-spreadsheets and farmers', async () => {
      const bad = await request(app).post('/api/surveys/import/preview').set('Authorization', `Bearer ${agent.token}`)
        .attach('file', Buffer.from('hello'), 'notes.txt');
      expect(bad.status).to.be.oneOf([400, 500]);
      const farmer = await request(app).post('/api/surveys/import/preview').set('Authorization', `Bearer ${existingFarmer.token}`)
        .attach('file', buildWorkbook([]), 'x.xlsx');
      expect(farmer.status).to.equal(403);
    });

    it('previews: validates rows, matches existing farmers and flags issues', async () => {
      const file = buildWorkbook([
        { Province: 'East', District: 'Gatsibo', Enumerator: 'Alice', 'Date of Interview': '10/02/2025', 'consent(y/n)': 'y',
          province: 'Eastern Province', district: 'Gatsibo', sector: 'Kabarore', cell: 'Simbwa', village: 'Rugarama',
          'owner of the farm': 'Uwimana Claudine', 'Farmer contact': Number(phoneLocal(1)), sex: 'F', 'Farmer age': 41,
          national_id: nid(1), farm_area: 0.8, 'avocado varieties': 'Hass', Hass: 60, Fuerte: 5, 'ever harvested(y/n)': 'y',
          total_tons: 1.2, 'Price per avacado  at farm': 150, 'use of fertiliser(y/n)': 'y', 'Type of fertiliser used': 'NPK, Compost',
          'use of credits(y/n)': 'n', challenges: 'Pests, Low prices', 'date of planting': 2017, lat: -1.58, long: 30.45 },
        { district: 'Gatsibo', 'owner of the farm': 'Existing Mukamana', 'Farmer contact': `0${phoneLocal(9)}`, sex: 'female',
          Hass: 30, lat: 30.44, long: -1.6 /* swapped */ },
        { district: 'Kayonza', 'owner of the farm': 'No Consent', 'consent(y/n)': 'n' },
        { 'owner of the farm': 'No District' },
        { district: 'Gatsibo', 'owner of the farm': 'Uwimana Claudine (again)', national_id: nid(1) },
        { district: 'Rwamagana', 'owner of the farm': 'Habimana Eric', 'Farmer contact': Number(phoneLocal(2)), national_id: nid(2), Hass: 20, farm_area: 2500 },
      ]);
      const res = await request(app).post('/api/surveys/import/preview').set('Authorization', `Bearer ${agent.token}`)
        .attach('file', file, `survey-${uniq}.xlsx`);
      expect(res.status, JSON.stringify(res.body)).to.equal(201);
      const d = res.body.data;
      batchId = d.batch_id;
      expect(d.total_rows).to.equal(6);
      expect(d.error_rows).to.equal(2); // no consent, no district
      expect(d.valid_rows).to.equal(4);
      expect(d.matched_existing).to.equal(1);
      expect(d.new_farmers).to.equal(2);
      expect(d.columns.unrecognized).to.deep.equal([]);
      const byName = (n: string) => d.rows.find((r: any) => r.farmer_name === n);
      expect(byName('Existing Mukamana').match.farmer_id).to.equal(existingFarmer.id);
      expect(byName('Existing Mukamana').warnings.join(' ')).to.match(/swapped/);
      expect(byName('No Consent').errors.join(' ')).to.match(/consent/);
      // same national ID twice in a survey = one farmer (e.g. two plots): a warning, not an error
      expect(byName('Uwimana Claudine (again)').errors).to.deep.equal([]);
      expect(byName('Uwimana Claudine (again)').warnings.join(' ')).to.match(/Same national ID/);
      expect(byName('Uwimana Claudine').phone).to.equal(`+250${phoneLocal(1)}`);
    });

    it('lets only admins commit, and commits exactly once', async () => {
      const denied = await request(app).post(`/api/surveys/import/batches/${batchId}/commit`).set('Authorization', `Bearer ${agent.token}`);
      expect(denied.status).to.equal(403);

      const res = await request(app).post(`/api/surveys/import/batches/${batchId}/commit`).set('Authorization', `Bearer ${admin.token}`).send({});
      expect(res.status, JSON.stringify(res.body)).to.equal(200);
      const r = res.body.data;
      expect(r.surveys).to.equal(4);
      expect(r.created_farmers).to.equal(2);
      expect(r.linked_farmers).to.equal(2); // existing farmer + the repeated national ID
      expect(r.skipped_invalid).to.equal(2);
      expect(r.failed).to.deep.equal([]);

      const again = await request(app).post(`/api/surveys/import/batches/${batchId}/commit`).set('Authorization', `Bearer ${admin.token}`);
      expect(again.status).to.equal(409);
    });

    it('creates claimable farmer accounts, profiles and mapped farms', async () => {
      const profile = await prisma.farmerProfile.findFirst({ where: { id_number: nid(1) }, include: { user: true } });
      expect(profile).to.not.be.null;
      expect(profile!.user.credentials_claimed).to.equal(false);
      expect(profile!.user.phone).to.equal(`+250${phoneLocal(1)}`);
      expect(profile!.gender).to.equal('Female');
      const farm = await prisma.farm.findFirst({ where: { farmer_id: profile!.user_id } });
      expect(farm!.latitude).to.equal(-1.58);
      expect(farm!.tree_count).to.equal(65);
      expect(farm!.status).to.equal('producing');

      // m² area converted to hectares
      const eric = await prisma.farmerProfile.findFirst({ where: { id_number: nid(2) } });
      expect(eric!.farm_size).to.equal(0.25);

      // existing farmer: farm got the GPS location (swap corrected), nothing overwritten
      const existingFarm = await prisma.farm.findFirst({ where: { farmer_id: existingFarmer.id } });
      expect(existingFarm!.latitude).to.equal(-1.6);
      expect(existingFarm!.tree_count).to.equal(30);

      // the imported farmer activates the account: SMS code first (no SMS provider in tests → dev_code)
      const phone = `+250${phoneLocal(1)}`;
      const noCode = await request(app).post('/api/auth/verify-phone').send({ phone, email: `claimed-${uniq}@example.com`, password: 'ClaimPass123!' });
      expect(noCode.status).to.equal(400);
      const sent = await request(app).post('/api/auth/verify-phone/send-code').send({ phone });
      expect(sent.status).to.equal(200);
      const code = sent.body.data.dev_code;
      expect(code).to.match(/^\d{6}$/);
      const wrong = await request(app).post('/api/auth/verify-phone').send({ phone, code: code === '000000' ? '111111' : '000000', email: `claimed-${uniq}@example.com`, password: 'ClaimPass123!' });
      expect(wrong.status).to.equal(400);
      expect(wrong.body.message).to.match(/Incorrect code/);
      // unknown numbers get the same answer and no code
      const unknown = await request(app).post('/api/auth/verify-phone/send-code').send({ phone: '+250799999990' });
      expect(unknown.status).to.equal(200);
      expect(unknown.body.data).to.not.have.property('dev_code');
      const claim = await request(app).post('/api/auth/verify-phone').send({
        phone, code, email: `claimed-${uniq}@example.com`, password: 'ClaimPass123!',
      });
      expect(claim.status, JSON.stringify(claim.body)).to.be.oneOf([200, 201]);
      const login2 = await request(app).post('/api/auth/login').send({ email: `claimed-${uniq}@example.com`, password: 'ClaimPass123!' });
      expect(login2.status).to.equal(200);
      // a used code cannot be replayed
      const replay = await request(app).post('/api/auth/verify-phone').send({ phone, code, email: `again-${uniq}@example.com`, password: 'ClaimPass123!' });
      expect(replay.status).to.equal(400);
    });

    it('lists, filters, analyses and exports surveys', async () => {
      const list = await request(app).get(`/api/surveys?batch_id=${batchId}&district=Gatsibo`).set('Authorization', `Bearer ${agent.token}`);
      expect(list.status).to.equal(200);
      expect(list.body.data).to.have.length(3);

      const a = await request(app).get(`/api/surveys/analytics?batch_id=${batchId}`).set('Authorization', `Bearer ${agent.token}`);
      expect(a.status).to.equal(200);
      expect(a.body.data.totals.surveys).to.equal(4);
      expect(a.body.data.totals.hass_trees).to.equal(110);
      expect(a.body.data.sex.female).to.equal(2);
      expect(a.body.data.rates.uses_fertilizer).to.deep.equal({ yes: 1, answered: 1, pct: 100 });
      expect(a.body.data.top.challenges.map((c: any) => c.label)).to.include.members(['Pests', 'Low prices']);

      const detail = await request(app).get(`/api/surveys/${list.body.data[0].id}`).set('Authorization', `Bearer ${agent.token}`);
      expect(detail.status).to.equal(200);
      expect(detail.body.data.raw).to.have.property('owner of the farm');

      const exp = await request(app).get(`/api/surveys/export?batch_id=${batchId}`).set('Authorization', `Bearer ${agent.token}`)
        .buffer(true).parse((r, cb) => { const c: Buffer[] = []; r.on('data', (x: Buffer) => c.push(x)); r.on('end', () => cb(null, Buffer.concat(c))); });
      expect(exp.status).to.equal(200);
      const rows = XLSX.utils.sheet_to_json(XLSX.read(exp.body as Buffer, { type: 'buffer' }).Sheets.Surveys);
      expect(rows).to.have.length(4);
    });
  });

  describe('Land / UPI', () => {
    let farmId: string;
    before(async () => {
      farmId = (await prisma.farm.findFirstOrThrow({ where: { farmer_id: existingFarmer.id } })).id;
    });

    it('validates and decodes a UPI', async () => {
      const ok = await request(app).get('/api/land/upi').query({ upi: '5/3/04/02/1' + uniq }).set('Authorization', `Bearer ${existingFarmer.token}`);
      expect(ok.status).to.equal(200);
      expect(ok.body.data.parsed.district).to.equal('Gatsibo');
      expect(ok.body.data.registry.status).to.equal('disabled');
      const bad = await request(app).get('/api/land/upi').query({ upi: '9/99' }).set('Authorization', `Bearer ${existingFarmer.token}`);
      expect(bad.status).to.equal(400);
    });

    it('lets a farmer save UPI + drawn boundary on their own farm; area is computed', async () => {
      const d = 0.000898;
      const ring = [[30.45, -1.6], [30.45 + d, -1.6], [30.45 + d, -1.6 + d], [30.45, -1.6 + d]];
      const res = await request(app).put(`/api/land/farms/${farmId}`).set('Authorization', `Bearer ${existingFarmer.token}`)
        .send({ upi: '5/03/04/02/1' + uniq, parcel_boundary: { type: 'Polygon', coordinates: [ring] }, land_use: 'Agriculture' });
      expect(res.status, JSON.stringify(res.body)).to.equal(200);
      expect(res.body.data.upi).to.equal('5/03/04/02/1' + uniq);
      expect(res.body.data.parcel_area_sqm).to.be.within(9500, 10500);
      expect(res.body.data.parcel_boundary.coordinates[0]).to.have.length(5); // ring closed
      expect(res.body.data.land_source).to.equal('map');
      // the farm's GPS point (from the survey) is ~1 km west of this boundary: flagged
      expect(res.body.data.warnings.join(' ')).to.match(/outside the drawn boundary/);
      expect(res.body.data.checks.map((c: any) => c.code)).to.include('point_outside_boundary');
    });

    it('rejects a boundary outside Rwanda, another farmer, and duplicate UPIs', async () => {
      const outside = await request(app).put(`/api/land/farms/${farmId}`).set('Authorization', `Bearer ${existingFarmer.token}`)
        .send({ parcel_boundary: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } });
      expect(outside.status).to.equal(400);

      const huge = await request(app).put(`/api/land/farms/${farmId}`).set('Authorization', `Bearer ${existingFarmer.token}`)
        .send({ parcel_boundary: { type: 'Polygon', coordinates: [[[29.5, -1.7], [30.2, -1.7], [30.2, -2.2], [29.5, -2.2], [29.5, -1.7]]] } });
      expect(huge.status).to.equal(400);
      expect(huge.body.message).to.match(/too large/);

      const other = await prisma.farm.findFirstOrThrow({ where: { farmer: { farmer_profile: { id_number: nid(2) } } } });
      const forbidden = await request(app).put(`/api/land/farms/${other.id}`).set('Authorization', `Bearer ${existingFarmer.token}`).send({ land_use: 'x' });
      expect(forbidden.status).to.equal(403);

      const dup = await request(app).put(`/api/land/farms/${other.id}`).set('Authorization', `Bearer ${agent.token}`).send({ upi: '5/03/04/02/1' + uniq });
      expect(dup.status).to.equal(409);

      const mismatch = await request(app).put(`/api/land/farms/${other.id}`).set('Authorization', `Bearer ${agent.token}`).send({ upi: '5/03/04/02/9' + uniq });
      expect(mismatch.status).to.equal(200);
      expect(mismatch.body.data.warnings.join(' ')).to.match(/Gatsibo.*Rwamagana/);
    });

    it('agent verification stamps the land record', async () => {
      const res = await request(app).post(`/api/land/farms/${farmId}/verify`).set('Authorization', `Bearer ${agent.token}`);
      expect(res.status).to.equal(200);
      expect(res.body.data.land_verified_at).to.be.a('string');
      expect(res.body.data.registry_status).to.equal('disabled');
      const farmerTry = await request(app).post(`/api/land/farms/${farmId}/verify`).set('Authorization', `Bearer ${existingFarmer.token}`);
      expect(farmerTry.status).to.equal(403);
    });
  });

  describe('Farm map', () => {
    it('returns GeoJSON points (and parcels) for staff, filtered by district', async () => {
      const res = await request(app).get('/api/map/farms?district=Gatsibo&boundaries=true').set('Authorization', `Bearer ${agent.token}`);
      expect(res.status).to.equal(200);
      expect(res.body.data.type).to.equal('FeatureCollection');
      const ours = res.body.data.features.filter((f: any) => f.properties.farmer_id === existingFarmer.id);
      expect(ours.map((f: any) => f.geometry.type)).to.have.members(['Point', 'Polygon']);
      expect(ours[0].properties.land_verified).to.equal(true);
      expect(ours[0].properties.farmer_phone).to.be.a('string');
      for (const f of res.body.data.features) expect(f.properties.district).to.equal('Gatsibo');
    });

    it('farmers only see their own farm and no phone numbers', async () => {
      const res = await request(app).get('/api/map/farms').set('Authorization', `Bearer ${existingFarmer.token}`);
      expect(res.status).to.equal(200);
      expect(res.body.data.features.every((f: any) => f.properties.farmer_id === existingFarmer.id)).to.equal(true);
      expect(res.body.data.features[0].properties).to.not.have.property('farmer_phone');
    });
  });
});
