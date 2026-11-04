import assert from "node:assert/strict";
import { createTestDatabase } from "./lib/test-db.mjs";

const db = await createTestDatabase();
let count = 0;
const a = "10000000-0000-4000-8000-0000000000c1",
  b = "10000000-0000-4000-8000-0000000000c2",
  ownerA = "20000000-0000-4000-8000-0000000000c1",
  ownerB = "20000000-0000-4000-8000-0000000000c2",
  staffA = "20000000-0000-4000-8000-0000000000c3",
  ca = "30000000-0000-4000-8000-0000000000c1",
  pa = "40000000-0000-4000-8000-0000000000c1",
  pb = "40000000-0000-4000-8000-0000000000c2",
  table = "60000000-0000-4000-8000-0000000000c1",
  zone = "90000000-0000-4000-8000-0000000000c1",
  guest = "50000000-0000-4000-8000-0000000000c1",
  guestB = "50000000-0000-4000-8000-0000000000c2",
  tableB = "60000000-0000-4000-8000-0000000000c2";
await db.query("insert into auth.users values($1),($2),($3)", [ownerA, ownerB, staffA]);
await db.query(
  "insert into restaurants(id,name,slug,accepting_orders) values($1,'Casa A','crm-a',true),($2,'Casa B','crm-b',true)",
  [a, b],
);
await db.query(
  "insert into restaurant_members values($1,$2,'owner'),($3,$4,'owner'),($1,$5,'operations')",
  [a, ownerA, b, ownerB, staffA],
);
await db.query("insert into categories(id,restaurant_id,name) values($1,$2,'Lanches')", [ca, a]);
await db.query(
  "insert into products(id,restaurant_id,category_id,name,price_cents,published) values($1,$3,$4,'Burger',2500,true),($2,$3,$4,'Batata',1500,true)",
  [pa, pb, a, ca],
);
await db.query("insert into dining_tables(id,restaurant_id,number) values($1,$2,1)", [table, a]);
await db.query("insert into dining_tables(id,restaurant_id,number) values($1,$2,1)", [tableB, b]);
await db.query(
  "insert into delivery_zones(id,restaurant_id,name,fee_cents,estimate_minutes) values($1,$2,'Centro',700,40)",
  [zone, a],
);
await db.query(
  "insert into guest_sessions(id,restaurant_id,token_hash,expires_at) values($1,$2,$3,now()+interval '1 hour'),($4,$5,$6,now()+interval '1 hour')",
  [guest, a, "c".repeat(64), guestB, b, "d".repeat(64)],
);

async function contact(restaurant, name, phone, marketing = "not_authorized") {
  const { rows } = await db.query(
    "insert into contacts(restaurant_id,name,phone,marketing_status) values($1,$2,$3,$4) returning id",
    [restaurant, name, phone, marketing],
  );
  return rows[0].id;
}
// Inserts an order directly (as root) with a controlled age, bypassing place_guest_order.
async function order(phone, total, daysAgo, { status = "entregue", items = [[pa, "Burger", 1]], delivery = null, restaurant = a } = {}) {
  const online = delivery !== null;
  const { rows } = await db.query(
    `insert into orders(restaurant_id,guest_session_id,table_id,customer_name,customer_phone,total_cents,idempotency_key,payload_hash,status,created_at,fulfillment,delivery_fee_cents,payment_method)
     values($1,$2,$3,'X',$4,$5,gen_random_uuid(),'h',$6,now()-make_interval(days=>$7),$8,$9,$10) returning id`,
    [restaurant, restaurant === a ? guest : guestB, online ? null : restaurant === a ? table : tableB, phone, total, status, daysAgo,
     online ? "entrega" : "mesa", online ? 700 : 0, online ? "pix" : null],
  );
  const id = rows[0].id;
  for (const [product, name, quantity] of items)
    await db.query(
      "insert into order_items(restaurant_id,order_id,product_id,product_name,unit_price_cents,quantity) values($1,$2,$3,$4,100,$5)",
      [restaurant, id, product, name, quantity],
    );
  if (online)
    await db.query(
      "insert into order_addresses(order_id,restaurant_id,zone_id,zone_name,street,number,complement,reference) values($1,$2,$3,'Centro',$4,'10','','')",
      [id, restaurant, zone, delivery],
    );
  return id;
}
async function ok(name, fn) {
  await fn();
  console.log("PASS " + name);
  count++;
}
async function root() {
  await db.exec("reset role");
}
async function login(user) {
  await root();
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
}
async function rejects(fn, code) {
  await assert.rejects(fn, (error) => String(error.message).includes(code));
}
async function customers(args = {}) {
  await login(ownerA);
  const p = { search: null, segment: null, tag: null, marketing: false, sort: "last_order", limit: 50, offset: 0, ...args };
  const { rows } = await db.query("select crm_customers($1,$2,$3,$4,$5,$6,$7,$8) as r", [
    a, p.search, p.segment, p.tag, p.marketing, p.sort, p.limit, p.offset,
  ]);
  return rows[0].r;
}
const byName = (result) => Object.fromEntries(result.customers.map((c) => [c.name, c]));

// Fixtures
await root();
const ana = await contact(a, "Ana Souza", "11900000001", "authorized"); // VIP by orders
const bia = await contact(a, "Bia Lima", "11900000002", "authorized"); // recorrente
const caio = await contact(a, "Caio Reis", "11900000003"); // novo
const davi = await contact(a, "Davi Melo", "11900000004", "authorized"); // sumido (was VIP)
const eva = await contact(a, "Eva Rocha", "11900000005"); // sem pedidos
const fabio = await contact(a, "Fábio Dias", "11900000006", "authorized"); // VIP by spend
await contact(b, "Ana Souza", "11900000001", "authorized"); // same phone, other tenant
for (let i = 0; i < 5; i++) await order("11900000001", 3000, i + 1, { items: [[pa, "Burger", 2]] });
await order("11900000001", 9999, 1, { status: "cancelado" });
await order("11900000001", 9999, 1, { status: "recusado" });
await order("11900000002", 4000, 5);
await order("11900000002", 4700, 10, { delivery: "Rua B", items: [[pb, "Batata", 3]] });
await order("11900000003", 2000, 3);
for (let i = 0; i < 6; i++) await order("11900000004", 3000, 40 + i);
await order("11900000006", 60000, 2);
await order("11900000001", 5000, 1, { restaurant: b, items: [] });

await ok("totals ignore refused/cancelled orders and include the delivery fee", async () => {
  const c = byName(await customers());
  assert.equal(c["Ana Souza"].orders_count, 5);
  assert.equal(Number(c["Ana Souza"].spent_cents), 15000);
  assert.equal(c["Ana Souza"].avg_ticket_cents, 3000);
  assert.equal(Number(c["Bia Lima"].spent_cents), 8700);
  assert.equal(c["Eva Rocha"].orders_count, 0);
});

await ok("segments follow the default rules and their priority", async () => {
  const c = byName(await customers());
  assert.equal(c["Ana Souza"].segment, "vip");
  assert.equal(c["Bia Lima"].segment, "recorrente");
  assert.equal(c["Caio Reis"].segment, "novo");
  assert.equal(c["Davi Melo"].segment, "sumido");
  assert.equal(c["Eva Rocha"].segment, "sem_pedidos");
  assert.equal(c["Fábio Dias"].segment, "vip");
});

await ok("segment counters cover the whole restaurant regardless of filters", async () => {
  const r = await customers({ segment: "novo" });
  assert.equal(r.total, 1);
  assert.deepEqual(r.segments, { novo: 1, recorrente: 1, vip: 2, sumido: 1, sem_pedidos: 1 });
});

await ok("adjusted rules change segments", async () => {
  await login(ownerA);
  await db.query("select crm_save_settings($1,$2)", [
    a,
    JSON.stringify({ recurring_min_orders: 2, recurring_days: 60, vip_min_orders: 10, vip_min_spent_cents: 0, vip_days: 90, lapsed_days: 60 }),
  ]);
  const c = byName(await customers());
  assert.equal(c["Ana Souza"].segment, "recorrente");
  assert.equal(c["Fábio Dias"].segment, "novo");
  assert.equal(c["Davi Melo"].segment, "recorrente"); // 6 orders 40–45 days ago, now inside 60 days
  await db.query("select crm_save_settings($1,$2)", [
    a,
    JSON.stringify({ recurring_min_orders: 2, recurring_days: 60, vip_min_orders: 5, vip_min_spent_cents: 50000, vip_days: 90, lapsed_days: 30 }),
  ]);
  await rejects(
    () => db.query("select crm_save_settings($1,$2)", [a, JSON.stringify({ recurring_min_orders: 2 })]),
    "INVALID_INPUT",
  );
});

await ok("search, tag, marketing filter, sorting and pagination", async () => {
  assert.deepEqual((await customers({ search: "bia" })).customers.map((c) => c.name), ["Bia Lima"]);
  assert.deepEqual((await customers({ search: "0003" })).customers.map((c) => c.name), ["Caio Reis"]);
  assert.equal((await customers({ search: "100%" })).total, 0);
  assert.equal((await customers({ marketing: true })).total, 4);
  assert.deepEqual((await customers({ sort: "spent", limit: 2 })).customers.map((c) => c.name), ["Fábio Dias", "Davi Melo"]);
  const page2 = await customers({ sort: "name", limit: 2, offset: 2 });
  assert.equal(page2.total, 6);
  assert.deepEqual(page2.customers.map((c) => c.name), ["Caio Reis", "Davi Melo"]);
  const last = (await customers()).customers;
  assert.equal(last[last.length - 1].name, "Eva Rocha");
  await rejects(() => customers({ sort: "phone" }), "INVALID_INPUT");
  await rejects(() => customers({ limit: 101 }), "INVALID_INPUT");
});

await ok("tags are normalized and limited; notes are limited", async () => {
  await login(ownerA);
  await db.query("select crm_save_customer($1,$2,$3,$4)", [a, bia, [" Vegana ", "vegana", "Aniversário", ""], "Prefere sem cebola"]);
  await root();
  const { rows } = await db.query("select tags,notes from contacts where id=$1", [bia]);
  assert.deepEqual(rows[0], { tags: ["Vegana", "Aniversário"], notes: "Prefere sem cebola" });
  assert.deepEqual((await customers({ tag: "VEGANA" })).customers.map((c) => c.name), ["Bia Lima"]);
  await login(ownerA);
  await rejects(() => db.query("select crm_save_customer($1,$2,$3,'')", [a, bia, Array.from({ length: 11 }, (_, i) => "t" + i)]), "INVALID_INPUT");
  await rejects(() => db.query("select crm_save_customer($1,$2,$3,'')", [a, bia, ["x".repeat(31)]]), "INVALID_INPUT");
  await rejects(() => db.query("select crm_save_customer($1,$2,'{}',$3)", [a, bia, "x".repeat(2001)]), "INVALID_INPUT");
});

await ok("customer detail has favorites, fulfillment mix, addresses and recent orders", async () => {
  await login(ownerA);
  const { rows } = await db.query("select crm_customer($1,$2) as r", [a, bia]);
  const d = rows[0].r;
  assert.equal(d.notes, "Prefere sem cebola");
  assert.deepEqual(d.favorites[0], { product_name: "Batata", quantity: 3 });
  assert.deepEqual(d.fulfillment_mix, { mesa: 1, retirada: 0, entrega: 1 });
  assert.equal(d.addresses.length, 1);
  assert.equal(d.addresses[0].street, "Rua B");
  assert.equal(d.orders.length, 2);
  const ana_ = (await db.query("select crm_customer($1,$2) as r", [a, ana])).rows[0].r;
  assert.equal(ana_.orders.length, 7); // last orders include refused/cancelled
  await rejects(() => db.query("select crm_customer($1,$2)", [b, ana]), "FORBIDDEN");
});

await ok("campaign lists only authorized contacts and needs a filter", async () => {
  await login(ownerA);
  const vip = (await db.query("select crm_campaign($1,'vip',null) as r", [a])).rows[0].r;
  assert.deepEqual(vip.map((c) => c.name).sort(), ["Ana Souza", "Fábio Dias"]);
  const novo = (await db.query("select crm_campaign($1,'novo',null) as r", [a])).rows[0].r;
  assert.deepEqual(novo, []); // Caio is not authorized
  await rejects(() => db.query("select crm_campaign($1,null,null)", [a]), "INVALID_INPUT");
});

await ok("only the owner of the same restaurant can use CRM functions", async () => {
  for (const user of [staffA, ownerB]) {
    await login(user);
    await rejects(() => db.query("select crm_customers($1,null,null,null,false,'last_order',50,0)", [a]), "FORBIDDEN");
    await rejects(() => db.query("select crm_customer($1,$2)", [a, ana]), "FORBIDDEN");
    await rejects(() => db.query("select crm_save_customer($1,$2,'{}','')", [a, ana]), "FORBIDDEN");
    await rejects(() => db.query("select crm_campaign($1,'vip',null)", [a]), "FORBIDDEN");
    await rejects(() => db.query("select crm_erase_customer($1,$2)", [a, ana]), "FORBIDDEN");
  }
  await login(ownerB);
  await rejects(() => db.query("select crm_customer($1,$2)", [b, ana]), "NOT_FOUND");
  await root();
  await db.exec("set role anon");
  await rejects(() => db.query("select crm_customers($1,null,null,null,false,'last_order',50,0)", [a]), "permission denied");
  await rejects(() => db.query("select * from crm_rows($1)", [a]), "permission denied");
  await root();
});

await ok("erasure is blocked by open orders, then anonymizes and logs without personal data", async () => {
  await root();
  const open = await order("11900000002", 1000, 0, { status: "em_preparo" });
  await login(ownerA);
  await rejects(() => db.query("select crm_erase_customer($1,$2)", [a, bia]), "CUSTOMER_HAS_OPEN_ORDERS");
  await root();
  await db.query("update orders set status='entregue' where id=$1", [open]);
  await login(ownerA);
  const r = (await db.query("select crm_erase_customer($1,$2) as r", [a, bia])).rows[0].r;
  assert.equal(r.orders_affected, 3);
  await root();
  const left = await db.query("select customer_name,customer_phone,total_cents from orders where restaurant_id=$1 and customer_name='Cliente removido' order by total_cents", [a]);
  assert.deepEqual(left.rows.map((o) => [o.customer_phone, o.total_cents]), [["", 1000], ["", 4000], ["", 4700]]);
  assert.equal((await db.query("select 1 from contacts where id=$1", [bia])).rows.length, 0);
  assert.equal((await db.query("select 1 from order_addresses where street='Rua B'")).rows.length, 0);
  assert.equal((await db.query("select 1 from marketing_consent_events where contact_id=$1", [bia])).rows.length, 0);
  const ev = await db.query("select orders_affected,actor_id from data_erasure_events where restaurant_id=$1", [a]);
  assert.deepEqual(ev.rows[0], { orders_affected: 3, actor_id: ownerA });
  const otherTenant = await db.query("select customer_phone from orders where restaurant_id=$1", [b]);
  assert.equal(otherTenant.rows[0].customer_phone, "11900000001");
  assert.equal((await customers()).total, 5);
});

await db.close();
console.log(`${count} CRM database checks passed.`);
