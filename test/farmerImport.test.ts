import { expect } from 'chai';
import { describe, it, before, after } from 'mocha';
import request from 'supertest';
import * as XLSX from 'xlsx';
import app from '../src/server';
import { prisma } from '../src/lib/prisma';

/**
 * Bulk import of the ASR member register (the "ASR - Farmer Database" layout:
 * summary rows above the header, one sheet per month listing mostly the same
 * members, farm location in farm_* columns, free-text UPIs) followed by the
 * activation and profile-completion flow.
 */

async function login(email: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return { token: res.body.data.token as string, id: res.body.data.user.id as string };
}

const uniq = Date.now().toString().slice(-6);
const nid = (n: number) => `11985800${uniq}${String(n).padStart(2, '0')}`;
const local = (n: number) => `072${uniq}${n}`; // 0 + 9 digits, as typed in the register
const intl = (n: number) => `+25072${uniq}${n}`;
const upiA = `5/05/10/01/1${uniq}`; // never a leading 0 (UPIs drop it)

const HEADER = ['No', 'id', 'firstname', 'lastname', 'telephone', 'age', 'idnumber', 'province', 'district', 'sector', 'cell', 'village',
  'farm_province', 'farm_district', 'farm_sector', 'farm_cell', 'farm_village', 'farm_age', 'planted', 'avocadotype', 'mixedpercentage',
  'farmsize', 'tree-count', 'upi-number', 'assistance'];

const memberA = [1, 57, 'Biseruka ', 'Omar', local(1), '1970-01-01', nid(1), 'East', 'Ngoma', 'Rukira', 'Nyaruvumu', 'Gafunzo',
  'East', 'Ngoma', 'Rukira', 'Nyaruvumu', 'Gafunzo', 600, 'true', 'hass', '', 2, 600, `UPI ${upiA}; UPI 5/05/10/01/9${uniq}`, '{"Imihingire","Inguzanyo"}'];
// National ID "0" is a placeholder: must never be used to match people.
const memberB = [2, 58, 'Mukamana', 'Alice', local(2), '1985-03-02', '0', 'Kigali', 'Gasabo', 'Kimironko', 'Bibare', 'Ingeri',
  'East', 'Kayonza', 'Mukarange', 'Nyagatovu', 'Rugarama', 0, 'false', 'bivanze', null, 1, 120, 'Ntayo', '{"Ubujyanama"}'];
// Same phone as B but a different person: only B keeps the number.
const memberC = [3, 59, 'Habimana', 'Eric', local(2), null, nid(3), 'North', 'Musanze', 'Muhoza', 'Cyabagarura', 'Kabeza',
  null, null, null, null, null, 0, 'true', 'hass', null, 0.5, 80, null, null];

function workbook() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    [null, null, null, 'Applicants:', 2], [null, null, null, 'Total Number of Trees', 720], [null, null, null, 'Total Number of Ha', 3],
    HEADER, memberA, memberB,
  ]), 'Farmers');
  // Next month's list: A again (with a tree count update) + C. Header on row 5.
  const aAgain = [...memberA]; aAgain[22] = 650;
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Avocado Society of Rwanda', null, null, null, 'Total No of Members:', 2], ['Tel:'], ['Email:'], ['Website:'],
    HEADER, aAgain, memberC,
  ]), '2nd-October');
  // Pasted without its header row.
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([memberC]), 'No header');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Compatibility Report'], ['Minor loss of fidelity', null, '# of occurrences']]), 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('Member-register import, activation and profile completion (in-process)', function () {
  this.timeout(60000);
  let admin: { token: string; id: string };
  let batchId: string;
  let farmerA: { id: string; token?: string };
  const cleanupUserIds: string[] = [];

  before(async () => {
    admin = await login('admin@dashboardavocado.com', 'admin123456');
  });

  after(async () => {
    const users = await prisma.user.findMany({ where: { phone: { startsWith: `+25072${uniq}` } }, select: { id: true } });
    const batches = await prisma.surveyImportBatch.findMany({ where: { file_name: `register-${uniq}.xlsx` }, select: { id: true, result: true } });
    for (const b of batches) for (const a of ((b.result as any)?.new_accounts ?? [])) cleanupUserIds.push(a.farmer_id);
    cleanupUserIds.push(...users.map((u) => u.id));
    await prisma.surveyImportBatch.deleteMany({ where: { id: { in: batches.map((b) => b.id) } } });
    await prisma.phoneVerificationCode.deleteMany({ where: { phone: { startsWith: `+25072${uniq}` } } });
    await prisma.farm.deleteMany({ where: { farmer_id: { in: cleanupUserIds } } });
    await prisma.farmerProfile.deleteMany({ where: { user_id: { in: cleanupUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  });

  it('previews every sheet, merges repeated members and resolves shared phones', async () => {
    const res = await request(app).post('/api/surveys/import/preview').set('Authorization', `Bearer ${admin.token}`)
      .attach('file', workbook(), `register-${uniq}.xlsx`);
    expect(res.status, JSON.stringify(res.body)).to.equal(201);
    const d = res.body.data;
    batchId = d.batch_id;
    expect(d.kind).to.equal('register');
    expect(d.sheets.map((s: any) => [s.name, s.rows])).to.deep.equal([['Farmers', 2], ['2nd-October', 2], ['No header', 1], ['Sheet1', 0]]);
    expect(d.sheets[2].note).to.match(/No header/);
    expect(d.sheets[3].skipped_reason).to.match(/header/);
    expect(d.total_rows).to.equal(5);
    expect(d.error_rows).to.equal(0);
    expect(d.duplicate_rows).to.equal(2); // A on the 2nd sheet, C on the header-less sheet
    expect(d.new_farmers).to.equal(3);
    expect(d.columns.unrecognized).to.deep.equal([]);

    const rows = d.rows as any[];
    const a = rows.find((r) => r.farmer_name === 'Biseruka Omar' && !r.skip);
    expect(a.upi).to.equal(upiA);
    expect(a.phone).to.equal(intl(1));
    expect(a.district).to.equal('Ngoma');
    expect(rows.find((r) => r.farmer_name === 'Biseruka Omar' && r.skip).skip).to.match(/merged/);
    const b = rows.find((r) => r.farmer_name === 'Mukamana Alice');
    expect(b.national_id).to.equal(null);
    expect(b.warnings.join(' ')).to.match(/not 16 digits/);
    expect(b.warnings.join(' ')).to.match(/not a valid UPI/);
    const c = rows.find((r) => r.farmer_name === 'Habimana Eric' && !r.skip);
    expect(c.phone).to.equal(null);
    expect(c.warnings.join(' ')).to.match(/also given for Mukamana Alice/);
    expect(c.district).to.equal('Musanze'); // no farm location → where the farmer lives
  });

  it('commits: accounts, profiles and farms with the UPI; no survey records for a register', async () => {
    const status0 = await request(app).get(`/api/surveys/import/batches/${batchId}/status`).set('Authorization', `Bearer ${admin.token}`);
    expect(status0.body.data.status).to.equal('previewed');

    const res = await request(app).post(`/api/surveys/import/batches/${batchId}/commit`).set('Authorization', `Bearer ${admin.token}`).send({});
    expect(res.status, JSON.stringify(res.body)).to.equal(200);
    const r = res.body.data;
    expect(r.created_farmers).to.equal(3);
    expect(r.skipped_duplicates).to.equal(2);
    expect(r.accounts_without_phone).to.equal(1);
    expect(r.upis_saved).to.equal(1);
    expect(r.surveys).to.equal(0);
    expect(r.failed).to.deep.equal([]);
    expect(await prisma.farmSurvey.count({ where: { batch_id: batchId } })).to.equal(0);

    const status = await request(app).get(`/api/surveys/import/batches/${batchId}/status`).set('Authorization', `Bearer ${admin.token}`);
    expect(status.body.data).to.include({ status: 'committed', progress: 5 });

    const profileA = await prisma.farmerProfile.findFirst({ where: { id_number: nid(1) }, include: { user: true } });
    farmerA = { id: profileA!.user_id };
    expect(profileA!.user.credentials_claimed).to.equal(false);
    expect(profileA!.user.phone).to.equal(intl(1));
    expect(profileA!.assistance).to.have.members(['training', 'credit']);
    expect(profileA!.age).to.equal(null); // 1970-01-01 placeholder ignored
    expect(profileA!.upi_number).to.equal(upiA);
    expect(profileA!.tree_count).to.equal(600);
    const farmA = await prisma.farm.findFirst({ where: { farmer_id: farmerA.id } });
    expect(farmA!.upi).to.equal(upiA);
    expect(farmA!.farm_size).to.equal(2);
    expect(farmA!.notes).to.match(new RegExp(`Other UPIs listed: 5/05/10/01/9${uniq}`));

    // Placeholder ID "0" did not merge Alice and Eric; Eric has no phone (it is Alice's).
    const alice = await prisma.user.findFirst({ where: { phone: intl(2) }, include: { farmer_profile: true, farms: true } });
    expect(alice!.full_name).to.equal('Mukamana Alice');
    expect(alice!.farmer_profile!.id_number).to.equal(null);
    expect(alice!.farms[0].varieties).to.have.members(['Hass', 'Fuerte']); // "bivanze" = mixed
    expect((alice!.farms[0].location as any).district).to.equal('Kayonza');
    const eric = await prisma.farmerProfile.findFirst({ where: { id_number: nid(3) }, include: { user: true } });
    expect(eric!.user.phone).to.equal(null);
  });

  it('re-importing the same file links everyone instead of duplicating', async () => {
    const res = await request(app).post('/api/surveys/import/preview').set('Authorization', `Bearer ${admin.token}`)
      .attach('file', workbook(), `register-${uniq}.xlsx`);
    expect(res.body.data.matched_existing).to.equal(3);
    expect(res.body.data.new_farmers).to.equal(0);
  });

  it('shows activation status and only invites farmers who can receive an SMS', async () => {
    const summary = await request(app).get(`/api/activation/summary?batch_id=${batchId}`).set('Authorization', `Bearer ${admin.token}`);
    expect(summary.status).to.equal(200);
    expect(summary.body.data).to.include({ total: 3, activated: 0, pending_with_phone: 2, pending_without_phone: 1 });

    const list = await request(app).get(`/api/activation/farmers?batch_id=${batchId}&has_phone=false`).set('Authorization', `Bearer ${admin.token}`);
    expect(list.body.data.map((f: any) => f.full_name)).to.deep.equal(['Habimana Eric']);
    expect(list.body.data[0].can_activate).to.equal(false);

    const dry = await request(app).post('/api/activation/invites').set('Authorization', `Bearer ${admin.token}`).send({ batch_id: batchId, dry_run: true });
    expect(dry.status).to.equal(200);
    expect(dry.body.data.recipients).to.equal(2);
    // No SMS provider in tests: refuse rather than pretend.
    const real = await request(app).post('/api/activation/invites').set('Authorization', `Bearer ${admin.token}`).send({ batch_id: batchId });
    expect(real.status).to.equal(503);
  });

  it('activates without an email and signs in with the phone number', async () => {
    const sent = await request(app).post('/api/auth/verify-phone/send-code').send({ phone: local(1) }); // 07… format is fine
    expect(sent.status).to.equal(200);
    const code = sent.body.data.dev_code;
    expect(code).to.match(/^\d{6}$/);
    const claim = await request(app).post('/api/auth/verify-phone').send({ phone: local(1), code, password: 'ClaimPass123!' });
    expect(claim.status, JSON.stringify(claim.body)).to.equal(200);
    expect(claim.body.data.login_with).to.equal('phone');

    const byPhone = await request(app).post('/api/auth/login').send({ email: `0${local(1).slice(1, 4)} ${local(1).slice(4)}`, password: 'ClaimPass123!' });
    expect(byPhone.status, JSON.stringify(byPhone.body)).to.equal(200);
    expect(byPhone.body.data.user.id).to.equal(farmerA.id);
    farmerA.token = byPhone.body.data.token;
    const wrong = await request(app).post('/api/auth/login').send({ email: local(1), password: 'Nope12345!' });
    expect(wrong.status).to.equal(401);
  });

  it('tells the farmer what is missing from their profile', async () => {
    const res = await request(app).get('/api/activation/me').set('Authorization', `Bearer ${farmerA.token}`);
    expect(res.status).to.equal(200);
    const d = res.body.data;
    expect(d.complete).to.equal(false);
    expect(d.percent).to.be.within(1, 99);
    const missing = d.missing.map((m: any) => m.key);
    expect(missing).to.include.members(['gender', 'gps', 'boundary', 'email']);
    expect(missing).to.not.include('upi');
    expect(missing).to.not.include('national_id');
  });

  it('does not let a user change protected fields of their own account', async () => {
    const res = await request(app).put(`/api/users/${farmerA.id}`).set('Authorization', `Bearer ${farmerA.token}`)
      .send({ full_name: 'Omar Biseruka', phone: local(1), role: 'admin', credentials_claimed: false, qr_code_token: 'x', email: 'hijack@example.com' });
    expect(res.status, JSON.stringify(res.body)).to.equal(200);
    const u = await prisma.user.findUnique({ where: { id: farmerA.id } });
    expect(u!.full_name).to.equal('Omar Biseruka');
    expect(u!.phone).to.equal(intl(1));
    expect(u!.role).to.equal('farmer');
    expect(u!.credentials_claimed).to.equal(true);
    expect(u!.qr_code_token).to.not.equal('x');
    expect(u!.email).to.not.equal('hijack@example.com');
  });

  it('lists farms whose land data needs work', async () => {
    const res = await request(app).get('/api/land/issues?code=upi_without_boundary&limit=100').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).to.equal(200);
    const mine = res.body.data.items.find((i: any) => i.farmer_id === farmerA.id);
    expect(mine.upi).to.equal(upiA);
    expect(mine.issues[0].message).to.match(/RwaSIS/);
    expect(res.body.data.counts.upi_without_boundary).to.be.at.least(1);
  });
});
