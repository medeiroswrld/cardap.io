import assert from "node:assert/strict";
import { createTestDatabase, MIGRATIONS, applyMigration } from "./lib/test-db.mjs";

let count = 0;
async function ok(name, fn) {
  await fn();
  console.log("PASS " + name);
  count++;
}
async function rejects(fn, code) {
  await assert.rejects(fn, (error) => String(error.message).includes(code));
}
const [r1, r2, r3, r4] = ["a1", "a2", "a3", "a4"].map(
  (n) => `19000000-0000-4000-8000-0000000000${n}`,
);
const ownerA = "29000000-0000-4000-8000-0000000000a1",
  staffA = "29000000-0000-4000-8000-0000000000a2",
  ownerB = "29000000-0000-4000-8000-0000000000b1";
const SP = "America/Sao_Paulo",
  KI = "Pacific/Kiritimati";

// Stepwise: restaurants exist BEFORE 021 is applied.
const db = await createTestDatabase(
  MIGRATIONS.filter((f) => f !== "021_billing.sql"),
);
await db.query("insert into auth.users values($1),($2),($3)", [ownerA, staffA, ownerB]);
await db.query(
  "insert into restaurants(id,name,slug,accepting_orders,timezone) values($1,'Casa A','bil-a',true,$4),($2,'Casa B','bil-b',true,$4),($3,'Casa C','bil-c',true,$5)",
  [r1, r2, r3, SP, KI],
);
await db.query(
  "insert into restaurant_members values($1,$2,'owner'),($1,$3,'operations'),($4,$5,'owner')",
  [r1, ownerA, staffA, r2, ownerB],
);
await applyMigration(db, "021_billing.sql");

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
const rpc = async (fn, ...args) => {
  const ph = args.map((_, i) => "$" + (i + 1)).join(",");
  const { rows } = await db.query(`select public.${fn}(${ph}) r`, args);
  return rows[0].r;
};
const offset = async (tz, n) => {
  await root();
  const { rows } = await db.query(
    "select ((now() at time zone $1)::date + $2::int)::text d",
    [tz, n],
  );
  return rows[0].d;
};
// set: column assignments using $2.. placeholders for vals
const setBilling = async (id, set, ...vals) => {
  await root();
  await db.query(`update restaurant_billing set ${set} where restaurant_id=$1`, [id, ...vals]);
};
const state = (id) => rpc("restaurant_billing_state", id);
const plan = (id) => rpc("restaurant_plan", id);

await ok("existing restaurants got cortesia/profissional rows", async () => {
  await root();
  const { rows } = await db.query(
    "select plan,status,cycle,founder,price_cents from restaurant_billing",
  );
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.deepEqual(
      { ...row },
      { plan: "profissional", status: "cortesia", cycle: "mensal", founder: false, price_cents: 0 },
    );
  }
  await db.query(
    "insert into restaurant_billing(restaurant_id,plan,status) select id,'profissional','cortesia' from restaurants on conflict (restaurant_id) do nothing",
  );
  assert.equal((await db.query("select count(*)::int n from restaurant_billing")).rows[0].n, 3);
});

await ok("restaurant without a row is pendente / essencial", async () => {
  await root();
  await db.query(
    "insert into restaurants(id,name,slug,accepting_orders,timezone) values($1,'Casa D','bil-d',true,$2)",
    [r4, SP],
  );
  await db.query("delete from restaurant_billing where restaurant_id=$1", [r4]);
  assert.equal(await state(r4), "pendente");
  assert.equal(await plan(r4), "essencial");
  assert.equal(await state(crypto.randomUUID()), "pendente");
});

await ok("check constraints", async () => {
  await root();
  for (const sql of [
    "update restaurant_billing set plan='x' where restaurant_id=$1",
    "update restaurant_billing set status='x' where restaurant_id=$1",
    "update restaurant_billing set cycle='x' where restaurant_id=$1",
    "update restaurant_billing set price_cents=-1 where restaurant_id=$1",
    "update restaurant_billing set pending_plan='agencia' where restaurant_id=$1",
  ])
    await rejects(() => db.query(sql, [r1]), "violates check constraint");
});

await ok("state: status passes through", async () => {
  for (const st of ["pendente", "ativo", "cortesia", "cancelado", "atrasado"]) {
    await setBilling(r1, "status=$2, overdue_since=null, cancel_at=null", st);
    assert.equal(await state(r1), st);
  }
});

await ok("atrasado 7-day boundary in restaurant timezone", async () => {
  await setBilling(r1, "status='atrasado', overdue_since=$2", await offset(SP, -7));
  assert.equal(await state(r1), "atrasado");
  await setBilling(r1, "overdue_since=$2", await offset(SP, -8));
  assert.equal(await state(r1), "bloqueado");
  await setBilling(r1, "overdue_since=$2", await offset(SP, 0));
  assert.equal(await state(r1), "atrasado");
  await setBilling(r1, "overdue_since=null");
  assert.equal(await state(r1), "atrasado");
  // Kiritimati (UTC+14) is on a later calendar date than Sao Paulo (UTC-3) for 17 of 24 hours;
  // the boundary is measured against the restaurant's own local date.
  const ki7 = await offset(KI, -7),
    ki8 = await offset(KI, -8);
  await setBilling(r3, "status='atrasado', overdue_since=$2", ki7);
  assert.equal(await state(r3), "atrasado");
  await setBilling(r3, "overdue_since=$2", ki8);
  assert.equal(await state(r3), "bloqueado");
  await setBilling(r3, "status='cortesia', overdue_since=null");
});

await ok("cancel_at: cancelado once reached (local date), keeps status", async () => {
  await setBilling(r1, "status='ativo', overdue_since=null, cancel_at=$2", await offset(SP, 1));
  assert.equal(await state(r1), "ativo");
  assert.equal(await plan(r1), "profissional");
  await setBilling(r1, "cancel_at=$2", await offset(SP, 0));
  assert.equal(await state(r1), "cancelado");
  assert.equal(await plan(r1), "essencial");
  await setBilling(r1, "cancel_at=$2", await offset(SP, -5));
  assert.equal(await state(r1), "cancelado");
  // cancel_at wins over a long overdue
  await setBilling(r1, "status='atrasado', overdue_since=$2", await offset(SP, -30));
  assert.equal(await state(r1), "cancelado");
  // clearing cancel_at (reactivation) restores the normal rule
  await setBilling(r1, "status='ativo', overdue_since=null, cancel_at=null");
  assert.equal(await state(r1), "ativo");
  // timezone: local today in Kiritimati
  await setBilling(r3, "status='ativo', cancel_at=$2", await offset(KI, 0));
  assert.equal(await state(r3), "cancelado");
  await setBilling(r3, "cancel_at=$2", await offset(KI, 1));
  assert.equal(await state(r3), "ativo");
  await setBilling(r3, "status='cortesia', cancel_at=null");
});

await ok("plan mapping for every status and plan", async () => {
  const cases = [
    ["essencial", "ativo", null, "essencial"],
    ["essencial", "cortesia", null, "essencial"],
    ["profissional", "ativo", null, "profissional"],
    ["profissional", "cortesia", null, "profissional"],
    ["profissional", "atrasado", await offset(SP, -3), "profissional"],
    ["profissional", "atrasado", await offset(SP, -30), "essencial"], // bloqueado
    ["profissional", "pendente", null, "essencial"],
    ["profissional", "cancelado", null, "essencial"],
    ["agencia", "ativo", null, "profissional"],
    ["agencia", "cortesia", null, "profissional"],
    ["agencia", "atrasado", await offset(SP, -3), "profissional"],
    ["agencia", "pendente", null, "essencial"],
    ["agencia", "cancelado", null, "essencial"],
  ];
  for (const [p, status, since, expected] of cases) {
    await setBilling(r1, "plan=$2, status=$3, overdue_since=$4, cancel_at=null", p, status, since);
    assert.equal(await plan(r1), expected, `${p}/${status}/${since}`);
  }
  await setBilling(r1, "plan='profissional', status='cortesia', overdue_since=null");
});

await ok("founder slots count", async () => {
  await root();
  assert.equal(await rpc("founder_slots_left"), 10);
  await setBilling(r1, "founder=true, status='ativo'");
  assert.equal(await rpc("founder_slots_left"), 9);
  await setBilling(r2, "founder=true, status='pendente'");
  assert.equal(await rpc("founder_slots_left"), 8);
  await setBilling(r3, "founder=true, status='atrasado', overdue_since=null");
  assert.equal(await rpc("founder_slots_left"), 7);
  await setBilling(r3, "status='cancelado'");
  assert.equal(await rpc("founder_slots_left"), 8);
  await setBilling(r3, "status='cortesia'");
  assert.equal(await rpc("founder_slots_left"), 8);
  // scheduled cancellation: slot is freed only once cancel_at is reached
  await setBilling(r2, "status='ativo', cancel_at=$2", await offset(SP, 5));
  assert.equal(await rpc("founder_slots_left"), 8);
  await setBilling(r2, "cancel_at=$2", await offset(SP, 0));
  assert.equal(await rpc("founder_slots_left"), 9);
  // never negative
  await root();
  for (let i = 0; i < 12; i++) {
    const id = crypto.randomUUID();
    await db.query(
      "insert into restaurants(id,name,slug,accepting_orders,timezone) values($1,'Casa F',$2,true,$3)",
      [id, "bil-f" + i, SP],
    );
    await db.query("update restaurant_billing set founder=true where restaurant_id=$1", [id]);
  }
  assert.equal(await rpc("founder_slots_left"), 0);
  await anon();
  assert.equal(await rpc("founder_slots_left"), 0);
});

await ok("owner reads own billing row only, cannot write", async () => {
  await login(ownerA);
  let { rows } = await db.query("select restaurant_id from restaurant_billing");
  assert.deepEqual(rows.map((x) => x.restaurant_id), [r1]);
  await login(ownerB);
  ({ rows } = await db.query("select restaurant_id from restaurant_billing"));
  assert.deepEqual(rows.map((x) => x.restaurant_id), [r2]);
  await rejects(() => db.query("update restaurant_billing set status='ativo'"), "permission denied");
  await rejects(
    () => db.query("insert into restaurant_billing(restaurant_id,plan,status) values(gen_random_uuid(),'essencial','ativo')"),
    "permission denied",
  );
  await rejects(() => db.query("delete from restaurant_billing"), "permission denied");
});

await ok("staff reads nothing in billing", async () => {
  await login(staffA);
  const { rows } = await db.query("select * from restaurant_billing");
  assert.equal(rows.length, 0);
  await rejects(() => db.query("select * from billing_events"), "permission denied");
  assert.equal(typeof (await state(r1)), "string");
});

await ok("anon permissions", async () => {
  await anon();
  await rejects(() => db.query("select * from restaurant_billing"), "permission denied");
  await rejects(() => db.query("select * from billing_events"), "permission denied");
  await rejects(
    () => db.query("insert into billing_events(id,type,payload) values('x','t','{}')"),
    "permission denied",
  );
  await rejects(() => state(r1), "permission denied");
  await rejects(() => state(crypto.randomUUID()), "permission denied");
  assert.ok(["essencial", "profissional"].includes(await plan(r1)));
  assert.equal(typeof (await rpc("founder_slots_left")), "number");
});

await ok("onboard_restaurant creates a pendente/essencial billing row via trigger", async () => {
  const newOwner = "29000000-0000-4000-8000-0000000000c1";
  await root();
  await db.query("insert into auth.users values($1)", [newOwner]);
  await login(newOwner);
  const { rows } = await db.query("select public.onboard_restaurant('Casa Nova','bil-nova') id");
  const id = rows[0].id;
  await root();
  const b = await db.query("select plan,status,founder,price_cents from restaurant_billing where restaurant_id=$1", [id]);
  assert.deepEqual({ ...b.rows[0] }, { plan: "essencial", status: "pendente", founder: false, price_cents: 0 });
  assert.equal(await state(id), "pendente");
  assert.equal(await plan(id), "essencial");
  // pre-existing restaurants were not touched by the trigger/backfill
  assert.equal((await db.query("select count(*)::int n from restaurant_billing where status='cortesia' and plan='profissional'")).rows[0].n >= 1, true);
  await db.query("delete from restaurants where id=$1", [id]);
});

await ok("founder pendente expires after 48h; ativo/atrasado never expire", async () => {
  await root();
  const id = crypto.randomUUID();
  await db.query("insert into restaurants(id,name,slug,accepting_orders,timezone) values($1,'Casa G','bil-g',true,$2)", [id, SP]);
  await db.query("update restaurant_billing set status='cortesia', founder=false");
  await setBilling(id, "founder=true, status='pendente'");
  assert.equal(await rpc("founder_slots_left"), 9);
  await setBilling(id, "created_at=now()-interval '47 hours'");
  assert.equal(await rpc("founder_slots_left"), 9);
  await setBilling(id, "created_at=now()-interval '49 hours'");
  assert.equal(await rpc("founder_slots_left"), 10);
  await setBilling(id, "status='ativo'");
  assert.equal(await rpc("founder_slots_left"), 9);
  await setBilling(id, "status='atrasado', overdue_since=null");
  assert.equal(await rpc("founder_slots_left"), 9);
  await db.query("delete from restaurants where id=$1", [id]);
});

await ok("updated_at trigger bumps on update", async () => {
  await root();
  await db.query("update restaurant_billing set updated_at='2000-01-01' where restaurant_id=$1", [r1]);
  await db.query("update restaurant_billing set updated_at='2000-01-01' where restaurant_id=$1", [r1]);
  let { rows } = await db.query("select updated_at > now() - interval '1 minute' fresh from restaurant_billing where restaurant_id=$1", [r1]);
  assert.equal(rows[0].fresh, true);
  await db.query("update restaurant_billing set price_cents=price_cents where restaurant_id=$1", [r1]);
  ({ rows } = await db.query("select updated_at > now() - interval '1 minute' fresh from restaurant_billing where restaurant_id=$1", [r1]));
  assert.equal(rows[0].fresh, true);
});

await ok("service_role can write billing_events and billing rows", async () => {
  await root();
  await db.exec("set role service_role");
  await db.query("insert into billing_events(id,type,payload) values('svc1','PAYMENT_RECEIVED','{}')");
  await db.query("update restaurant_billing set status=status where restaurant_id=$1", [r1]);
  const { rows } = await db.query("select count(*)::int n from billing_events where id='svc1'");
  assert.equal(rows[0].n, 1);
  await root();
  await db.query("delete from billing_events where id='svc1'");
});

await ok("owner cannot read or write billing_events", async () => {
  await login(ownerA);
  await rejects(() => db.query("select * from billing_events"), "permission denied");
  await rejects(
    () => db.query("insert into billing_events(id,type,payload) values('x','t','{}')"),
    "permission denied",
  );
});

await ok("events: duplicate id rejected; event survives restaurant delete", async () => {
  await root();
  await db.query(
    "insert into billing_events(id,restaurant_id,type,payload) values('evt1',$1,'PAYMENT_RECEIVED',$2)",
    [r4, JSON.stringify({ a: 1 })],
  );
  await assert.rejects(() =>
    db.query("insert into billing_events(id,restaurant_id,type,payload) values('evt1',$1,'x','{}')", [r4]),
  );
  await root();
  await db.query("insert into restaurant_billing(restaurant_id,plan,status) values($1,'essencial','pendente') on conflict (restaurant_id) do nothing", [r4]);
  await db.query("delete from restaurants where id=$1", [r4]);
  const ev = await db.query("select restaurant_id from billing_events where id='evt1'");
  assert.equal(ev.rows[0].restaurant_id, null);
  const bl = await db.query("select count(*)::int n from restaurant_billing where restaurant_id=$1", [r4]);
  assert.equal(bl.rows[0].n, 0);
});

await ok("start_subscription: prices, founder rules, reset, permissions", async () => {
  await root();
  await db.query("update restaurant_billing set founder=false");
  const id = crypto.randomUUID();
  await db.query("insert into restaurants(id,name,slug,accepting_orders,timezone) values($1,'Casa H','bil-h',true,$2)", [id, SP]);
  await db.exec("set role service_role");
  const start = async (p, c, w) => (await db.query("select public.start_subscription($1,$2,$3,$4) r", [id, p, c, w])).rows[0].r;
  assert.deepEqual(await start("essencial", "mensal", true), { founder: false, price_cents: 14900 });
  assert.deepEqual(await start("essencial", "anual", false), { founder: false, price_cents: 149000 });
  assert.deepEqual(await start("profissional", "anual", true), { founder: false, price_cents: 249000 });
  assert.deepEqual(await start("profissional", "mensal", false), { founder: false, price_cents: 24900 });
  assert.deepEqual(await start("profissional", "mensal", true), { founder: true, price_cents: 17900 });
  // a pending founder retrying keeps its own slot
  assert.deepEqual(await start("profissional", "mensal", true), { founder: true, price_cents: 17900 });
  await root();
  const row = (await db.query("select plan,cycle,status,founder,price_cents from restaurant_billing where restaurant_id=$1", [id])).rows[0];
  assert.deepEqual({ ...row }, { plan: "profissional", cycle: "mensal", status: "pendente", founder: true, price_cents: 17900 });
  assert.equal(await rpc("founder_slots_left"), 9);
  // fill the remaining 9 slots; the next request is denied the founder price
  for (let i = 0; i < 9; i++) {
    const o = crypto.randomUUID();
    await db.query("insert into restaurants(id,name,slug,accepting_orders,timezone) values($1,'Casa I',$2,true,$3)", [o, "bil-i" + i, SP]);
    await db.query("update restaurant_billing set founder=true,status='ativo' where restaurant_id=$1", [o]);
  }
  assert.equal(await rpc("founder_slots_left"), 0);
  const late = crypto.randomUUID();
  await db.query("insert into restaurants(id,name,slug,accepting_orders,timezone) values($1,'Casa J','bil-j',true,$2)", [late, SP]);
  await db.exec("set role service_role");
  assert.deepEqual((await db.query("select public.start_subscription($1,'profissional','mensal',true) r", [late])).rows[0].r, { founder: false, price_cents: 24900 });
  // a restaurant that is already paying cannot be reset
  await root();
  await db.query("update restaurant_billing set status='ativo' where restaurant_id=$1", [late]);
  await db.exec("set role service_role");
  await rejects(() => db.query("select public.start_subscription($1,'essencial','mensal',false)", [late]), "STATE_CONFLICT");
  await rejects(() => db.query("select public.start_subscription($1,'agencia','mensal',false)", [late]), "INVALID_INPUT");
  await rejects(() => db.query("select public.start_subscription(gen_random_uuid(),'essencial','mensal',false)"), "NOT_FOUND");
  for (const who of [() => login(ownerA), () => anon()]) {
    await who();
    await rejects(() => db.query("select public.start_subscription($1,'essencial','mensal',false)", [id]), "permission denied");
  }
  await root();
  await db.query("delete from restaurants where slug like 'bil-i%' or slug in ('bil-h','bil-j')");
});

await ok("start_subscription: founder window is kept on repeat calls, claims are capped, cancelado reuse clears Asaas ids", async () => {
  await root();
  await db.query("update restaurant_billing set founder=false, founder_claimed_at=null, status='cortesia' where status in ('pendente','cancelado','ativo','atrasado')");
  const ids = [];
  for (let i = 0; i < 5; i++) {
    const id = crypto.randomUUID();
    ids.push(id);
    await db.query("insert into restaurants(id,name,slug,accepting_orders,timezone) values($1,'Casa K',$2,true,$3)", [id, "bil-k" + i, SP]);
  }
  await db.exec("set role service_role");
  const start = async (id, p, c, w) => (await db.query("select public.start_subscription($1,$2,$3,$4) r", [id, p, c, w])).rows[0].r;
  const founder = (id) => start(id, "profissional", "mensal", true);
  // a founder-pending row retrying keeps its original 48h window
  assert.equal((await founder(ids[0])).founder, true);
  await root();
  await db.query("update restaurant_billing set created_at=now()-interval '47 hours' where restaurant_id=$1", [ids[0]]);
  await db.exec("set role service_role");
  assert.equal((await founder(ids[0])).founder, true);
  await root();
  let age = (await db.query("select extract(epoch from now()-created_at)/3600 h from restaurant_billing where restaurant_id=$1", [ids[0]])).rows[0].h;
  assert.ok(Number(age) > 46, "created_at must not be refreshed, got " + age);
  // after 48h the slot is gone: a new claim starts a fresh window
  await db.query("update restaurant_billing set created_at=now()-interval '49 hours' where restaurant_id=$1", [ids[0]]);
  await db.exec("set role service_role");
  assert.equal((await founder(ids[0])).founder, true);
  await root();
  age = (await db.query("select extract(epoch from now()-created_at)/3600 h from restaurant_billing where restaurant_id=$1", [ids[0]])).rows[0].h;
  assert.ok(Number(age) < 1);
  // global cap: 3 NEW founder claims per hour; the 4th signup proceeds at the normal price
  await db.exec("set role service_role");
  assert.equal((await founder(ids[1])).founder, true);
  assert.equal((await founder(ids[2])).founder, true);
  assert.deepEqual(await founder(ids[3]), { founder: false, price_cents: 24900 });
  // retrying an existing claim does not count as a new one
  assert.equal((await founder(ids[1])).founder, true);
  // claims older than an hour stop counting
  await root();
  await db.query("update restaurant_billing set founder_claimed_at=now()-interval '2 hours' where restaurant_id=$1", [ids[2]]);
  await db.exec("set role service_role");
  assert.deepEqual(await founder(ids[3]), { founder: true, price_cents: 17900 });
  // a cancelado row that signs up again forgets old Asaas ids and the scheduled cancellation
  await root();
  await db.query(
    "update restaurant_billing set status='cancelado', asaas_customer_id='cus_old', asaas_subscription_id='sub_old', setup_payment_id='pay_old', current_period_end='2026-01-01', cancel_at='2026-01-01', overdue_since='2025-12-01', pending_plan='essencial', pending_cycle='mensal', pending_since='2025-12-01' where restaurant_id=$1",
    [ids[4]],
  );
  await db.exec("set role service_role");
  await start(ids[4], "essencial", "mensal", false);
  await root();
  const row = (await db.query("select * from restaurant_billing where restaurant_id=$1", [ids[4]])).rows[0];
  assert.equal(row.status, "pendente");
  for (const col of ["asaas_customer_id", "asaas_subscription_id", "setup_payment_id", "current_period_end", "cancel_at", "overdue_since", "pending_plan", "pending_cycle", "pending_since"])
    assert.equal(row[col], null, col);
  // a pendente row (retry) keeps the ids it already has
  await db.query("update restaurant_billing set asaas_customer_id='cus_keep', setup_payment_id='pay_keep' where restaurant_id=$1", [ids[4]]);
  await db.exec("set role service_role");
  await start(ids[4], "essencial", "anual", false);
  await root();
  const kept = (await db.query("select asaas_customer_id, setup_payment_id from restaurant_billing where restaurant_id=$1", [ids[4]])).rows[0];
  assert.deepEqual({ ...kept }, { asaas_customer_id: "cus_keep", setup_payment_id: "pay_keep" });
  await db.query("delete from restaurants where slug like 'bil-k%'");
});

await ok("Asaas ids are unique per restaurant", async () => {
  await root();
  await db.query("update restaurant_billing set asaas_customer_id='cus_u', asaas_subscription_id='sub_u' where restaurant_id=$1", [r1]);
  await rejects(() => db.query("update restaurant_billing set asaas_customer_id='cus_u' where restaurant_id=$1", [r2]), "duplicate key");
  await rejects(() => db.query("update restaurant_billing set asaas_subscription_id='sub_u' where restaurant_id=$1", [r2]), "duplicate key");
  await db.query("update restaurant_billing set asaas_customer_id=null, asaas_subscription_id=null where restaurant_id in ($1,$2)", [r1, r2]);
  // nulls never collide
  await db.query("update restaurant_billing set asaas_customer_id=null where restaurant_id=$1", [r2]);
});

await ok("billing_events: processed_at and payment_id columns", async () => {
  await root();
  await db.query("insert into billing_events(id,type,payload,payment_id) values('evp1','PAYMENT_CONFIRMED','{}','pay_z')");
  const { rows } = await db.query("select processed_at, processing_started_at, payment_id from billing_events where id='evp1'");
  assert.equal(rows[0].processed_at, null);
  assert.equal(rows[0].processing_started_at, null);
  assert.equal(rows[0].payment_id, "pay_z");
  // the lease claim is one conditional UPDATE ... RETURNING: only one of two claims wins
  const claim = "update billing_events set processing_started_at=now() where id='evp1' and processed_at is null and (processing_started_at is null or processing_started_at < now() - interval '2 minutes') returning id";
  assert.equal((await db.query(claim)).rows.length, 1);
  assert.equal((await db.query(claim)).rows.length, 0);
  await db.query("update billing_events set processing_started_at=now()-interval '3 minutes' where id='evp1'");
  assert.equal((await db.query(claim)).rows.length, 1);
  await db.query("update billing_events set processed_at=now() where id='evp1'");
  await db.query("delete from billing_events where id='evp1'");
});

await ok("subscription lease: the claim on the billing row is one conditional UPDATE", async () => {
  await root();
  await db.query("update restaurant_billing set asaas_subscription_id=null, subscription_claimed_at=null where restaurant_id=$1", [r1]);
  const claim = "update restaurant_billing set subscription_claimed_at=now() where restaurant_id=$1 and asaas_subscription_id is null and (subscription_claimed_at is null or subscription_claimed_at < now() - interval '2 minutes') returning restaurant_id";
  assert.equal((await db.query(claim, [r1])).rows.length, 1);
  assert.equal((await db.query(claim, [r1])).rows.length, 0); // fresh lease held
  await db.query("update restaurant_billing set subscription_claimed_at=now()-interval '3 minutes' where restaurant_id=$1", [r1]);
  assert.equal((await db.query(claim, [r1])).rows.length, 1); // expired: taken over
  await db.query("update restaurant_billing set asaas_subscription_id='sub_lease', subscription_claimed_at=null where restaurant_id=$1", [r1]);
  assert.equal((await db.query(claim, [r1])).rows.length, 0); // already has a subscription
  await db.query("update restaurant_billing set asaas_subscription_id=null where restaurant_id=$1", [r1]);
});

await ok("consume_billing_rate_limit: caller-chosen limit per window, service role only", async () => {
  await root();
  await db.exec("set role service_role");
  const digest = "a".repeat(64);
  const hit = async (subject, max = 5, period = 3600) =>
    (await db.query("select public.consume_billing_rate_limit($1,$2,$3) r", [subject, max, period])).rows[0].r;
  for (let i = 0; i < 5; i++) assert.equal((await hit(digest)).allowed, true);
  const r = await hit(digest);
  assert.equal(r.allowed, false);
  assert.ok(r.retryAfter >= 1 && r.retryAfter <= 3600);
  assert.equal((await hit("b".repeat(64))).allowed, true);
  // another limit/window works independently
  for (let i = 0; i < 2; i++) assert.equal((await hit("c".repeat(64), 2, 600)).allowed, true);
  assert.equal((await hit("c".repeat(64), 2, 600)).allowed, false);
  await rejects(() => db.query("select public.consume_billing_rate_limit('not-a-hash',5,3600)"), "INVALID_INPUT");
  await rejects(() => db.query("select public.consume_billing_rate_limit($1,0,3600)", [digest]), "INVALID_INPUT");
  await rejects(() => db.query("select public.consume_billing_rate_limit($1,5,5)", [digest]), "INVALID_INPUT");
  await anon();
  await rejects(() => db.query("select public.consume_billing_rate_limit($1,5,3600)", [digest]), "permission denied");
  await login(ownerA);
  await rejects(() => db.query("select public.consume_billing_rate_limit($1,5,3600)", [digest]), "permission denied");
  await rejects(() => db.query("select * from billing_rate_limits"), "permission denied");
});

await root();
console.log(`Billing DB tests passed: ${count}`);
await db.close();
