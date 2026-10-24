import assert from "node:assert/strict";
import { createTestDatabase } from "./lib/test-db.mjs";

const db = await createTestDatabase();
let count = 0;
const a = "10000000-0000-4000-8000-0000000000a1",
  b = "10000000-0000-4000-8000-0000000000b1",
  ownerA = "20000000-0000-4000-8000-0000000000a1",
  ownerB = "20000000-0000-4000-8000-0000000000b1",
  staffA = "20000000-0000-4000-8000-0000000000a2",
  ca = "30000000-0000-4000-8000-0000000000a1",
  pa = "40000000-0000-4000-8000-0000000000a1",
  table = "60000000-0000-4000-8000-0000000000a1",
  zone = "90000000-0000-4000-8000-0000000000a1",
  zoneOff = "90000000-0000-4000-8000-0000000000a2",
  zoneB = "90000000-0000-4000-8000-0000000000b1";
const allDay = JSON.stringify(
  Array.from({ length: 7 }, (_, day) => ({ day, open: "00:00", close: "23:59:59" })),
);
await db.query("insert into auth.users values($1),($2),($3)", [ownerA, ownerB, staffA]);
await db.query(
  `insert into restaurants(id,name,slug,accepting_orders,opening_hours,pickup_enabled,delivery_enabled,delivery_min_order_cents)
   values($1,'Casa A','casa-a',true,$3,true,true,3000),($2,'Casa B','casa-b',true,$3,false,false,0)`,
  [a, b, allDay],
);
await db.query(
  "insert into restaurant_members values($1,$2,'owner'),($3,$4,'owner'),($1,$5,'operations')",
  [a, ownerA, b, ownerB, staffA],
);
await db.query("insert into categories(id,restaurant_id,name) values($1,$2,'Lanches')", [ca, a]);
await db.query(
  "insert into products(id,restaurant_id,category_id,name,price_cents,published) values($1,$2,$3,'Burger',2500,true)",
  [pa, a, ca],
);
await db.query("insert into dining_tables(id,restaurant_id,number) values($1,$2,1)", [table, a]);
await db.query(
  `insert into delivery_zones(id,restaurant_id,name,fee_cents,estimate_minutes,active) values
   ($1,$4,'Centro',700,40,true),($2,$4,'Longe',1500,60,false),($3,$5,'Outro',500,30,true)`,
  [zone, zoneOff, zoneB, a, b],
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
const items = (quantity) => [{ product_id: pa, quantity, expected_price: 2500, note: "" }];
const base = { name: "Cliente Teste", phone: "11988887777", marketing_consent: false };
const delivery = (over = {}) => ({
  ...base,
  fulfillment: "entrega",
  payment_method: "dinheiro",
  change_for_cents: 10000,
  expected_fee_cents: 700,
  address: { zone_id: zone, street: "Rua das Flores", number: "120", complement: "Apto 3", reference: "Portão azul" },
  items: items(2),
  ...over,
});
async function place(token, payload, key = crypto.randomUUID()) {
  await root();
  const { rows } = await db.query("select place_guest_order($1,$2,$3,$4) as r", [
    a,
    token,
    key,
    JSON.stringify(payload),
  ]);
  return rows[0].r;
}
async function rejects(fn, code) {
  await assert.rejects(fn, (error) => String(error.message).includes(code));
}
async function advance(user, order, expected, status, reason = null, estimate = null) {
  await login(user);
  const { rows } = await db.query("select advance_order($1,$2,$3,$4,$5,$6) as r", [
    a,
    order,
    expected,
    status,
    reason,
    estimate,
  ]);
  return rows[0].r;
}

await ok("table order keeps its contract and starts as recebido", async () => {
  const r = await place(await guest(), { ...base, table_id: table, items: items(1) });
  assert.equal(r.status, "recebido");
  const { rows } = await db.query("select fulfillment,table_id,payment_method,delivery_fee_cents from orders where id=$1", [r.id]);
  assert.deepEqual(rows[0], { fulfillment: "mesa", table_id: table, payment_method: null, delivery_fee_cents: 0 });
});

let pickupId;
await ok("pickup order needs payment, has no table and awaits acceptance", async () => {
  const token = await guest();
  await rejects(() => place(token, { ...base, fulfillment: "retirada", items: items(1) }), "INVALID_PAYMENT");
  const r = await place(token, { ...base, fulfillment: "retirada", payment_method: "pix", items: items(1) });
  pickupId = r.id;
  assert.equal(r.status, "aguardando_aceite");
  assert.equal(r.total_cents, 2500);
  const { rows } = await db.query("select table_id,fulfillment from orders where id=$1", [r.id]);
  assert.deepEqual(rows[0], { table_id: null, fulfillment: "retirada" });
});

let deliveryId;
await ok("delivery adds the zone fee on the server and stores the address snapshot", async () => {
  const r = await place(await guest(), delivery());
  deliveryId = r.id;
  assert.equal(r.status, "aguardando_aceite");
  assert.equal(r.total_cents, 2500 * 2 + 700);
  const { rows } = await db.query("select zone_name,street,number from order_addresses where order_id=$1", [r.id]);
  assert.deepEqual(rows[0], { zone_name: "Centro", street: "Rua das Flores", number: "120" });
  // PostgREST embeds one-to-one only when the FK columns match a unique key exactly.
  const unique = await db.query(
    `select 1 from pg_constraint where conrelid='public.order_addresses'::regclass and contype in ('p','u')
     and (select array_agg(attname::text order by attname) from pg_attribute where attrelid=conrelid and attnum=any(conkey))=array['order_id','restaurant_id']`,
  );
  assert.equal(unique.rows.length, 1);
});

await ok("delivery rejects disabled modes, foreign or paused zones, bad address, minimum and change", async () => {
  const token = await guest();
  await rejects(() => place(token, delivery({ address: { ...delivery().address, zone_id: zoneOff } })), "INVALID_ZONE");
  await rejects(() => place(token, delivery({ address: { ...delivery().address, zone_id: zoneB } })), "INVALID_ZONE");
  await rejects(() => place(token, delivery({ address: { ...delivery().address, street: "R" } })), "INVALID_ADDRESS");
  await rejects(() => place(token, delivery({ items: items(1) })), "BELOW_MINIMUM");
  await rejects(() => place(token, delivery({ change_for_cents: 1000 })), "INVALID_CHANGE");
  await rejects(() => place(token, delivery({ payment_method: "cartao", change_for_cents: 10000 })), "INVALID_CHANGE");
  await rejects(() => place(token, delivery({ expected_fee_cents: 500 })), "PRICE_CHANGED");
  const withoutFee = { ...delivery() };
  delete withoutFee.expected_fee_cents;
  await rejects(() => place(token, withoutFee), "PRICE_CHANGED");
  await root();
  await db.query("update restaurants set delivery_enabled=false,pickup_enabled=false where id=$1", [a]);
  await rejects(() => place(token, delivery()), "DELIVERY_DISABLED");
  await rejects(() => place(token, { ...base, fulfillment: "retirada", payment_method: "pix", items: items(1) }), "PICKUP_DISABLED");
  await db.query("update restaurants set delivery_enabled=true,pickup_enabled=true where id=$1", [a]);
});

await ok("idempotent retry returns the same order; changed payload with same key conflicts", async () => {
  const token = await guest();
  const key = crypto.randomUUID();
  const first = await place(token, delivery(), key);
  const again = await place(token, delivery(), key);
  assert.equal(again.id, first.id);
  await rejects(() => place(token, delivery({ payment_method: "pix", change_for_cents: null }), key), "IDEMPOTENCY_CONFLICT");
});

await ok("acceptance requires an estimate; refusal requires a reason", async () => {
  await rejects(() => advance(staffA, pickupId, "aguardando_aceite", "recebido"), "INVALID_TRANSITION");
  await rejects(() => advance(staffA, pickupId, "aguardando_aceite", "em_preparo", null, 20), "INVALID_TRANSITION");
  const accepted = await advance(staffA, pickupId, "aguardando_aceite", "recebido", null, 20);
  assert.equal(accepted.status, "recebido");
  const other = await place(await guest(), delivery());
  await rejects(() => advance(ownerA, other.id, "aguardando_aceite", "recusado", "x"), "INVALID_TRANSITION");
  await advance(ownerA, other.id, "aguardando_aceite", "recusado", "Fora da área");
  await root();
  const { rows } = await db.query("select status,cancellation_reason from orders where id=$1", [other.id]);
  assert.deepEqual(rows[0], { status: "recusado", cancellation_reason: "Fora da área" });
});

await ok("pickup ends at entregue after pronto; delivery must go out for delivery first", async () => {
  await advance(staffA, pickupId, "recebido", "em_preparo");
  await advance(staffA, pickupId, "em_preparo", "pronto");
  await rejects(() => advance(staffA, pickupId, "pronto", "saiu_para_entrega"), "INVALID_TRANSITION");
  await advance(staffA, pickupId, "pronto", "entregue");
  await advance(staffA, deliveryId, "aguardando_aceite", "recebido", null, 45);
  await advance(staffA, deliveryId, "recebido", "em_preparo");
  await advance(staffA, deliveryId, "em_preparo", "pronto");
  await rejects(() => advance(staffA, deliveryId, "pronto", "entregue"), "INVALID_TRANSITION");
  await advance(staffA, deliveryId, "pronto", "saiu_para_entrega");
  await advance(staffA, deliveryId, "saiu_para_entrega", "entregue");
});

await ok("an order out for delivery can be cancelled with a reason", async () => {
  const r = await place(await guest(), delivery());
  await advance(staffA, r.id, "aguardando_aceite", "recebido", null, 30);
  await advance(staffA, r.id, "recebido", "em_preparo");
  await advance(staffA, r.id, "em_preparo", "pronto");
  await advance(staffA, r.id, "pronto", "saiu_para_entrega");
  await advance(staffA, r.id, "saiu_para_entrega", "cancelado", "Cliente ausente");
});

await ok("addresses are readable by members only, never by anon or another tenant", async () => {
  await login(staffA);
  assert.equal((await db.query("select 1 from order_addresses where order_id=$1", [deliveryId])).rows.length, 1);
  await login(ownerB);
  assert.equal((await db.query("select 1 from order_addresses where order_id=$1", [deliveryId])).rows.length, 0);
  await anon();
  await rejects(() => db.query("select 1 from order_addresses"), "permission denied");
  await root();
});

await ok("anon reads only active zones; only the owner saves zones of their own restaurant", async () => {
  await anon();
  const { rows } = await db.query("select id from delivery_zones where restaurant_id=$1 order by name", [a]);
  assert.deepEqual(rows.map((r) => r.id), [zone]);
  await rejects(() => db.query("insert into delivery_zones(restaurant_id,name,fee_cents,estimate_minutes) values($1,'X',1,10)", [a]), "permission denied");
  await login(staffA);
  await rejects(() => db.query("select save_delivery_zone($1,$2,'Novo',100,20,true,0)", [a, crypto.randomUUID()]), "FORBIDDEN");
  await login(ownerB);
  await rejects(() => db.query("select save_delivery_zone($1,$2,'Invasão',100,20,true,0)", [b, zone]), "FORBIDDEN");
  await root();
  const untouched = await db.query("select restaurant_id,name from delivery_zones where id=$1", [zone]);
  assert.deepEqual(untouched.rows[0], { restaurant_id: a, name: "Centro" });
  await login(ownerA);
  const id = crypto.randomUUID();
  await db.query("select save_delivery_zone($1,$2,'Jardins',900,50,true,2)", [a, id]);
  await db.query("select save_delivery_zone($1,$2,'Jardins',950,55,false,2)", [a, id]);
  await root();
  const saved = await db.query("select fee_cents,estimate_minutes,active from delivery_zones where id=$1", [id]);
  assert.deepEqual(saved.rows[0], { fee_cents: 950, estimate_minutes: 55, active: false });
});

await ok("settings persist the online modes and minimum, keeping existing fields", async () => {
  await login(ownerA);
  await db.query("select save_restaurant_settings($1,$2,$3)", [
    a,
    JSON.stringify({
      name: "Casa A", subtitle: "", phone: "", address: "", privacy_email: "a@a.com",
      retention_days: 90, accepting_orders: true, opening_hours: JSON.parse(allDay),
      pickup_enabled: false, delivery_enabled: true, delivery_min_order_cents: 4500,
    }),
    1,
  ]);
  await root();
  const { rows } = await db.query("select pickup_enabled,delivery_enabled,delivery_min_order_cents from restaurants where id=$1", [a]);
  assert.deepEqual(rows[0], { pickup_enabled: false, delivery_enabled: true, delivery_min_order_cents: 4500 });
});

await ok("order_online is a valid rate-limit scope with 12 attempts per window", async () => {
  const subject = "f".repeat(64);
  let last;
  for (let i = 0; i < 13; i++)
    last = (await db.query("select consume_public_rate_limit($1,'order_online',$2) as r", [a, subject])).rows[0].r;
  assert.equal(last.allowed, false);
});

await db.close();
console.log(`${count} online-order database checks passed.`);
