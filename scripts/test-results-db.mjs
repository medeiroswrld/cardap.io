import assert from "node:assert/strict";
import { createTestDatabase } from "./lib/test-db.mjs";

const db = await createTestDatabase();
let count = 0;
const a = "13000000-0000-4000-8000-0000000000a1",
  b = "13000000-0000-4000-8000-0000000000b1",
  ownerA = "23000000-0000-4000-8000-0000000000a1",
  ownerB = "23000000-0000-4000-8000-0000000000b1",
  staffA = "23000000-0000-4000-8000-0000000000a2",
  cat = "33000000-0000-4000-8000-0000000000a1",
  burger = "43000000-0000-4000-8000-000000000001",
  fries = "43000000-0000-4000-8000-000000000002",
  soda = "43000000-0000-4000-8000-000000000003",
  table = "63000000-0000-4000-8000-0000000000a1",
  media = "73000000-0000-4000-8000-0000000000a1";
const names = { [burger]: "Burger", [fries]: "Batata", [soda]: "Refri" };

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

await db.query("insert into auth.users values($1),($2),($3)", [ownerA, ownerB, staffA]);
await db.query(
  "insert into restaurants(id,name,slug,accepting_orders,timezone) values($1,'Casa A','res-a',true,'America/Sao_Paulo'),($2,'Casa B','res-b',true,'America/Sao_Paulo')",
  [a, b],
);
await db.query(
  "insert into restaurant_members values($1,$2,'owner'),($3,$4,'owner'),($1,$5,'operations')",
  [a, ownerA, b, ownerB, staffA],
);
await db.query("insert into categories(id,restaurant_id,name) values($1,$2,'Lanches')", [cat, a]);
for (const [id, name, price] of [[burger, "Burger", 2500], [fries, "Batata", 1250], [soda, "Refri", 1000]])
  await db.query("insert into products(id,restaurant_id,category_id,name,price_cents,published) values($1,$2,$3,$4,$5,true)", [id, a, cat, name, price]);
await db.query("insert into dining_tables(id,restaurant_id,number) values($1,$2,1)", [table, a]);

let sessions = 0;
async function guest() {
  sessions++;
  const { rows } = await db.query(
    "insert into guest_sessions(restaurant_id,token_hash,expires_at) values($1,$2,now()+interval '1 day') returning id",
    [a, String(sessions).padStart(64, "0")],
  );
  return rows[0].id;
}
async function order({ phone, total, kind, at, status = "entregue", items = [], session }) {
  const id = crypto.randomUUID();
  await db.query(
    `insert into orders(id,restaurant_id,guest_session_id,table_id,customer_name,customer_phone,total_cents,status,
      idempotency_key,payload_hash,fulfillment,payment_method,delivery_fee_cents,created_at)
     values($1,$2,$3,$4,'Cliente',$5,$6,$7,$8,'x',$9,$10,$11,$12)`,
    [id, a, session ?? (await guest()), kind === "mesa" ? table : null, phone, total, status, crypto.randomUUID(), kind,
      kind === "mesa" ? null : "pix", kind === "entrega" ? 500 : 0, at],
  );
  for (const [product, quantity, price] of items)
    await db.query(
      "insert into order_items(restaurant_id,order_id,product_id,product_name,unit_price_cents,quantity) values($1,$2,$3,$4,$5,$6)",
      [a, id, product, names[product], price, quantity],
    );
  return id;
}

// November 2026 in São Paulo (UTC-3).
await order({ phone: "11911110001", total: 4000, kind: "retirada", at: "2026-09-20T15:00:00Z" });
await order({ phone: "11911110001", total: 5000, kind: "retirada", at: "2026-11-05T15:00:00Z", items: [[burger, 2, 2500]] });
await order({ phone: "11911110002", total: 2500, kind: "retirada", at: "2026-10-28T15:00:00Z" });
await order({ phone: "11911110002", total: 3000, kind: "entrega", at: "2026-11-03T15:00:00Z", items: [[fries, 2, 1250]] });
await order({ phone: "11911110003", total: 2000, kind: "mesa", at: "2026-11-10T15:00:00Z", items: [[soda, 2, 1000]] });
await order({ phone: "11911110003", total: 1000, kind: "mesa", at: "2026-11-20T15:00:00Z", items: [[soda, 1, 1000]] });
await order({ phone: "11911110004", total: 9000, kind: "retirada", at: "2026-11-12T15:00:00Z", status: "cancelado", items: [[burger, 5, 1800]] });
// 23:30 on Nov 30 in São Paulo is already December in UTC: counts in November.
await order({ phone: "11911110005", total: 4000, kind: "entrega", at: "2026-12-01T02:30:00Z", items: [[burger, 1, 2500], [fries, 1, 1500]] });
// 23:00 on Oct 31 in São Paulo is November in UTC: counts in October.
await order({ phone: "11911110006", total: 7000, kind: "retirada", at: "2026-11-01T02:00:00Z" });
await order({ phone: "", total: 1500, kind: "mesa", at: "2026-11-15T15:00:00Z", items: [[soda, 1, 1500]] });

// Videos: two viewers of the burger video in November, one added it to the bag; one viewer in October.
await db.query(
  "insert into product_media(id,restaurant_id,product_id,kind,state) values($1,$2,$3,'video','ready')",
  [media, a, burger],
);
const { rows: mediaRows } = await db.query("select version from product_media where id=$1", [media]);
const g1 = await guest(), g2 = await guest(), g3 = await guest();
for (const [g, at] of [[g1, "2026-11-05T15:00:00Z"], [g2, "2026-11-06T15:00:00Z"], [g3, "2026-10-20T15:00:00Z"]])
  await db.query(
    "insert into video_view_sessions(restaurant_id,guest_session_id,product_id,media_id,media_version,watched_seconds,coverage,qualified,created_at) values($1,$2,$3,$4,$5,10,0.9,true,$6)",
    [a, g, burger, media, mediaRows[0].version, at],
  );
await db.query(
  "insert into cart_add_events(id,restaurant_id,guest_session_id,product_id,created_at) values($1,$2,$3,$4,$5)",
  [crypto.randomUUID(), a, g1, burger, "2026-11-05T15:05:00Z"],
);

await ok("only the owner reads the report", async () => {
  await login(staffA);
  await rejects(() => db.query("select results_report($1,'2026-11-15')", [a]), "FORBIDDEN");
  await login(ownerB);
  await rejects(() => db.query("select results_report($1,'2026-11-15')", [a]), "FORBIDDEN");
});

let report;
await ok("orders count only delivered ones, by month in the restaurant timezone", async () => {
  await login(ownerA);
  report = (await db.query("select results_report($1,'2026-11-15') as r", [a])).rows[0].r;
  assert.equal(report.month, "2026-11-01");
  assert.equal(report.timezone, "America/Sao_Paulo");
  assert.deepEqual(report.orders, {
    count: 6,
    revenue_cents: 16500,
    average_cents: 2750,
    by_fulfillment: {
      mesa: { count: 3, revenue_cents: 4500 },
      retirada: { count: 1, revenue_cents: 5000 },
      entrega: { count: 2, revenue_cents: 7000 },
    },
  });
  assert.deepEqual(report.previous, { count: 2, revenue_cents: 9500 });
});

await ok("iFood savings use pickup and delivery totals with the default 27%", async () => {
  assert.equal(Number(report.fee_percent), 27);
  assert.deepEqual(report.ifood, { base_cents: 12000, saved_cents: 3240 });
});

await ok("customers are new, returning and reactivated by phone; empty phone is ignored", async () => {
  assert.deepEqual(report.customers, { total: 4, new: 2, returning: 2, reactivated: 1 });
});

await ok("top dishes by quantity and by revenue ignore cancelled orders", async () => {
  assert.deepEqual(report.top_quantity.map((p) => [p.name, p.quantity, p.revenue_cents]), [
    ["Refri", 4, 4500],
    ["Burger", 3, 7500],
    ["Batata", 3, 4000],
  ]);
  assert.deepEqual(report.top_revenue.map((p) => p.name), ["Burger", "Refri", "Batata"]);
});

await ok("top videos count bag adds by viewers within the month", async () => {
  assert.deepEqual(report.top_videos.map((v) => [v.name, v.adds, v.qualified_views]), [["Burger", 1, 2]]);
});

await ok("owner changes the iFood fee within 0 to 60 percent", async () => {
  await login(staffA);
  await rejects(() => db.query("select set_ifood_fee($1,12)", [a]), "FORBIDDEN");
  await login(ownerA);
  await rejects(() => db.query("select set_ifood_fee($1,61)", [a]), "INVALID_INPUT");
  await rejects(() => db.query("select set_ifood_fee($1,-1)", [a]), "INVALID_INPUT");
  await db.query("select set_ifood_fee($1,12)", [a]);
  const r = (await db.query("select results_report($1,'2026-11-01') as r", [a])).rows[0].r;
  assert.deepEqual(r.ifood, { base_cents: 12000, saved_cents: 1440 });
});

await ok("an empty month returns zeros and empty lists", async () => {
  const r = (await db.query("select results_report($1,'2026-01-10') as r", [a])).rows[0].r;
  assert.equal(r.orders.count, 0);
  assert.equal(r.orders.average_cents, 0);
  assert.deepEqual(r.customers, { total: 0, new: 0, returning: 0, reactivated: 0 });
  assert.deepEqual(r.top_quantity, []);
  assert.deepEqual(r.top_videos, []);
});

await ok("owner of another restaurant cannot change the iFood fee", async () => {
  await login(ownerB);
  await rejects(() => db.query("select set_ifood_fee($1,5)", [a]), "FORBIDDEN");
});

await db.close();
console.log(`${count} results report database checks passed.`);
