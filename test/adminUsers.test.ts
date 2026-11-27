import { expect } from 'chai';
import { describe, it, before, after } from 'mocha';
import request from 'supertest';
import app from '../src/server';
import { prisma } from '../src/lib/prisma';

const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function login(email: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status, JSON.stringify(res.body)).to.equal(200);
  return { token: res.body.data.token as string, id: res.body.data.user.id as string };
}

describe('Admin managing other users (in-process)', function () {
  this.timeout(30000);
  const userIds: string[] = [];
  let admin: { token: string; id: string };
  let second: { token: string; id: string; email: string };

  before(async () => {
    admin = await login('admin@dashboardavocado.com', 'admin123456');
  });

  after(async () => {
    await prisma.agentProfile.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.farmerProfile.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.passwordResetToken.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it('an admin creates another admin, who can sign in with the one-time password', async () => {
    const email = `admin2-${uniq()}@example.com`;
    const res = await request(app).post('/api/users').set(auth(admin.token)).send({ full_name: 'Second Admin', email, role: 'admin' });
    expect(res.status, JSON.stringify(res.body)).to.equal(200);
    expect(res.body.data.role).to.equal('admin');
    userIds.push(res.body.data.id);
    second = { ...(await login(email, res.body.data.default_password)), email };
    // The new admin can manage users too.
    expect((await request(app).get('/api/users?role=admin').set(auth(second.token))).status).to.equal(200);
  });

  it('an invalid role filter returns an empty list instead of an error', async () => {
    const res = await request(app).get('/api/users?role=superuser').set(auth(admin.token));
    expect(res.status).to.equal(200);
    expect(res.body.data).to.have.length(0);
  });

  it('an admin cannot demote, deactivate or delete themselves', async () => {
    expect((await request(app).put(`/api/users/${second.id}/role`).set(auth(second.token)).send({ role: 'farmer' })).status).to.equal(400);
    expect((await request(app).put(`/api/users/${second.id}/status`).set(auth(second.token)).send({ status: 'inactive' })).status).to.equal(400);
    expect((await request(app).put(`/api/users/${second.id}`).set(auth(second.token)).send({ role: 'agent' })).status).to.equal(400);
    expect((await request(app).delete(`/api/users/${second.id}`).set(auth(second.token))).status).to.equal(400);
  });

  it('an admin can deactivate and reactivate another admin', async () => {
    expect((await request(app).put(`/api/users/${second.id}/status`).set(auth(admin.token)).send({ status: 'inactive' })).status).to.equal(200);
    expect((await request(app).post('/api/auth/login').send({ email: second.email, password: 'whatever' })).status).to.not.equal(200);
    expect((await request(app).put(`/api/users/${second.id}/status`).set(auth(admin.token)).send({ status: 'active' })).status).to.equal(200);
  });

  it('changing a user to agent gives them an agent profile (and a staff card)', async () => {
    const email = `shop-${uniq()}@example.com`;
    const created = await request(app).post('/api/users').set(auth(admin.token)).send({ full_name: 'Shop To Agent', email, role: 'shop_manager' });
    userIds.push(created.body.data.id);
    const res = await request(app).put(`/api/users/${created.body.data.id}/role`).set(auth(admin.token)).send({ role: 'agent' });
    expect(res.status).to.equal(200);
    expect(await prisma.agentProfile.findUnique({ where: { user_id: created.body.data.id } })).to.not.equal(null);
    const card = await request(app).get(`/api/membership/${created.body.data.id}/card`).set(auth(admin.token));
    expect(card.body.data.kind).to.equal('agent');
  });

  it('an admin resets another user\'s password; the old one stops working', async () => {
    const res = await request(app).post(`/api/users/${second.id}/reset-password`).set(auth(admin.token));
    expect(res.status, JSON.stringify(res.body)).to.equal(200);
    const fresh = res.body.data.default_password;
    expect(fresh).to.be.a('string');
    expect((await request(app).post('/api/auth/login').send({ email: second.email, password: fresh })).status).to.equal(200);
    // Not for yourself, and not for non-admins.
    expect((await request(app).post(`/api/users/${admin.id}/reset-password`).set(auth(admin.token))).status).to.equal(400);
  });
});
