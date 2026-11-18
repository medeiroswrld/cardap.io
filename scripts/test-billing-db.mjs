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
    await db.query(
      "insert into restaurant_billing(restaurant_id,plan,status,founder) values($1,'essencial','pendente',true)",
      [id],
    );
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
  assert.ok(["essencial", "profissional"].includes(await plan(r1)));
  assert.equal(typeof (await rpc("founder_slots_left")), "number");
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
  await db.query("insert into restaurant_billing(restaurant_id,plan,status) values($1,'essencial','pendente')", [r4]);
  await db.query("delete from restaurants where id=$1", [r4]);
  const ev = await db.query("select restaurant_id from billing_events where id='evt1'");
  assert.equal(ev.rows[0].restaurant_id, null);
  const bl = await db.query("select count(*)::int n from restaurant_billing where restaurant_id=$1", [r4]);
  assert.equal(bl.rows[0].n, 0);
});

await root();
console.log(`Billing DB tests passed: ${count}`);
await db.close();
