import assert from "node:assert/strict";
import { createTestDatabase } from "./lib/test-db.mjs";

const db = await createTestDatabase();
let count = 0;
const a = "18000000-0000-4000-8000-0000000000a1",
  b = "18000000-0000-4000-8000-0000000000b1",
  ownerA = "28000000-0000-4000-8000-0000000000a1",
  ownerB = "28000000-0000-4000-8000-0000000000b1",
  staffA = "28000000-0000-4000-8000-0000000000a2",
  table = "68000000-0000-4000-8000-0000000000a1";

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
const rpc = async (fn, ...args) => {
  const ph = args.map((_, i) => "$" + (i + 1)).join(",");
  const { rows } = await db.query(`select public.${fn}(${ph}) r`, args);
  return rows[0].r;
};
const dayOffset = async (n) => {
  await root();
  const { rows } = await db.query(
    "select ((now() at time zone 'America/Sao_Paulo')::date + $1::int)::text d",
    [n],
  );
  return rows[0].d;
};

await db.query("insert into auth.users values($1),($2),($3)", [ownerA, ownerB, staffA]);
await db.query(
  "insert into restaurants(id,name,slug,accepting_orders,timezone) values($1,'Casa A','fin-a',true,'America/Sao_Paulo'),($2,'Casa B','fin-b',true,'America/Sao_Paulo')",
  [a, b],
);
await db.query(
  "insert into restaurant_members values($1,$2,'owner'),($3,$4,'owner'),($1,$5,'operations')",
  [a, ownerA, b, ownerB, staffA],
);
await db.query("insert into dining_tables(id,restaurant_id,number) values($1,$2,1)", [table, a]);

let sessions = 0;
async function order({ kind, method, total, fee = 0, discount = 0, at, status = "entregue" }) {
  await root();
  sessions++;
  const { rows } = await db.query(
    "insert into guest_sessions(restaurant_id,token_hash,expires_at) values($1,$2,now()+interval '1 day') returning id",
    [a, String(sessions + 5000).padStart(64, "0")],
  );
  await db.query(
    `insert into orders(restaurant_id,guest_session_id,table_id,customer_name,customer_phone,total_cents,status,
      idempotency_key,payload_hash,fulfillment,payment_method,delivery_fee_cents,discount_cents,created_at)
     values($1,$2,$3,'Cliente','11988887777',$4,$5,$6,'x',$7,$8,$9,$10,$11)`,
    [a, rows[0].id, kind === "mesa" ? table : null, total, status, crypto.randomUUID(), kind,
      kind === "mesa" ? null : method, fee, discount, at],
  );
}

// Fees
await login(ownerA);
await ok("owner saves fees", async () => {
  await rpc("save_payment_fees", a, 3.5, 1);
  await root();
  const { rows } = await db.query("select card_fee_percent c,pix_fee_percent p from restaurant_finance_settings where restaurant_id=$1", [a]);
  assert.equal(Number(rows[0].c), 3.5);
  assert.equal(Number(rows[0].p), 1);
  await login(ownerA);
  const f = await rpc("get_payment_fees", a);
  assert.equal(Number(f.card_fee_percent), 3.5);
  assert.equal(Number(f.pix_fee_percent), 1);
});
await ok("fees default to zero without a row; other owner cannot read", async () => {
  await login(ownerB);
  const f = await rpc("get_payment_fees", b);
  assert.equal(Number(f.card_fee_percent), 0);
  assert.equal(Number(f.pix_fee_percent), 0);
  await rejects(() => rpc("get_payment_fees", a), "FORBIDDEN");
  const { rows } = await db.query("select * from restaurant_finance_settings");
  assert.equal(rows.length, 0);
  await login(ownerA);
});
await ok("fee validation", async () => {
  await rejects(() => rpc("save_payment_fees", a, 15.01, 0), "INVALID_INPUT");
  await rejects(() => rpc("save_payment_fees", a, 0, -1), "INVALID_INPUT");
  await rejects(() => rpc("save_payment_fees", a, null, 0), "INVALID_INPUT");
  await rejects(() => rpc("save_payment_fees", b, 1, 1), "FORBIDDEN");
});

// Orders on local day D (America/Sao_Paulo, UTC-3)
const D = "2026-06-10";
await order({ kind: "mesa", total: 4000, at: "2026-06-10T12:00:00-03:00" });
await order({ kind: "retirada", method: "cartao", total: 10000, at: "2026-06-10T13:00:00-03:00" });
await order({ kind: "entrega", method: "pix", total: 5500, fee: 700, discount: 500, at: "2026-06-10T23:30:00-03:00" });
await order({ kind: "retirada", method: "dinheiro", total: 2000, at: "2026-06-10T00:10:00-03:00" });
await order({ kind: "retirada", method: "cartao", total: 9999, status: "cancelado", at: "2026-06-10T14:00:00-03:00" });
await order({ kind: "retirada", method: "cartao", total: 7777, at: "2026-06-09T23:50:00-03:00" });
await order({ kind: "retirada", method: "cartao", total: 3333, at: "2026-06-11T00:05:00-03:00" });
await order({ kind: "retirada", method: "cartao", total: 6000, at: "2026-05-20T12:00:00-03:00" });

await login(ownerA);
await ok("cash_day groups methods, timezone boundaries, sums, fee, net", async () => {
  await rpc("save_finance_entry", a, null, { kind: "income", description: "Venda balcao", amount_cents: 1500, entry_date: D });
  const r = await rpc("cash_day", a, D);
  const m = Object.fromEntries(r.methods.map((x) => [x.method, x]));
  assert.equal(m.mesa.total_cents, 4000);
  assert.equal(m.cartao.total_cents, 10000);
  assert.equal(m.cartao.orders, 1);
  assert.equal(m.pix.total_cents, 5500);
  assert.equal(m.dinheiro.total_cents, 2000);
  assert.equal(r.methods.length, 4);
  assert.equal(r.methods[0].method, "cartao");
  assert.equal(r.sold_cents, 21500);
  assert.equal(r.delivery_fees_cents, 700);
  assert.equal(r.discount_cents, 500);
  assert.equal(r.items_cents, 21500 - 700 + 500);
  assert.equal(r.machine_fee_cents, 350 + 55);
  assert.equal(r.other_income_cents, 1500);
  assert.equal(r.other_income.length, 1);
  assert.equal(r.net_cents, 21500 - 405 + 1500);
  assert.equal(r.day, D);
});
await ok("cash_day empty day", async () => {
  const r = await rpc("cash_day", a, "2026-01-01");
  assert.equal(r.sold_cents, 0);
  assert.deepEqual(r.methods, []);
  assert.equal(r.net_cents, 0);
  await rejects(() => rpc("cash_day", a, null), "INVALID_INPUT");
});

const t0 = await dayOffset(0);
const tm5 = await dayOffset(-5);
const tp3 = await dayOffset(3);
const tp20 = await dayOffset(20);
const tm40 = await dayOffset(-40);
await login(ownerA);

await ok("save_finance_entry validations", async () => {
  const exp = { kind: "expense", description: "Aluguel", category: "aluguel", amount_cents: 200000, entry_date: D, paid: true };
  const id = await rpc("save_finance_entry", a, null, exp);
  assert.ok(id);
  await root();
  const { rows } = await db.query("select paid_at::text p from finance_entries where id=$1", [id]);
  assert.equal(rows[0].p, D);
  await login(ownerA);
  await rejects(() => rpc("save_finance_entry", a, null, { ...exp, paid: false }), "DUE_DATE_REQUIRED");
  await rejects(() => rpc("save_finance_entry", a, null, { ...exp, category: "xyz" }), "INVALID_INPUT");
  await rejects(() => rpc("save_finance_entry", a, null, { ...exp, category: null }), "INVALID_INPUT");
  await rejects(() => rpc("save_finance_entry", a, null, { ...exp, description: "x".repeat(81) }), "INVALID_INPUT");
  await rejects(() => rpc("save_finance_entry", a, null, { ...exp, amount_cents: 0 }), "INVALID_INPUT");
  await rejects(() => rpc("save_finance_entry", a, null, { ...exp, amount_cents: 100000001 }), "INVALID_INPUT");
  await rejects(() => rpc("save_finance_entry", a, null, { ...exp, entry_date: "nope" }), "INVALID_INPUT");
  await rejects(() => rpc("save_finance_entry", a, null, { ...exp, kind: "other" }), "INVALID_INPUT");
  await rejects(() => rpc("save_finance_entry", a, null, null), "INVALID_INPUT");
  await rejects(() => rpc("save_finance_entry", a, null, {}), "INVALID_INPUT");
  await rejects(() => rpc("save_finance_entry", a, null, { kind: "income", description: null, amount_cents: null, entry_date: null }), "INVALID_INPUT");
  await rejects(() => rpc("save_finance_entry", a, null, { kind: "expense", description: null, category: null, amount_cents: null, entry_date: null, paid: true }), "INVALID_INPUT");
  await rejects(() => rpc("save_finance_entry", a, null, { ...exp, entry_date: "infinity" }), "INVALID_INPUT");
  await rejects(() => rpc("save_finance_entry", a, null, { ...exp, entry_date: "9999-12-31" }), "INVALID_INPUT");
  await rejects(() => rpc("save_finance_entry", a, null, { ...exp, paid_at: "infinity" }), "INVALID_INPUT");
  await rejects(() => rpc("save_finance_entry", a, null, { ...exp, paid: false, due_date: "9999-12-31" }), "INVALID_INPUT");
  await rejects(() => rpc("save_finance_entry", a, null, { ...exp, entry_date: "1999-12-31" }), "INVALID_INPUT");
  await rejects(() => rpc("save_finance_entry", a, null, { kind: "income", description: "Ok", amount_cents: 100, entry_date: "9999-12-31" }), "INVALID_INPUT");
  await rejects(() => rpc("save_finance_entry", a, null, { kind: "income", description: "x".repeat(61), amount_cents: 100, entry_date: D }), "INVALID_INPUT");
  await rejects(() => rpc("save_finance_entry", a, null, { kind: "income", description: "Ok", amount_cents: 10000001, entry_date: D }), "INVALID_INPUT");
});
await ok("income forces paid_at = entry_date; edit works", async () => {
  const id = await rpc("save_finance_entry", a, null, { kind: "income", description: "Gorjeta", amount_cents: 500, entry_date: D, category: "aluguel", due_date: D, paid_at: "2020-01-01" });
  await root();
  let { rows } = await db.query("select category,due_date,paid_at::text p from finance_entries where id=$1", [id]);
  assert.equal(rows[0].category, null);
  assert.equal(rows[0].due_date, null);
  assert.equal(rows[0].p, D);
  await login(ownerA);
  await rpc("save_finance_entry", a, id, { kind: "income", description: "Gorjeta 2", amount_cents: 700, entry_date: "2026-06-12" });
  await root();
  ({ rows } = await db.query("select description,amount_cents,paid_at::text p from finance_entries where id=$1", [id]));
  assert.equal(rows[0].description, "Gorjeta 2");
  assert.equal(rows[0].amount_cents, 700);
  assert.equal(rows[0].p, "2026-06-12");
  await login(ownerA);
});
await ok("expense edit flips paid/unpaid; kind change and foreign id are NOT_FOUND", async () => {
  const id = await rpc("save_finance_entry", a, null, { kind: "expense", description: "Luz", category: "contas", amount_cents: 30000, entry_date: D, due_date: t0 });
  const base = { kind: "expense", description: "Luz", category: "contas", amount_cents: 31000, entry_date: D };
  await rpc("save_finance_entry", a, id, { ...base, paid: true, paid_at: D });
  await root();
  let { rows } = await db.query("select amount_cents,paid_at::text p from finance_entries where id=$1", [id]);
  assert.equal(rows[0].amount_cents, 31000);
  assert.equal(rows[0].p, D);
  await login(ownerA);
  await rpc("save_finance_entry", a, id, { ...base, paid: false, due_date: t0 });
  await root();
  ({ rows } = await db.query("select paid_at from finance_entries where id=$1", [id]));
  assert.equal(rows[0].paid_at, null);
  await login(ownerA);
  await rejects(() => rpc("save_finance_entry", a, id, { kind: "income", description: "Luz", amount_cents: 1, entry_date: D }), "NOT_FOUND");
  await login(ownerB);
  await rejects(() => rpc("save_finance_entry", b, id, { ...base, paid: true }), "NOT_FOUND");
  await rejects(() => rpc("save_finance_entry", a, id, { ...base, paid: true }), "FORBIDDEN");
  await rejects(() => rpc("delete_finance_entry", b, id), "NOT_FOUND");
  await login(ownerA);
  await rejects(() => rpc("save_finance_entry", a, crypto.randomUUID(), { ...base, paid: true }), "NOT_FOUND");
});

await ok("finance_month profit, previous, categories, entries", async () => {
  await rpc("save_finance_entry", a, null, { kind: "expense", description: "Insumos", category: "insumos", amount_cents: 4000, entry_date: "2026-06-15", paid: true });
  await rpc("save_finance_entry", a, null, { kind: "expense", description: "Embalagem", category: "embalagens", amount_cents: 1000, entry_date: "2026-06-16", due_date: tp20 });
  await rpc("save_finance_entry", a, null, { kind: "expense", description: "Insumos maio", category: "insumos", amount_cents: 2500, entry_date: "2026-05-20", paid: true });
  await rpc("save_finance_entry", a, null, { kind: "income", description: "Extra maio", amount_cents: 800, entry_date: "2026-05-21" });
  const r = await rpc("finance_month", a, "2026-06-18");
  assert.equal(r.month, "2026-06-01");
  const sold = 4000 + 10000 + 5500 + 2000 + 7777 + 3333;
  assert.equal(r.sales.sold_cents, sold);
  const fee = Math.floor((10000 + 7777 + 3333) * 0.035) + Math.floor(5500 * 0.01);
  assert.equal(r.sales.machine_fee_cents, fee);
  const inc = 1500 + 700;
  const exp = 200000 + 31000 + 4000 + 1000;
  assert.equal(r.other_income_cents, inc);
  assert.equal(r.expenses_cents, exp);
  assert.equal(r.profit_cents, sold + inc - fee - exp);
  const pfee = Math.floor(6000 * 0.035);
  assert.equal(r.previous_profit_cents, 6000 + 800 - pfee - 2500);
  const cats = Object.fromEntries(r.by_category.map((c) => [c.category, c.total_cents]));
  assert.deepEqual(cats, { aluguel: 200000, contas: 31000, insumos: 4000, embalagens: 1000 });
  assert.equal(r.by_category[0].category, "aluguel");
  assert.equal(r.entries.length, 6);
  assert.ok(r.entries[0].entry_date >= r.entries[1].entry_date);
  await rejects(() => rpc("finance_month", a, null), "INVALID_INPUT");
});

await ok("bills_due ordering, due_this_week, recently_paid, set_entry_paid", async () => {
  await root();
  await db.query("delete from finance_entries where restaurant_id=$1", [a]);
  await login(ownerA);
  const mk = (description, due) =>
    rpc("save_finance_entry", a, null, { kind: "expense", description, category: "contas", amount_cents: 1000, entry_date: tm5, due_date: due });
  const late = await mk("Atrasada", tm5);
  const soon = await mk("Em breve", tp3);
  await mk("Longe", tp20);
  await rpc("save_finance_entry", a, null, { kind: "expense", description: "Paga velha", category: "contas", amount_cents: 1000, entry_date: tm40, paid: true, paid_at: tm40 });
  await rpc("save_finance_entry", a, null, { kind: "expense", description: "Paga nova", category: "contas", amount_cents: 1000, entry_date: tm5, paid: true, paid_at: tm5 });
  let r = await rpc("bills_due", a);
  assert.equal(r.today, t0);
  assert.deepEqual(r.open.map((x) => x.description), ["Atrasada", "Em breve", "Longe"]);
  assert.equal(Number(r.due_this_week), 2);
  assert.deepEqual(r.recently_paid.map((x) => x.description), ["Paga nova"]);
  await rpc("set_entry_paid", a, soon, true);
  r = await rpc("bills_due", a);
  assert.equal(r.open.length, 2);
  assert.equal(Number(r.due_this_week), 1);
  assert.equal(r.recently_paid[0].description, "Em breve");
  assert.equal(r.recently_paid[0].paid_at, t0);
  await rpc("set_entry_paid", a, soon, false);
  r = await rpc("bills_due", a);
  assert.equal(r.open.length, 3);
  assert.equal(r.recently_paid.length, 1);
  await rejects(() => rpc("set_entry_paid", a, crypto.randomUUID(), true), "NOT_FOUND");
  await rejects(() => rpc("set_entry_paid", a, soon, null), "INVALID_INPUT");
  const noDue = await rpc("save_finance_entry", a, null, { kind: "expense", description: "Paga sem venc", category: "contas", amount_cents: 1000, entry_date: tm5, paid: true });
  await rpc("set_entry_paid", a, noDue, false);
  await root();
  const { rows: nd } = await db.query("select due_date::text d,paid_at from finance_entries where id=$1", [noDue]);
  assert.equal(nd[0].d, tm5);
  assert.equal(nd[0].paid_at, null);
  await login(ownerA);
  await rpc("delete_finance_entry", a, noDue);
  const inc = await rpc("save_finance_entry", a, null, { kind: "income", description: "Entrada", amount_cents: 100, entry_date: t0 });
  await rejects(() => rpc("set_entry_paid", a, inc, true), "NOT_FOUND");
  await rpc("delete_finance_entry", a, late);
  await rejects(() => rpc("delete_finance_entry", a, late), "NOT_FOUND");
});

await ok("staff blocked everywhere and sees no entries", async () => {
  await login(staffA);
  await rejects(() => rpc("save_payment_fees", a, 1, 1), "FORBIDDEN");
  await rejects(() => rpc("save_finance_entry", a, null, { kind: "income", description: "Oi", amount_cents: 1, entry_date: D }), "FORBIDDEN");
  await rejects(() => rpc("delete_finance_entry", a, crypto.randomUUID()), "FORBIDDEN");
  await rejects(() => rpc("set_entry_paid", a, crypto.randomUUID(), true), "FORBIDDEN");
  await rejects(() => rpc("cash_day", a, D), "FORBIDDEN");
  await rejects(() => rpc("finance_month", a, D), "FORBIDDEN");
  await rejects(() => rpc("bills_due", a), "FORBIDDEN");
  await rejects(() => rpc("finance_sales", a, D, D), "permission denied");
  await rejects(() => rpc("get_payment_fees", a), "FORBIDDEN");
  const { rows: fr } = await db.query("select * from restaurant_finance_settings");
  assert.equal(fr.length, 0);
  const { rows: pub } = await db.query("select * from restaurants where id=$1", [a]);
  assert.equal("card_fee_percent" in pub[0], false);
  const { rows } = await db.query("select * from finance_entries");
  assert.equal(rows.length, 0);
});
await ok("owner of another restaurant blocked; owner reads own entries", async () => {
  await login(ownerB);
  await rejects(() => rpc("cash_day", a, D), "FORBIDDEN");
  await rejects(() => rpc("bills_due", a), "FORBIDDEN");
  let { rows } = await db.query("select * from finance_entries");
  assert.equal(rows.length, 0);
  await login(ownerA);
  ({ rows } = await db.query("select * from finance_entries"));
  assert.ok(rows.length > 0);
  await rejects(
    () => db.query("insert into finance_entries(restaurant_id,kind,description,category,amount_cents,entry_date,paid_at) values($1,'expense','Direto','outros',1,now(),now())", [a]),
    "permission denied",
  );
});
await ok("anon denied", async () => {
  await anon();
  for (const [fn, ...args] of [
    ["save_payment_fees", a, 1, 1],
    ["save_finance_entry", a, null, { kind: "income", description: "Oi", amount_cents: 1, entry_date: D }],
    ["delete_finance_entry", a, crypto.randomUUID()],
    ["set_entry_paid", a, crypto.randomUUID(), true],
    ["cash_day", a, D],
    ["finance_month", a, D],
    ["bills_due", a],
  ])
    await rejects(() => rpc(fn, ...args), "permission denied");
  await rejects(() => db.query("select * from finance_entries"), "permission denied");
  await rejects(() => db.query("select * from restaurant_finance_settings"), "permission denied");
  await rejects(() => rpc("get_payment_fees", a), "permission denied");
  await rejects(() => rpc("finance_sales", a, D, D), "permission denied");
});

await root();
console.log(`Finance DB tests passed: ${count}`);
await db.close();
