import { expect } from 'chai';
import { describe, it, before, after } from 'mocha';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../src/server';
import { prisma } from '../src/lib/prisma';

type Session = { token: string; id: string };

async function login(email: string, password: string): Promise<Session> {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status, JSON.stringify(res.body)).to.equal(200);
  return { token: res.body.data.token as string, id: res.body.data.user.id as string };
}

const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const address = { full_name: 'Test Buyer', phone: '+250788300001', street_address: 'KG 5 Ave', city: 'Musha', province: 'Eastern Province', country: 'Rwanda' };

describe('Commerce: shops, inventory, cart/checkout, orders, suppliers, procurement (in-process)', function () {
  this.timeout(60000);

  let admin: Session;
  let agent: Session;
  let manager: Session; // demo shop manager (seeded shop)
  let farmer: Session & { email: string };
  let noShopManager: Session;

  let shopAId: string;           // demo manager's shop
  let shopBId: string;           // another shop created by admin
  let shopBNumber: number;
  let productA: string;          // created by manager via /inventory (stock 5)
  let productB: string;          // belongs to shop B
  let farmerOrderId: string;
  let agentOrderId: string;
  let supplierId: string;
  let poId: string;

  const userIds: string[] = [];
  const productIds: string[] = [];
  const orderIds: string[] = [];
  const supplierIds: string[] = [];

  const auth = (s: Session) => ({ Authorization: `Bearer ${s.token}` });
  const stockOf = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).quantity;

  before(async () => {
    admin = await login('admin@dashboardavocado.com', 'admin123456');
    agent = await login('agent@dashboardavocado.com', 'agent123456');
    manager = await login('shop@dashboardavocado.com', 'shop123456');

    const shopA = await prisma.shop.findUnique({ where: { manager_id: manager.id } });
    expect(shopA, 'seed must give the demo shop manager a shop').to.not.be.null;
    shopAId = shopA!.id;
    const link = await prisma.supplier.findUnique({ where: { id: shopAId } });
    expect(link?.is_shop_supplier).to.equal(true);

    const email = `commerce-farmer-${tag}@example.com`;
    const reg = await request(app).post('/api/auth/register').send({
      email, password: 'TestPass123!', full_name: 'Commerce Farmer', phone: '+250788300002', role: 'farmer',
      gender: 'Female', province: 'Eastern Province', district: 'Rwamagana', sector: 'Musha', farm_size: 1, avocado_type: 'Hass', tree_count: 10,
    });
    expect(reg.status, JSON.stringify(reg.body)).to.equal(201);
    farmer = { token: reg.body.data.token, id: reg.body.data.user.id, email };
    userIds.push(farmer.id);

    const noShopEmail = `commerce-noshop-${tag}@example.com`;
    const u = await prisma.user.create({
      data: { email: noShopEmail, password: await bcrypt.hash('NoShop123!', 4), full_name: 'Shopless Manager', role: 'shop_manager', status: 'active', credentials_claimed: true },
    });
    userIds.push(u.id);
    noShopManager = await login(noShopEmail, 'NoShop123!');
  });

  after(async () => {
    const orders = await prisma.order.findMany({ where: { OR: [{ id: { in: orderIds } }, { items: { some: { product_id: { in: productIds } } } }] }, select: { id: true } });
    await prisma.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
    const pos = await prisma.purchaseOrder.findMany({ where: { supplier_id: { in: supplierIds } }, select: { id: true } });
    await prisma.goodsReceipt.deleteMany({ where: { purchase_order_id: { in: pos.map((p) => p.id) } } });
    await prisma.purchaseOrder.deleteMany({ where: { id: { in: pos.map((p) => p.id) } } });
    await prisma.cartItem.deleteMany({ where: { product_id: { in: productIds } } });
    await prisma.cart.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.stockHistory.deleteMany({ where: { product_id: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.customer.deleteMany({ where: { email: { equals: farmer?.email, mode: 'insensitive' } } });
    await prisma.supplierEvaluation.deleteMany({ where: { supplier_id: { in: supplierIds } } });
    await prisma.supplier.deleteMany({ where: { id: { in: supplierIds } } });
    if (shopBId) {
      await prisma.supplier.deleteMany({ where: { id: shopBId } });
      await prisma.shop.deleteMany({ where: { id: shopBId } });
    }
    await prisma.notification.deleteMany({ where: { recipient_id: { in: userIds } } });
    await prisma.signature.deleteMany({ where: { signer_id: { in: userIds } } });
    await prisma.document.deleteMany({ where: { owner_id: { in: userIds } } });
    await prisma.farm.deleteMany({ where: { farmer_id: { in: userIds } } });
    await prisma.farmerProfile.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  describe('Shops & inventory', () => {
    it('admin-created shops get a linked supplier row with the same id', async () => {
      const res = await request(app).post('/api/shops/addshop').set(auth(admin)).send({
        shopName: `Commerce Shop B ${tag}`, description: 'Test shop B', province: 'Kigali City', district: 'Gasabo',
        ownerName: 'Owner B', ownerEmail: `owner-b-${tag}@example.com`, ownerPhone: '+250788300003',
      });
      expect(res.status, JSON.stringify(res.body)).to.equal(201);
      shopBId = res.body.data.id;
      shopBNumber = res.body.data.shop_number;
      const sup = await prisma.supplier.findUnique({ where: { id: shopBId } });
      expect(sup?.is_shop_supplier).to.equal(true);
      expect(sup?.name).to.equal(`Commerce Shop B ${tag}`);

      const dir = await request(app).get('/api/suppliers?limit=100').set(auth(admin));
      expect(dir.body.data.map((s: any) => s.id)).to.not.include(shopBId);

      const prod = await request(app).post('/api/inventory').set(auth(admin)).send({
        name: `Shop B Hoe ${tag}`, category: 'tools', price: 5000, quantity: 20, unit: 'piece', supplier_id: shopBId,
      });
      expect(prod.status, JSON.stringify(prod.body)).to.equal(200);
      productB = prod.body.data.id;
      productIds.push(productB);
    });

    it('a shop manager creates a product via /inventory (supplier defaults to own shop)', async () => {
      const res = await request(app).post('/api/inventory').set(auth(manager)).send({
        name: `Shop A Seedling ${tag}`, category: 'seeds', price: 1000, quantity: 5, unit: 'piece', min_stock: 6,
      });
      expect(res.status, JSON.stringify(res.body)).to.equal(200);
      expect(res.body.data.supplier_id).to.equal(shopAId);
      productA = res.body.data.id;
      productIds.push(productA);

      const hist = await prisma.stockHistory.findFirst({ where: { product_id: productA } });
      expect(hist?.shop_id).to.equal(shopAId);

      const other = await request(app).post('/api/inventory').set(auth(manager)).send({
        name: `Sneaky ${tag}`, category: 'seeds', price: 1, quantity: 1, unit: 'piece', supplier_id: shopBId,
      });
      expect(other.status).to.equal(403);
    });

    it("a shop manager cannot edit another shop's product", async () => {
      const viaProducts = await request(app).put(`/api/products/${productB}`).set(auth(manager)).send({ price: 1 });
      expect(viaProducts.status).to.equal(403);
      const viaStock = await request(app).put(`/api/products/${productB}/stock`).set(auth(manager)).send({ quantity: 0 });
      expect(viaStock.status).to.equal(403);
      const viaInventory = await request(app).put(`/api/inventory/${productB}`).set(auth(manager)).send({ price: 1 });
      expect(viaInventory.status).to.equal(403);
      expect((await prisma.product.findUniqueOrThrow({ where: { id: productB } })).price).to.equal(5000);

      const own = await request(app).put(`/api/products/${productA}`).set(auth(manager)).send({ price: 1200, supplier_id: shopBId, id: 'hijack' });
      expect(own.status, JSON.stringify(own.body)).to.equal(200);
      expect(own.body.data.price).to.equal(1200);
      expect(own.body.data.supplier_id).to.equal(shopAId);
      expect(own.body.data.id).to.equal(productA);
    });

    it('low-stock uses each product\'s min_stock; managers without a shop get 403', async () => {
      const low = await request(app).get('/api/inventory/low-stock').set(auth(manager));
      expect(low.status).to.equal(200);
      expect(low.body.data.map((p: any) => p.id)).to.include(productA); // 5 <= min_stock 6

      const res = await request(app).get('/api/inventory').set(auth(noShopManager));
      expect(res.status).to.equal(403);
      expect(res.body.message).to.equal('No shop is assigned to your account');
    });
  });

  describe('Cart & checkout', () => {
    it('cart cannot exceed stock (existing + new quantity)', async () => {
      const first = await request(app).post('/api/cart/items').set(auth(farmer)).send({ product_id: productA, quantity: 3 });
      expect(first.status, JSON.stringify(first.body)).to.equal(201);
      const second = await request(app).post('/api/cart/items').set(auth(farmer)).send({ product_id: productA, quantity: 3 });
      expect(second.status).to.equal(400);
      const update = await request(app).put(`/api/cart/items/${productA}`).set(auth(farmer)).send({ quantity: 6 });
      expect(update.status).to.equal(400);
    });

    it('a farmer checks out without customer_id; the order is created and stock decremented', async () => {
      const res = await request(app).post('/api/cart/checkout').set(auth(farmer)).send({ shipping_address: address, payment_method: 'cash' });
      expect(res.status, JSON.stringify(res.body)).to.equal(201);
      const order = res.body.data.order;
      farmerOrderId = order.id;
      orderIds.push(order.id);
      expect(order.items).to.have.length(1);
      expect(order.total_amount).to.equal(3 * 1200);
      expect(await stockOf(productA)).to.equal(2);

      const customer = await prisma.customer.findUniqueOrThrow({ where: { id: order.customer_id } });
      expect(customer.email).to.equal(farmer.email.toLowerCase());
      expect(customer.total_orders).to.equal(1);
      expect(customer.total_spent).to.equal(3600);
      expect(customer.last_order_date).to.not.be.null;

      const sale = await prisma.stockHistory.findFirst({ where: { product_id: productA, reason: 'sale' } });
      expect(sale?.change_amount).to.equal(-3);

      const mine = await request(app).get(`/api/orders/user/${farmer.id}`).set(auth(farmer));
      expect(mine.status).to.equal(200);
      expect(mine.body.data.map((o: any) => o.id)).to.include(farmerOrderId);

      const one = await request(app).get(`/api/orders/${farmerOrderId}`).set(auth(farmer));
      expect(one.status).to.equal(200);
    });

    it('an agent checks out on behalf of a farmer', async () => {
      await request(app).delete('/api/cart').set(auth(agent));
      const add = await request(app).post('/api/cart/items').set(auth(agent)).send({ product_id: productB, quantity: 2 });
      expect(add.status, JSON.stringify(add.body)).to.equal(201);

      const notFarmer = await request(app).post('/api/cart/checkout').set(auth(agent)).send({ shipping_address: address, farmer_id: admin.id });
      expect(notFarmer.status).to.equal(400);

      const res = await request(app).post('/api/cart/checkout').set(auth(agent)).send({ shipping_address: address, farmer_id: farmer.id, notes: 'deliver Friday' });
      expect(res.status, JSON.stringify(res.body)).to.equal(201);
      const order = res.body.data.order;
      agentOrderId = order.id;
      orderIds.push(order.id);
      expect(order.placed_by).to.equal(agent.id);
      expect(order.notes).to.match(/on behalf of farmer Commerce Farmer/);
      const customer = await prisma.customer.findUniqueOrThrow({ where: { id: order.customer_id } });
      expect(customer.email).to.equal(farmer.email.toLowerCase());
      expect(customer.total_orders).to.equal(2);
      expect(await stockOf(productB)).to.equal(18);

      const farmerView = await request(app).get(`/api/orders/user/${farmer.id}`).set(auth(farmer));
      expect(farmerView.body.data.map((o: any) => o.id)).to.include(agentOrderId);

      const farmerTriesBehalf = await request(app).post('/api/orders').set(auth(farmer)).send({ items: [{ product_id: productB, quantity: 1 }], shipping_address: address, farmer_id: farmer.id });
      expect(farmerTriesBehalf.status).to.equal(403);
    });

    it('POST /orders without customer_id works for a farmer and rejects overselling', async () => {
      const over = await request(app).post('/api/orders').set(auth(farmer)).send({ items: [{ product_id: productA, quantity: 3 }], shipping_address: address });
      expect(over.status).to.equal(400);
      expect(await stockOf(productA)).to.equal(2);
    });
  });

  describe('Orders', () => {
    it('order PUT ignores unknown / protected fields', async () => {
      const res = await request(app).put(`/api/orders/${farmerOrderId}`).set(auth(admin)).send({
        tracking_number: 'TRK-123', total_amount: 1, customer_id: 'nope', order_number: 'HACK', id: 'other', bogus: true,
      });
      expect(res.status, JSON.stringify(res.body)).to.equal(200);
      expect(res.body.data.id).to.equal(farmerOrderId);
      expect(res.body.data.tracking_number).to.equal('TRK-123');
      expect(res.body.data.total_amount).to.equal(3600);
      expect(res.body.data.order_number).to.not.equal('HACK');
    });

    it("a shop manager cannot update an order without their shop's products", async () => {
      const res = await request(app).put(`/api/orders/${agentOrderId}/status`).set(auth(manager)).send({ status: 'confirmed' });
      expect(res.status).to.equal(403);
      const ok = await request(app).put(`/api/orders/${farmerOrderId}/status`).set(auth(manager)).send({ status: 'confirmed' });
      expect(ok.status, JSON.stringify(ok.body)).to.equal(200);
    });

    it('cancelling an order restores stock exactly once', async () => {
      const res = await request(app).put(`/api/orders/${farmerOrderId}/status`).set(auth(manager)).send({ status: 'cancelled' });
      expect(res.status, JSON.stringify(res.body)).to.equal(200);
      expect(await stockOf(productA)).to.equal(5);
      const ret = await prisma.stockHistory.findFirst({ where: { product_id: productA, reason: 'return' } });
      expect(ret?.change_amount).to.equal(3);

      const again = await request(app).put(`/api/orders/${farmerOrderId}/status`).set(auth(admin)).send({ status: 'returned' });
      expect(again.status).to.equal(400);
      const same = await request(app).put(`/api/orders/${farmerOrderId}/status`).set(auth(admin)).send({ status: 'cancelled' });
      expect(same.status).to.equal(200);
      expect(await stockOf(productA)).to.equal(5);

      const customer = await prisma.customer.findFirstOrThrow({ where: { email: farmer.email.toLowerCase(), shop_id: null } });
      expect(customer.total_orders).to.equal(1);
      expect(customer.total_spent).to.equal(2 * 5000);
    });

    it('/shops/:id/orders supports status/search filters', async () => {
      const all = await request(app).get(`/api/shops/${shopBNumber}/orders`).set(auth(admin));
      expect(all.status).to.equal(200);
      expect(all.body.data.map((o: any) => o.id)).to.include(agentOrderId);
      const cancelled = await request(app).get(`/api/shops/${shopBNumber}/orders?status=cancelled`).set(auth(admin));
      expect(cancelled.body.data).to.have.length(0);
      const search = await request(app).get(`/api/shops/${shopBNumber}/orders?search=Commerce%20Farmer&from=2000-01-01`).set(auth(admin));
      expect(search.body.data.map((o: any) => o.id)).to.include(agentOrderId);
    });
  });

  describe('Suppliers & procurement', () => {
    it('a shop manager creates and updates a supplier; PUT cannot change id', async () => {
      const res = await request(app).post('/api/suppliers').set(auth(manager)).send({
        name: `Commerce Supplier ${tag}`, category: 'seeds_supplier', contact_person: 'Contact', email: `commerce-sup-${tag}@example.com`,
        phone: '+250788300004', address: { city: 'Kigali', country: 'Rwanda' },
      });
      expect(res.status, JSON.stringify(res.body)).to.equal(201);
      supplierId = res.body.data.id;
      supplierIds.push(supplierId);

      const put = await request(app).put(`/api/suppliers/${supplierId}`).set(auth(manager)).send({ id: 'hijacked-id', name: 'Renamed Supplier', rating: 5 });
      expect(put.status, JSON.stringify(put.body)).to.equal(200);
      expect(put.body.data.id).to.equal(supplierId);
      expect(put.body.data.name).to.equal('Renamed Supplier');
      expect(put.body.data.rating).to.equal(0);
      expect(await prisma.supplier.findUnique({ where: { id: 'hijacked-id' } })).to.be.null;

      const del = await request(app).delete(`/api/suppliers/${supplierId}`).set(auth(manager));
      expect(del.status).to.equal(403);
    });

    it('procurement: partial then final receive updates stock and status', async () => {
      const create = await request(app).post('/api/procurement').set(auth(manager)).send({
        supplier_id: supplierId,
        items: [{ product_name: 'Seedlings', product_id: productA, quantity_ordered: 10, unit_price: 500 }],
      });
      expect(create.status, JSON.stringify(create.body)).to.equal(201);
      poId = create.body.data.id;
      expect(create.body.data.shop_id).to.equal(shopAId);

      expect((await request(app).put(`/api/procurement/${poId}/submit`).set(auth(manager))).status).to.equal(200);
      expect((await request(app).put(`/api/procurement/${poId}/approve`).set(auth(admin))).status).to.equal(200);

      const before = await stockOf(productA);
      const r1 = await request(app).post(`/api/procurement/${poId}/receive`).set(auth(manager)).send({ items: [{ product_id: productA, product_name: 'Seedlings', quantity: 4, unit_price: 500 }] });
      expect(r1.status, JSON.stringify(r1.body)).to.equal(201);
      expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } })).status).to.equal('partially_received');

      const over = await request(app).post(`/api/procurement/${poId}/receive`).set(auth(manager)).send({ items: [{ product_id: productA, quantity: 7 }] });
      expect(over.status).to.equal(400);

      const r2 = await request(app).post(`/api/procurement/${poId}/receive`).set(auth(manager)).send({ items: [{ product_id: productA, quantity: 6 }] });
      expect(r2.status, JSON.stringify(r2.body)).to.equal(201);
      const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
      expect(po.status).to.equal('fully_received');
      expect(await stockOf(productA)).to.equal(before + 10);

      const r3 = await request(app).post(`/api/procurement/${poId}/receive`).set(auth(manager)).send({ items: [{ product_id: productA, quantity: 1 }] });
      expect(r3.status).to.equal(400);
    });

    it('a shop manager can cancel their own draft PO; referenced suppliers cannot be deleted', async () => {
      const create = await request(app).post('/api/procurement').set(auth(manager)).send({
        supplier_id: supplierId, items: [{ product_name: 'Gloves', quantity_ordered: 2, unit_price: 100 }],
      });
      expect(create.status).to.equal(201);
      const cancel = await request(app).put(`/api/procurement/${create.body.data.id}/cancel`).set(auth(manager));
      expect(cancel.status, JSON.stringify(cancel.body)).to.equal(200);
      expect(cancel.body.data.status).to.equal('cancelled');

      const otherManagerView = await request(app).get(`/api/procurement/${poId}`).set(auth(noShopManager));
      expect(otherManagerView.status).to.equal(403);

      const del = await request(app).delete(`/api/suppliers/${supplierId}`).set(auth(admin));
      expect(del.status).to.equal(409);
      expect(del.body.message).to.match(/purchase orders/);
    });
  });
});
