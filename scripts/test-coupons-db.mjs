import assert from "node:assert/strict";
import { createTestDatabase } from "./lib/test-db.mjs";

const db = await createTestDatabase();
let count = 0;
const a = "17000000-0000-4000-8000-0000000000a1",
  b = "17000000-0000-4000-8000-0000000000b1",
  ownerA = "27000000-0000-4000-8000-0000000000a1",
  ownerB = "27000000-0000-4000-8000-0000000000b1",
  staffA = "27000000-0000-4000-8000-0000000000a2",
  cat = "37000000-0000-4000-8000-0000000000a1",
  burger = "47000000-0000-4000-8000-000000000001",
  table = "67000000-0000-4000-8000-0000000000a1",
  zone = "97000000-0000-4000-8000-0000000000a1",
  zoneFree = "97000000-0000-4000-8000-0000000000a2";
const allDay = JSON.stringify(
  Array.from({ length: 7 }, (_, day) => ({ day, open: "00:00", close: "23:59:59" })),
);

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
async function anon() {
  await root();
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.exec("set role anon");
}
async function rejects(fn, code) {
  await assert.rejects(fn, (error) => String(error.message).includes(code));
}

await db.query("insert into auth.users values($1),($2),($3)", [ownerA, ownerB, staffA]);
await db.query(
  `insert into restaurants(id,name,slug,accepting_orders,opening_hours,pickup_enabled,delivery_enabled,delivery_min_order_cents,auto_accept_orders,timezone)
   values($1,'Casa A','casa-a',true,$3,true,true,3000,false,'America/Sao_Paulo'),($2,'Casa B','casa-b',true,$3,false,false,0,false,'America/Sao_Paulo')`,
  [a, b, allDay],
);
await db.query(
  "insert into restaurant_members values($1,$2,'owner'),($3,$4,'owner'),($1,$5,'operations')",
  [a, ownerA, b, ownerB, staffA],
);
await db.query("insert into categories(id,restaurant_id,name) values($1,$2,'Lanches')", [cat, a]);
await db.query(
  "insert into products(id,restaurant_id,category_id,name,price_cents,published) values($1,$2,$3,'Burger',2500,true)",
  [burger, a, cat],
);
await db.query("insert into dining_tables(id,restaurant_id,number) values($1,$2,1)", [table, a]);
await db.query(
  "insert into delivery_zones(id,restaurant_id,name,fee_cents,estimate_minutes,active) values($1,$2,'Centro',700,40,true)",
  [zone, a],
);

let session = 0;
async function guest() {
  await root();
  session++;
  const token = String(session).padStart(64, "0");
  await db.query(
    "insert into guest_sessions(restaurant_id,token_hash,expires_at) values($1,$2,now()+interval '1 hour')",
    [a, token],
  );
  return token;
}
const items = (quantity) => [{ product_id: burger, quantity, expected_price: 2500, note: "" }];
const base = { name: "Cliente Teste", phone: "11988887777", marketing_consent: false };
const pickup = (over = {}) => ({ ...base, fulfillment: "retirada", payment_method: "pix", items: items(2), ...over });
const delivery = (over = {}) => ({
  ...base,
  fulfillment: "entrega",
  payment_method: "pix",
  expected_fee_cents: 700,
  address: { zone_id: zone, street: "Rua das Flores", number: "120" },
  items: items(2),
  ...over,
});
async function place(payload, key = crypto.randomUUID(), token) {
  const t = token ?? (await guest());
  await root();
  const { rows } = await db.query("select place_guest_order($1,$2,$3,$4) as r", [a, t, key, JSON.stringify(payload)]);
  return rows[0].r;
}
async function coupon(user, id, data) {
  await login(user);
  const { rows } = await db.query("select save_coupon($1,$2,$3) as r", [a, id, JSON.stringify(data)]);
  return rows[0].r;
}
const percent10 = { code: "BEM10", kind: "percent", value: 10 };

// 1. Coupon rules.
let percentId;
await ok("owner saves coupons (code normalised to upper case)", async () => {
  percentId = await coupon(ownerA, null, { ...percent10, code: " bem10 " });
  await coupon(ownerA, null, { code: "FIXO30", kind: "fixed", value: 3000 });
  await coupon(ownerA, null, { code: "PAUSADO", kind: "percent", value: 10, active: false });
  await coupon(ownerA, null, { code: "VENCIDO", kind: "percent", value: 10, valid_until: "2000-01-01" });
  await coupon(ownerA, null, { code: "MIN100", kind: "percent", value: 10, min_order_cents: 10000 });
  await root();
  const { rows } = await db.query("select code from coupons where id=$1", [percentId]);
  assert.equal(rows[0].code, "BEM10");
});

await ok("percent coupon discounts the items only", async () => {
  const r = await place(pickup({ coupon_code: "bem10", expected_discount_cents: 500 }));
  assert.equal(r.discount_cents, 500);
  assert.equal(r.total_cents, 4500);
  const { rows } = await db.query("select coupon_code,discount_cents,total_cents from orders where id=$1", [r.id]);
  assert.deepEqual(rows[0], { coupon_code: "BEM10", discount_cents: 500, total_cents: 4500 });
});

await ok("fixed coupon larger than the subtotal discounts the subtotal", async () => {
  const r = await place(pickup({ coupon_code: "FIXO30", expected_discount_cents: 3000 }));
  assert.equal(r.discount_cents, 3000);
  assert.equal(r.total_cents, 2000);
  // Discount would equal the whole subtotal: a free pickup order is rejected (total must stay positive)...
  await rejects(
    () => place(pickup({ items: items(1), coupon_code: "FIXO30", expected_discount_cents: 2500 })),
    "COUPON_EXCEEDS_TOTAL",
  );
  // ...and so is a delivery to a zone with no fee.
  await root();
  await db.query(
    "insert into delivery_zones(id,restaurant_id,name,fee_cents,estimate_minutes,active) values($1,$2,'Grátis',0,40,true)",
    [zoneFree, a],
  );
  await coupon(ownerA, null, { code: "FIXO80", kind: "fixed", value: 8000 });
  await rejects(
    () => place(delivery({ address: { zone_id: zoneFree, street: "Rua das Flores", number: "120" }, expected_fee_cents: 0, coupon_code: "FIXO80", expected_discount_cents: 5000 })),
    "COUPON_EXCEEDS_TOTAL",
  );
  // ...while a delivery still pays the fee, so the discount is capped at the subtotal.
  const capped = await place(delivery({ coupon_code: "FIXO80", expected_discount_cents: 5000 }));
  assert.equal(capped.discount_cents, 5000);
  assert.equal(capped.total_cents, 700);
});

await ok("delivery fee is not discounted and the minimum still uses the item subtotal", async () => {
  const r = await place(delivery({ coupon_code: "BEM10", expected_discount_cents: 500 }));
  assert.equal(r.total_cents, 5000 - 500 + 700);
  // Subtotal 2500 is below the 3000 minimum even though the coupon is valid.
  await rejects(
    () => place(delivery({ items: items(1), coupon_code: "BEM10", expected_discount_cents: 250 })),
    "BELOW_MINIMUM",
  );
  // Subtotal 5000 passes the minimum although subtotal minus discount (2000) would not.
  const big = await place(delivery({ coupon_code: "FIXO30", expected_discount_cents: 3000 }));
  assert.equal(big.total_cents, 5000 - 3000 + 700);
});

await ok("invalid, paused, expired and below-minimum coupons are rejected", async () => {
  await rejects(() => place(pickup({ coupon_code: "NAOEXISTE", expected_discount_cents: 0 })), "COUPON_INVALID");
  await rejects(() => place(pickup({ coupon_code: "PAUSADO", expected_discount_cents: 500 })), "COUPON_INVALID");
  await rejects(() => place(pickup({ coupon_code: "VENCIDO", expected_discount_cents: 500 })), "COUPON_EXPIRED");
  await rejects(() => place(pickup({ coupon_code: "MIN100", expected_discount_cents: 500 })), "COUPON_MIN_ORDER");
});

await ok("a coupon valid until today in the restaurant timezone still works; yesterday does not", async () => {
  await root();
  const { rows } = await db.query(
    "select ((now() at time zone 'America/Sao_Paulo')::date)::text as today,((now() at time zone 'America/Sao_Paulo')::date-1)::text as yesterday",
  );
  await coupon(ownerA, null, { code: "HOJE", kind: "percent", value: 10, valid_until: rows[0].today });
  await coupon(ownerA, null, { code: "ONTEM", kind: "percent", value: 10, valid_until: rows[0].yesterday });
  const r = await place(pickup({ coupon_code: "HOJE", expected_discount_cents: 500 }));
  assert.equal(r.discount_cents, 500);
  await rejects(() => place(pickup({ coupon_code: "ONTEM", expected_discount_cents: 500 })), "COUPON_EXPIRED");
});

await ok("a different expected discount asks the customer to confirm again", async () => {
  await rejects(() => place(pickup({ coupon_code: "BEM10", expected_discount_cents: 400 })), "PRICE_CHANGED");
  await rejects(() => place(pickup({ coupon_code: "BEM10" })), "PRICE_CHANGED");
});

await ok("idempotent replay returns the same order with its discount", async () => {
  const key = crypto.randomUUID();
  const token = await guest();
  const first = await place(pickup({ coupon_code: "BEM10", expected_discount_cents: 500 }), key, token);
  const second = await place(pickup({ coupon_code: "BEM10", expected_discount_cents: 500 }), key, token);
  assert.equal(second.id, first.id);
  assert.equal(second.total_cents, first.total_cents);
  assert.equal(second.discount_cents, 500);
});

await ok("replaying a key with a different coupon or origin is an idempotency conflict", async () => {
  const key = crypto.randomUUID();
  const token = await guest();
  await place(pickup({ coupon_code: "BEM10", expected_discount_cents: 500 }), key, token);
  await rejects(() => place(pickup({ coupon_code: "FIXO30", expected_discount_cents: 3000 }), key, token), "IDEMPOTENCY_CONFLICT");
  const key2 = crypto.randomUUID();
  const token2 = await guest();
  await place(pickup({ origin: "instagram" }), key2, token2);
  await rejects(() => place(pickup({ origin: "ifood" }), key2, token2), "IDEMPOTENCY_CONFLICT");
});

await ok("orders without a coupon keep a zero discount", async () => {
  const r = await place(pickup());
  assert.equal(r.discount_cents, 0);
  assert.equal(r.total_cents, 5000);
});

// 2. Origin.
await ok("origin: built-in, custom and unknown slugs", async () => {
  await login(ownerA);
  const created = (await db.query("select save_origin($1,'Panfleto Centro') as r", [a])).rows[0].r;
  assert.equal(created.slug, "panfleto-centro");
  const slugOf = async (origin, over = {}) => {
    const r = await place(pickup({ origin, ...over }));
    return (await db.query("select origin from orders where id=$1", [r.id])).rows[0].origin;
  };
  assert.equal(await slugOf("instagram"), "instagram");
  assert.equal(await slugOf("ifood"), "ifood");
  assert.equal(await slugOf("panfleto-centro"), "panfleto-centro");
  assert.equal(await slugOf("inventado"), null);
  assert.equal(await slugOf(undefined), null);
  // Table orders never carry a URL origin.
  const t = await place({ ...base, table_id: table, items: items(1), origin: "instagram" });
  assert.equal((await db.query("select origin from orders where id=$1", [t.id])).rows[0].origin, null);
});

// 3. Owner functions and permissions.
await ok("save_coupon rejects duplicates, changing a used code and invalid input", async () => {
  await rejects(() => coupon(ownerA, null, { code: "bem10", kind: "percent", value: 5 }), "COUPON_DUPLICATE");
  await rejects(() => coupon(ownerA, percentId, { ...percent10, code: "OUTRO10" }), "COUPON_USED");
  // Same code is fine on a used coupon: only its value changes.
  assert.equal(await coupon(ownerA, percentId, { ...percent10, value: 15 }), percentId);
  await rejects(() => coupon(ownerA, null, { code: "X", kind: "percent", value: 10 }), "INVALID_INPUT");
  await rejects(() => coupon(ownerA, null, { code: "ABC", kind: "percent", value: 95 }), "INVALID_INPUT");
  await rejects(() => coupon(ownerA, null, { code: "ABC", kind: "percent", value: "dez" }), "INVALID_INPUT");
  await rejects(() => coupon(ownerA, null, { code: "ABC", kind: "bonus", value: 10 }), "INVALID_INPUT");
  await rejects(
    () => coupon(ownerA, "00000000-0000-4000-8000-000000000000", { ...percent10 }),
    "NOT_FOUND",
  );
  await coupon(ownerA, percentId, { ...percent10, value: 10 });
});

await ok("delete_coupon blocks used coupons and deletes unused ones", async () => {
  await login(ownerA);
  await rejects(() => db.query("select delete_coupon($1,$2)", [a, percentId]), "COUPON_USED");
  const spare = await coupon(ownerA, null, { code: "SOBRA", kind: "fixed", value: 100 });
  await login(ownerA);
  await db.query("select delete_coupon($1,$2)", [a, spare]);
  await rejects(() => db.query("select delete_coupon($1,$2)", [a, spare]), "NOT_FOUND");
});

await ok("coupon_stats counts uses and discount of non-cancelled orders", async () => {
  await root();
  await db.query("update orders set status='cancelado' where id=(select id from orders where coupon_code='HOJE' limit 1)");
  await login(ownerA);
  const stats = (await db.query("select coupon_stats($1) as r", [a])).rows[0].r;
  assert.equal(stats.HOJE, undefined);
  assert.equal(stats.BEM10.discount_cents, stats.BEM10.uses * 500);
  assert.ok(stats.BEM10.uses >= 3);
});

await ok("only the owner calls owner functions; others are blocked", async () => {
  for (const user of [staffA, ownerB]) {
    await login(user);
    await rejects(() => db.query("select save_coupon($1,null,$2)", [a, JSON.stringify(percent10)]), "FORBIDDEN");
    await rejects(() => db.query("select delete_coupon($1,$2)", [a, percentId]), "FORBIDDEN");
    await rejects(() => db.query("select coupon_stats($1)", [a]), "FORBIDDEN");
    await rejects(() => db.query("select save_origin($1,'Teste')", [a]), "FORBIDDEN");
    await rejects(() => db.query("select delete_origin($1,$2)", [a, percentId]), "FORBIDDEN");
    await rejects(() => db.query("select lapsed_customers($1,30,0)", [a]), "FORBIDDEN");
    await rejects(() => db.query("select origin_report($1,'2026-11-01')", [a]), "FORBIDDEN");
  }
  await anon();
  await rejects(() => db.query("select save_coupon($1,null,$2)", [a, JSON.stringify(percent10)]), "permission denied");
  await rejects(() => db.query("select coupon_stats($1)", [a]), "permission denied");
  await rejects(() => db.query("select lapsed_customers($1,30,0)", [a]), "permission denied");
  await rejects(() => db.query("select coupon_discount($1,'BEM10',5000)", [a]), "permission denied");
  await rejects(() => db.query("select place_guest_order($1,'x',$2,'{}')", [a, crypto.randomUUID()]), "permission denied");
});

await ok("check_coupon is API-only: anon and authenticated are denied, the service role works", async () => {
  await anon();
  await rejects(() => db.query("select check_coupon($1,'BEM10')", [a]), "permission denied");
  await login(ownerA);
  await rejects(() => db.query("select check_coupon($1,'BEM10')", [a]), "permission denied");
  await root();
  await db.exec("set role service_role");
  const r = (await db.query("select check_coupon($1,' bem10 ') as r", [a])).rows[0].r;
  assert.deepEqual(r, { code: "BEM10", kind: "percent", value: 10, min_order_cents: 0, valid_until: null });
  const dated = (await db.query("select check_coupon($1,'HOJE') as r", [a])).rows[0].r;
  assert.match(dated.valid_until, /^\d{4}-\d{2}-\d{2}$/);
  await rejects(() => db.query("select check_coupon($1,'PAUSADO')", [a]), "COUPON_INVALID");
  await rejects(() => db.query("select check_coupon($1,'VENCIDO')", [a]), "COUPON_EXPIRED");
  await rejects(() => db.query("select check_coupon($1,'BEM10')", [b]), "COUPON_INVALID");
  await anon();
  await rejects(() => db.query("select * from coupons"), "permission denied");
});

await ok("members read their own coupons and origins through RLS; others do not", async () => {
  await login(staffA);
  assert.ok((await db.query("select 1 from coupons")).rows.length >= 5);
  assert.ok((await db.query("select 1 from order_origins")).rows.length >= 1);
  await login(ownerB);
  assert.equal((await db.query("select 1 from coupons")).rows.length, 0);
  assert.equal((await db.query("select 1 from order_origins")).rows.length, 0);
  await rejects(() => db.query("insert into coupons(restaurant_id,code,kind,value) values($1,'ABC','percent',5)", [b]), "permission denied");
});

// 4. Origins.
await ok("save_origin builds unique slugs and enforces the limit", async () => {
  await login(ownerA);
  const slug = async (name) => (await db.query("select save_origin($1,$2) as r", [a, name])).rows[0].r.slug;
  assert.equal(await slug("Panfleto Centro"), "panfleto-centro-2");
  assert.equal(await slug("Instagram"), "instagram-2");
  assert.equal(await slug("Promoção São João"), "promocao-sao-joao");
  assert.equal(await slug("!!"), "origem");
  assert.equal(await slug("ÁGUA Viva"), "agua-viva");
  assert.equal(await slug("Direto"), "direto-2");
  const long = await slug("abcdefghijklmnopqrstuvwxy zzzzzzzzzzzzz");
  assert.equal(long, "abcdefghijklmnopqrstuvwxy");
  assert.ok(!long.endsWith("-"));
  await rejects(() => db.query("select save_origin($1,'a')", [a]), "INVALID_INPUT");
  const { rows } = await db.query("select count(*)::int n from order_origins where restaurant_id=$1", [a]);
  for (let i = rows[0].n; i < 20; i++) await slug("Origem Extra " + String.fromCharCode(65 + i));
  await rejects(() => db.query("select save_origin($1,'Vigésima Primeira')", [a]), "LIMIT_REACHED");
});

await ok("delete_origin removes it and reports missing ones", async () => {
  await login(ownerA);
  const created = (await db.query("select id from order_origins where restaurant_id=$1 and slug='origem'", [a])).rows[0];
  await db.query("select delete_origin($1,$2)", [a, created.id]);
  await rejects(() => db.query("select delete_origin($1,$2)", [a, created.id]), "NOT_FOUND");
});

// 5. Lapsed customers.
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
async function contactWithOrder(phone, name, status, days) {
  await root();
  await db.query("insert into contacts(restaurant_id,name,phone,marketing_status) values($1,$2,$3,$4)", [a, name, phone, status]);
  const { rows } = await db.query(
    "insert into guest_sessions(restaurant_id,token_hash,expires_at) values($1,$2,now()+interval '1 day') returning id",
    [a, "9" + phone.padStart(63, "0")],
  );
  await db.query(
    `insert into orders(restaurant_id,guest_session_id,customer_name,customer_phone,total_cents,status,idempotency_key,payload_hash,fulfillment,payment_method,created_at)
     values($1,$2,$3,$4,3000,'entregue',$5,'x','retirada','pix',$6)`,
    [a, rows[0].id, name, phone, crypto.randomUUID(), daysAgo(days)],
  );
}
await contactWithOrder("11900000031", "Antigo 40", "authorized", 40);
await contactWithOrder("11900000032", "Antigo 70", "authorized", 70);
await contactWithOrder("11900000033", "Antigo 100", "authorized", 100);
await contactWithOrder("11900000034", "Recente", "authorized", 5);
await contactWithOrder("11900000035", "Sem consentimento", "not_authorized", 200);

await ok("lapsed_customers lists only authorized customers inactive for N days", async () => {
  await login(ownerA);
  const get = async (days, offset = 0) => (await db.query("select lapsed_customers($1,$2,$3) as r", [a, days, offset])).rows[0].r;
  const d30 = await get(30);
  assert.equal(d30.total, 3);
  assert.deepEqual(d30.rows.map((r) => r.name), ["Antigo 100", "Antigo 70", "Antigo 40"]);
  assert.equal(d30.rows[0].orders_count, 1);
  assert.equal(d30.rows[0].spent_cents, 3000);
  assert.equal((await get(60)).total, 2);
  assert.deepEqual((await get(90)).rows.map((r) => r.name), ["Antigo 100"]);
  assert.equal((await get(30, 2)).rows.length, 1);
  await rejects(() => db.query("select lapsed_customers($1,45,0)", [a]), "INVALID_INPUT");
  await rejects(() => db.query("select lapsed_customers($1,30,-1)", [a]), "INVALID_INPUT");
});

// 6. Origin report.
await ok("origin_report groups delivered orders by origin within the month", async () => {
  await root();
  for (const t of ["order_addresses", "order_items", "order_status_events", "orders"])
    await db.query(`delete from ${t} where restaurant_id=$1`, [a]);
  const { rows: g } = await db.query(
    "insert into guest_sessions(restaurant_id,token_hash,expires_at) values($1,$2,now()+interval '1 day') returning id",
    [a, "f".padStart(64, "0")],
  );
  const add = (kind, origin, total, at, status = "entregue") =>
    db.query(
      `insert into orders(restaurant_id,guest_session_id,table_id,customer_name,customer_phone,total_cents,status,idempotency_key,payload_hash,fulfillment,payment_method,origin,created_at)
       values($1,$2,$3,'C','11900000099',$4,$5,$6,'x',$7,$8,$9,$10)`,
      [a, g[0].id, kind === "mesa" ? table : null, total, status, crypto.randomUUID(), kind, kind === "mesa" ? null : "pix", origin, at],
    );
  await add("mesa", "instagram", 1000, "2026-11-05T15:00:00Z");
  await add("retirada", null, 2000, "2026-11-06T15:00:00Z");
  await add("entrega", null, 3000, "2026-11-07T15:00:00Z");
  await add("retirada", "instagram", 4000, "2026-11-08T15:00:00Z");
  await add("retirada", "panfleto-centro", 1500, "2026-11-09T15:00:00Z");
  await add("retirada", "instagram", 9999, "2026-11-10T15:00:00Z", "cancelado");
  // Dec 1 02:30 UTC is still Nov 30 in São Paulo (counts); Nov 1 02:00 UTC is Oct 31 (does not).
  await add("retirada", "ifood", 700, "2026-12-01T02:30:00Z");
  await add("retirada", "ifood", 800, "2026-11-01T02:00:00Z");
  await login(ownerA);
  const report = (await db.query("select origin_report($1,'2026-11-15') as r", [a])).rows[0].r;
  assert.deepEqual(report, [
    { origin: "direto", orders: 2, total_cents: 5000 },
    { origin: "instagram", orders: 1, total_cents: 4000 },
    { origin: "panfleto-centro", orders: 1, total_cents: 1500 },
    { origin: "mesa", orders: 1, total_cents: 1000 },
    { origin: "ifood", orders: 1, total_cents: 700 },
  ]);
  await rejects(() => db.query("select origin_report($1,null)", [a]), "INVALID_INPUT");
});

console.log(`${count} coupon database checks passed`);
