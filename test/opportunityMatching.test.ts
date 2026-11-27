import { expect } from 'chai';
import { describe, it, before, after } from 'mocha';
import request from 'supertest';
import app from '../src/server';
import { prisma } from '../src/lib/prisma';
import { scoreMatch, FarmerSupply, OpportunityLike } from '../src/services/opportunityMatching';

const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const DAY = 864e5;

const farmer = (over: Partial<FarmerSupply> = {}): FarmerSupply => ({
  user_id: 'f1', district: 'Rwamagana', province: 'Eastern Province', trees: 100, ready_kg: 0, expected_kg: 1000, best_grade: 'grade_a', verified: true, ...over,
});
const opp = (over: Partial<OpportunityLike> = {}): OpportunityLike => ({
  type: 'buyer_demand', district: 'Rwamagana', province: 'Eastern Province', quantity_kg: 800, price_per_kg: 500, min_grade: 'grade_a', deadline: new Date(Date.now() + 30 * DAY), ...over,
});

describe('Opportunity matching engine', function () {
  this.timeout(60000);

  describe('scoreMatch (pure)', () => {
    it('a nearby buyer paying above market that the farmer can fully supply is an excellent match', () => {
      const m = scoreMatch(opp(), farmer(), 400);
      expect(m.level).to.equal('excellent');
      expect(m.score).to.equal(100);
      expect(m.supply_pct).to.equal(125);
      expect(m.reasons.join(' ')).to.include('In your district').and.include('full 800 kg').and.include('25% more');
    });

    it('ranks by distance, supply, price and grade', () => {
      const best = scoreMatch(opp(), farmer(), 400).score;
      expect(scoreMatch(opp({ district: 'Rusizi', province: 'Western Province' }), farmer(), 400).score).to.be.below(best);
      expect(scoreMatch(opp({ quantity_kg: 20000 }), farmer(), 400).score).to.be.below(best);
      expect(scoreMatch(opp({ price_per_kg: 300 }), farmer(), 400).score).to.be.below(best);
      const grade = scoreMatch(opp({ min_grade: 'export' }), farmer(), 400);
      expect(grade.score).to.be.below(best);
      expect(grade.reasons.join(' ')).to.include('your best recorded lots are grade A');
    });

    it('prefers harvested stock over the estimate, and flags a close deadline', () => {
      const m = scoreMatch(opp({ deadline: new Date(Date.now() + 3 * DAY) }), farmer({ ready_kg: 900, expected_kg: 50 }), 400);
      expect(m.supply_kg).to.equal(900);
      expect(m.reasons.join(' ')).to.include('harvested and unsold').and.include('act soon');
    });

    it('scores non-produce opportunities by relevance (training helps reach export grade)', () => {
      const m = scoreMatch(opp({ type: 'training', quantity_kg: null, price_per_kg: null, min_grade: null }), farmer(), 400);
      expect(m.supply_kg).to.equal(null);
      expect(m.reasons.join(' ')).to.include('export grade');
      expect(m.score).to.be.within(0, 100);
    });
  });

  describe('API', () => {
    const userIds: string[] = [];
    const oppIds: string[] = [];
    let admin: { token: string; id: string };
    let farmerTok: { token: string; id: string };
    let near: string; let far: string;

    before(async () => {
      const a = await request(app).post('/api/auth/login').send({ email: 'admin@dashboardavocado.com', password: 'admin123456' });
      admin = { token: a.body.data.token, id: a.body.data.user.id };
      const r = await request(app).post('/api/auth/register').send({
        email: `match-${uniq()}@example.com`, password: 'TestPass123!', full_name: 'Match Farmer', phone: `+25078${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
        role: 'farmer', gender: 'Female', province: 'Eastern Province', district: 'Rwamagana', sector: 'Musha', farm_size: 1, avocado_type: 'Hass', tree_count: 120,
      });
      expect(r.status, JSON.stringify(r.body)).to.equal(201);
      farmerTok = { token: r.body.data.token, id: r.body.data.user.id };
      userIds.push(farmerTok.id);

      const post = async (body: any) => {
        const res = await request(app).post('/api/opportunities').set(auth(admin.token)).send(body);
        expect(res.status, JSON.stringify(res.body)).to.equal(201);
        oppIds.push(res.body.data.id);
        return res.body.data.id as string;
      };
      near = await post({ title: 'Buyer in Rwamagana', type: 'buyer_demand', description: 'Need Hass', district: 'Rwamagana', quantity_kg: 1000, price_per_kg: 900 });
      far = await post({ title: 'Nationwide buyer, low price', type: 'buyer_demand', description: 'Any avocado', quantity_kg: 50000, price_per_kg: 100 });
    });

    after(async () => {
      await prisma.opportunityInterest.deleteMany({ where: { opportunity_id: { in: oppIds } } });
      await prisma.notification.deleteMany({ where: { related_entity_id: { in: oppIds } } });
      await prisma.opportunity.deleteMany({ where: { id: { in: oppIds } } });
      await prisma.notification.deleteMany({ where: { recipient_id: { in: userIds } } });
      await prisma.signature.deleteMany({ where: { signer_id: { in: userIds } } });
      await prisma.document.deleteMany({ where: { owner_id: { in: userIds } } });
      await prisma.farm.deleteMany({ where: { farmer_id: { in: userIds } } });
      await prisma.farmerProfile.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.cart.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it('ranks a farmer\'s opportunities best first, with reasons', async () => {
      const res = await request(app).get('/api/opportunities/matches').set(auth(farmerTok.token));
      expect(res.status, JSON.stringify(res.body)).to.equal(200);
      const ids = res.body.data.matches.map((m: any) => m.opportunity.id);
      expect(ids.indexOf(near)).to.be.below(ids.indexOf(far));
      const top = res.body.data.matches.find((m: any) => m.opportunity.id === near);
      expect(top.score).to.be.above(60);
      expect(top.reasons).to.be.an('array').that.is.not.empty;
      expect(res.body.data.farmer.expected_kg).to.equal(1200); // 120 trees × 10 kg
    });

    it('suggests a buyer in a nearby district (not on the farmer\'s area list) and lets them respond', async () => {
      const res = await request(app).post('/api/opportunities').set(auth(admin.token))
        .send({ title: 'Buyer in Kayonza', type: 'buyer_demand', description: 'Next door', district: 'Kayonza', quantity_kg: 500, price_per_kg: 700 });
      oppIds.push(res.body.data.id);
      const board = await request(app).get('/api/opportunities').set(auth(farmerTok.token));
      expect(board.body.data.map((o: any) => o.id)).to.not.include(res.body.data.id); // board stays area-only
      const m = await request(app).get('/api/opportunities/matches').set(auth(farmerTok.token));
      const hit = m.body.data.matches.find((x: any) => x.opportunity.id === res.body.data.id);
      expect(hit, 'nearby buyer is suggested').to.exist;
      expect(hit.reasons.join(' ')).to.match(/km away/);
      const interest = await request(app).post(`/api/opportunities/${res.body.data.id}/interest`).set(auth(farmerTok.token)).send({ quantity_kg: 300 });
      expect(interest.status, JSON.stringify(interest.body)).to.be.oneOf([200, 201]);
      // A far-away buyer (Rusizi) is not suggested.
      const far2 = await request(app).post('/api/opportunities').set(auth(admin.token))
        .send({ title: 'Buyer in Rusizi', type: 'buyer_demand', description: 'Far', district: 'Rusizi', quantity_kg: 500 });
      oppIds.push(far2.body.data.id);
      const m2 = await request(app).get('/api/opportunities/matches').set(auth(farmerTok.token));
      expect(m2.body.data.matches.map((x: any) => x.opportunity.id)).to.not.include(far2.body.data.id);
    });

    it('staff can see a farmer\'s matches; farmer_id is required', async () => {
      expect((await request(app).get('/api/opportunities/matches').set(auth(admin.token))).status).to.equal(400);
      const res = await request(app).get(`/api/opportunities/matches?farmer_id=${farmerTok.id}`).set(auth(admin.token));
      expect(res.status).to.equal(200);
    });

    it('finds the best-fit farmers for an opportunity, with phone so staff can call them', async () => {
      const res = await request(app).get(`/api/opportunities/${near}/matching-farmers`).set(auth(admin.token));
      expect(res.status, JSON.stringify(res.body)).to.equal(200);
      const me = res.body.data.farmers.find((f: any) => f.user_id === farmerTok.id);
      expect(me, 'registered farmer is matched').to.exist;
      expect(me.phone).to.be.a('string');
      expect(res.body.data.quantity_kg).to.equal(1000);
      expect((await request(app).get(`/api/opportunities/${near}/matching-farmers`).set(auth(farmerTok.token))).status).to.equal(403);
    });
  });
});
