import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

// provisionCheckout and the Asaas webhook handler against a fake Asaas client and a fake service
// client (in-memory tables). No network, no database, no real Asaas.
const load = loader({
  "./supabase/server": { serviceClient: () => { throw new Error("real client must not be used"); } },
  "./observability/logger": { logger: { warn() {}, error() {} } },
});
const { processAsaasWebhook } = load("src/lib/billing-webhook.ts");
const { provisionCheckout } = load("src/lib/billing-server.ts");
const { toReais } = load("src/lib/asaas.ts");

const RID = "11111111-1111-4111-8111-111111111111";
const TODAY = "2026-11-18";

class Query {
  constructor(db, table, fail) {
    Object.assign(this, { db, table, fail, op: "select", filters: [], opts: {}, max: Infinity });
  }
  select(_cols, opts = {}) { this.opts = opts; return this; }
  insert(row) { this.op = "insert"; this.row = row; return this; }
  update(patch) { this.op = "update"; this.patch = patch; return this; }
  eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
  in(c, vs) { this.filters.push((r) => vs.includes(r[c])); return this; }
  not(c, _is, v) { this.filters.push((r) => r[c] !== v); return this; }
  limit(n) { this.max = n; return this; }
  maybeSingle() { this.single = true; return this.then((x) => x); }
  then(resolve, reject) { return Promise.resolve(this.run()).then(resolve, reject); }
  run() {
    const injected = this.fail(this.table, this.op);
    if (injected) return { data: null, error: injected };
    const rows = this.db[this.table];
    if (this.op === "insert") {
      if (this.table === "billing_events" && rows.some((r) => r.id === this.row.id))
        return { data: null, error: { code: "23505", message: "duplicate key" } };
      rows.push({ processed_at: null, ...this.row });
      return { data: null, error: null };
    }
    const match = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === "update") {
      for (const r of match) Object.assign(r, this.patch);
      return { data: null, error: null };
    }
    const picked = match.slice(0, this.max).map((r) => ({ ...r }));
    if (this.opts.head) return { data: null, error: null, count: match.length };
    return { data: this.single ? (picked[0] ?? null) : picked, error: null };
  }
}
function fakeService(db, fail = () => null) {
  return { from: (table) => new Query(db, table, fail) };
}
const baseRow = (over = {}) => ({
  restaurant_id: RID, plan: "profissional", cycle: "mensal", status: "pendente", founder: false, price_cents: 24900,
  asaas_customer_id: "cus_1", asaas_subscription_id: null, setup_payment_id: "pay_1", current_period_end: null,
  overdue_since: null, cancel_at: null, pending_plan: null, pending_cycle: null, pending_since: null, ...over,
});
const newDb = (row = baseRow()) => ({ restaurant_billing: row ? [row] : [], billing_events: [] });

function fakeAsaas(payments = {}) {
  const calls = [];
  const store = new Map(Object.entries(payments));
  let n = 0;
  const fail = { getPayment: null, createSubscription: null };
  const api = {
    calls,
    store,
    fail,
    async createCustomer(input) { calls.push(["createCustomer", input]); return { id: "cus_new" }; },
    async createPayment(input) {
      calls.push(["createPayment", input]);
      const id = `pay_new${++n}`;
      const p = { id, customer: input.customer, value: toReais(input.valueCents), status: "PENDING", dueDate: input.dueDate, invoiceUrl: `https://www.asaas.com/i/${id}` };
      store.set(id, p);
      return { ...p };
    },
    async getPayment(id) {
      calls.push(["getPayment", id]);
      if (fail.getPayment) throw fail.getPayment;
      if (!store.has(id)) throw new Error("NOT_FOUND");
      return { ...store.get(id) };
    },
    async deletePayment(id) { calls.push(["deletePayment", id]); store.delete(id); return { deleted: true, id }; },
    async createSubscription(input) {
      calls.push(["createSubscription", input]);
      if (fail.createSubscription) throw fail.createSubscription;
      return { id: "sub_1" };
    },
    async cancelSubscription(id) { calls.push(["cancelSubscription", id]); return { deleted: true, id }; },
  };
  return api;
}
const names = (asaas) => asaas.calls.map((c) => c[0]);

// ---- provisionCheckout ----
const customer = { name: "Ana", cpfCnpj: "52998224725", email: "a@b.co", mobilePhone: "11912345678" };
const input = (over = {}) => ({ restaurantId: RID, plan: "profissional", cycle: "mensal", founder: false, ...over });

test("checkout: creates the customer and the first charge only, saving each id as it goes; no subscription", async () => {
  const db = newDb(baseRow({ asaas_customer_id: null, setup_payment_id: null }));
  const asaas = fakeAsaas();
  const url = await provisionCheckout(asaas, input({ customer }), fakeService(db), TODAY);
  assert.equal(url, "https://www.asaas.com/i/pay_new1");
  assert.deepEqual(names(asaas), ["createCustomer", "createPayment"]);
  assert.equal(asaas.calls[1][1].dueDate, "2026-11-20");
  assert.equal(asaas.calls[1][1].valueCents, 29700 + 24900);
  assert.equal(db.restaurant_billing[0].asaas_customer_id, "cus_new");
  assert.equal(db.restaurant_billing[0].setup_payment_id, "pay_new1");
  assert.equal(db.restaurant_billing[0].asaas_subscription_id, null);
});

test("checkout: customer is required when none exists; a DB write error aborts right there", async () => {
  const bare = baseRow({ asaas_customer_id: null, setup_payment_id: null });
  await assert.rejects(provisionCheckout(fakeAsaas(), input(), fakeService(newDb(bare)), TODAY), { message: "INVALID_DOCUMENT" });
  const asaas = fakeAsaas();
  const failing = fakeService(newDb(bare), (table, op) => (table === "restaurant_billing" && op === "update" ? { code: "XX000", message: "db down" } : null));
  await assert.rejects(provisionCheckout(asaas, input({ customer }), failing, TODAY), { code: "XX000" });
  assert.deepEqual(names(asaas), ["createCustomer"]); // never went on to create a charge it could not record
  const db = newDb(baseRow({ setup_payment_id: null }));
  const failPayment = fakeService(db, (table, op) => (table === "restaurant_billing" && op === "update" ? { code: "XX000", message: "db down" } : null));
  await assert.rejects(provisionCheckout(fakeAsaas(), input(), failPayment, TODAY), { code: "XX000" });
});

test("checkout retry (C1): an open, current, same-value charge is reused", async () => {
  const db = newDb(baseRow());
  const asaas = fakeAsaas({ pay_1: { id: "pay_1", customer: "cus_1", value: 546, status: "PENDING", dueDate: "2026-11-20", invoiceUrl: "https://www.asaas.com/i/pay_1" } });
  assert.equal(await provisionCheckout(asaas, input(), fakeService(db), TODAY), "https://www.asaas.com/i/pay_1");
  assert.deepEqual(names(asaas), ["getPayment"]);
});

test("checkout retry (C1): overdue, different value or vanished charge is replaced and the new id saved immediately", async () => {
  const cases = [
    ["overdue by date", { status: "PENDING", dueDate: "2026-11-10", value: 546 }, true],
    ["status OVERDUE", { status: "OVERDUE", dueDate: "2026-11-10", value: 546 }, true],
    ["value changed (founder lost)", { status: "PENDING", dueDate: "2026-11-20", value: 476 }, true],
    ["gone in Asaas", null, false],
  ];
  for (const [label, old, deleted] of cases) {
    const db = newDb(baseRow());
    const asaas = fakeAsaas(old ? { pay_1: { id: "pay_1", customer: "cus_1", invoiceUrl: "https://www.asaas.com/i/pay_1", ...old } } : {});
    const url = await provisionCheckout(asaas, input(), fakeService(db), TODAY);
    assert.equal(url, "https://www.asaas.com/i/pay_new1", label);
    assert.equal(names(asaas).includes("deletePayment"), deleted, label);
    assert.equal(db.restaurant_billing[0].setup_payment_id, "pay_new1", label);
  }
});

test("checkout retry: an already paid first charge is never duplicated", async () => {
  const asaas = fakeAsaas({ pay_1: { id: "pay_1", customer: "cus_1", value: 546, status: "CONFIRMED", dueDate: "2026-11-20", invoiceUrl: "https://www.asaas.com/i/pay_1" } });
  await assert.rejects(provisionCheckout(asaas, input(), fakeService(newDb()), TODAY), { message: "STATE_CONFLICT" });
  assert.equal(names(asaas).includes("createPayment"), false);
});

// ---- webhook ----
const TOKEN = "hook-token";
function deliver(deps, body, token = TOKEN) {
  const headers = token === null ? {} : { "asaas-access-token": token };
  return processAsaasWebhook(new Request("http://localhost/api/billing/asaas", { method: "POST", headers, body: JSON.stringify(body) }), deps);
}
function setup(row = baseRow(), payments = {}, fail) {
  const db = newDb(row);
  const asaas = fakeAsaas(payments);
  const notified = [];
  const logs = [];
  const deps = {
    service: fakeService(db, fail),
    asaas: () => asaas,
    token: TOKEN,
    notify: async (id, plan) => notified.push([id, plan]),
    log: (e, r) => logs.push([e, r]),
    today: () => TODAY,
  };
  return { db, asaas, deps, notified, logs, row: () => db.restaurant_billing[0] };
}
let seq = 0;
const evt = (event, payment, extra = {}) => ({ id: `evt_${++seq}`, event, payment, ...extra });
const paid = { id: "pay_1", customer: "cus_1", value: 546, status: "CONFIRMED", dueDate: "2026-11-20", invoiceUrl: "https://www.asaas.com/i/pay_1" };

test("webhook: bad, missing token and missing env are refused before anything is stored", async () => {
  const t = setup();
  await assert.rejects(deliver(t.deps, evt("PAYMENT_CONFIRMED", { id: "pay_1" }), "wrong"), { message: "UNAUTHORIZED" });
  await assert.rejects(deliver(t.deps, evt("PAYMENT_CONFIRMED", { id: "pay_1" }), null), { message: "UNAUTHORIZED" });
  await assert.rejects(deliver({ ...t.deps, token: undefined }, evt("PAYMENT_CONFIRMED", { id: "pay_1" })), { message: "BILLING_UNAVAILABLE" });
  assert.equal(t.db.billing_events.length, 0);
});

test("webhook: first activation verifies with Asaas, creates the subscription at addCycle(dueDate), activates, notifies once", async () => {
  const t = setup(baseRow(), { pay_1: paid });
  const e = evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" });
  const res = await deliver(t.deps, e);
  assert.equal((await res.json()).ok, true);
  const sub = t.asaas.calls.find((c) => c[0] === "createSubscription")[1];
  assert.equal(sub.nextDueDate, "2026-12-20");
  assert.equal(sub.valueCents, 24900);
  assert.equal(sub.customer, "cus_1");
  assert.equal(sub.cycle, "mensal");
  assert.equal(t.row().status, "ativo");
  assert.equal(t.row().asaas_subscription_id, "sub_1");
  assert.equal(t.row().current_period_end, "2026-12-20");
  assert.deepEqual(t.notified, [[RID, "profissional"]]);
  assert.ok(t.db.billing_events[0].processed_at);
  // Asaas redelivers the same event, then sends RECEIVED for the same payment: no second subscription/notification
  assert.equal((await (await deliver(t.deps, e)).json()).duplicate, true);
  await deliver(t.deps, evt("PAYMENT_RECEIVED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" }));
  assert.equal(names(t.asaas).filter((n) => n === "createSubscription").length, 1);
  assert.equal(t.notified.length, 1);
  // the late RECEIVED was dropped before even asking Asaas again
  assert.equal(names(t.asaas).filter((n) => n === "getPayment").length, 1);
});

test("webhook: yearly first charge starts the subscription a year later; an old due date never schedules the past", async () => {
  const t = setup(baseRow({ cycle: "anual", price_cents: 249000 }), { pay_1: { ...paid, value: 2787 } });
  await deliver(t.deps, evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" }));
  assert.equal(t.asaas.calls.find((c) => c[0] === "createSubscription")[1].nextDueDate, "2027-11-20");
  const late = setup(baseRow(), { pay_1: { ...paid, dueDate: "2026-09-01" } });
  await deliver(late.deps, evt("PAYMENT_RECEIVED", { id: "pay_1", customer: "cus_1", dueDate: "2026-09-01" }));
  assert.equal(late.asaas.calls.find((c) => c[0] === "createSubscription")[1].nextDueDate, TODAY);
});

test("webhook: a payment Asaas does not confirm for this customer and value is ignored (200), nothing changes", async () => {
  const cases = {
    "other customer": { ...paid, customer: "cus_other" },
    "wrong value": { ...paid, value: 1 },
    "not paid yet": { ...paid, status: "PENDING" },
  };
  for (const [label, remote] of Object.entries(cases)) {
    const t = setup(baseRow(), { pay_1: remote });
    const res = await deliver(t.deps, evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" }));
    assert.equal(res.status, 200, label);
    assert.equal(t.row().status, "pendente", label);
    assert.equal(names(t.asaas).includes("createSubscription"), false, label);
    assert.ok(t.logs.some(([e]) => e === "billing.webhook_ignored"), label);
  }
  const unknown = setup(baseRow(), {}); // GET answers 404
  assert.equal((await deliver(unknown.deps, evt("PAYMENT_CONFIRMED", { id: "pay_1", dueDate: "2026-11-20" }))).status, 200);
  assert.equal(unknown.row().status, "pendente");
});

test("webhook: transient failures answer with an error and the event is retried later", async () => {
  const t = setup(baseRow(), { pay_1: paid });
  const e = evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" });
  t.asaas.fail.getPayment = new Error("BILLING_UNAVAILABLE");
  await assert.rejects(deliver(t.deps, e), { message: "BILLING_UNAVAILABLE" });
  assert.equal(t.row().status, "pendente");
  assert.equal(t.db.billing_events[0].processed_at, null);
  // Asaas redelivers: the unfinished event runs again (not treated as a finished duplicate)
  t.asaas.fail.getPayment = null;
  const res = await deliver(t.deps, e);
  assert.equal((await res.json()).duplicate, undefined);
  assert.equal(t.row().status, "ativo");
  assert.ok(t.db.billing_events[0].processed_at);
  assert.equal(t.db.billing_events.length, 1);
  // Asaas subscription creation failing is transient too; the retry then finishes the job
  const u = setup(baseRow(), { pay_1: paid });
  u.asaas.fail.createSubscription = new Error("BILLING_UNAVAILABLE");
  const e2 = evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" });
  await assert.rejects(deliver(u.deps, e2));
  assert.equal(u.row().status, "pendente");
  u.asaas.fail.createSubscription = null;
  await deliver(u.deps, e2);
  assert.equal(u.row().status, "ativo");
  assert.equal(u.row().asaas_subscription_id, "sub_1");
  // database write errors are transient as well
  const d = setup(baseRow(), { pay_1: paid }, (table, op) => (table === "restaurant_billing" && op === "update" ? { code: "XX000", message: "db" } : null));
  await assert.rejects(deliver(d.deps, evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" })), { code: "XX000" });
});

test("webhook: non-transient problems are logged and answered 200 instead of stalling Asaas's queue", async () => {
  const t = setup(baseRow(), { pay_1: paid });
  t.asaas.fail.createSubscription = new Error("something unexpected");
  const res = await deliver(t.deps, evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" }));
  assert.equal(res.status, 200);
  assert.ok(t.logs.some(([e, r]) => e === "billing.webhook_ignored" && r === "processing-error"));
  assert.ok(t.db.billing_events[0].processed_at);
  const garbage = await deliver(t.deps, { nope: true });
  assert.equal(garbage.status, 200);
  const unknownRestaurant = setup(baseRow());
  assert.equal((await deliver(unknownRestaurant.deps, evt("PAYMENT_CONFIRMED", { id: "pay_x", customer: "cus_zzz", externalReference: "not-a-uuid" }))).status, 200);
  assert.equal(unknownRestaurant.db.billing_events.length, 1);
  assert.equal(unknownRestaurant.db.billing_events[0].restaurant_id, null);
});

test("C1 sequence: events of an old, replaced charge neither block nor activate", async () => {
  // the buyer retried: pay_new is now the setup charge, pay_old was abandoned
  const pending = setup(baseRow({ setup_payment_id: "pay_new" }), { pay_new: { ...paid, id: "pay_new" } });
  await deliver(pending.deps, evt("PAYMENT_CONFIRMED", { id: "pay_old", customer: "cus_1", dueDate: "2026-11-20" }));
  assert.equal(pending.row().status, "pendente");
  assert.equal(names(pending.asaas).length, 0);
  // an active customer: a stale OVERDUE on the abandoned charge must not mark them atrasado
  const active = setup(baseRow({ status: "ativo", setup_payment_id: "pay_new", asaas_subscription_id: "sub_1", current_period_end: "2026-12-20" }));
  await deliver(active.deps, evt("PAYMENT_OVERDUE", { id: "pay_old", customer: "cus_1", dueDate: "2026-11-20" }));
  assert.equal(active.row().status, "ativo");
  assert.equal(active.row().overdue_since, null);
  // while overdue on the real subscription charge does
  await deliver(active.deps, evt("PAYMENT_OVERDUE", { id: "pay_s1", subscription: "sub_1", dueDate: "2026-12-20" }));
  assert.equal(active.row().status, "atrasado");
  assert.equal(active.row().overdue_since, "2026-12-20");
});

test("I1 sequence: a late payment of an older charge does not clear a newer overdue; duplicate RECEIVED is dropped", async () => {
  const t = setup(baseRow({ status: "ativo", asaas_subscription_id: "sub_1", current_period_end: "2026-12-20" }), {
    pay_s1: { id: "pay_s1", customer: "cus_1", value: 249, status: "RECEIVED", dueDate: "2026-12-20" },
    pay_s2: { id: "pay_s2", customer: "cus_1", value: 249, status: "CONFIRMED", dueDate: "2027-01-20" },
  });
  await deliver(t.deps, evt("PAYMENT_OVERDUE", { id: "pay_s2", subscription: "sub_1", dueDate: "2027-01-20" }));
  assert.equal(t.row().status, "atrasado");
  assert.equal(t.row().overdue_since, "2027-01-20");
  // pay_s1 (due 12-20) is confirmed late: it must not lift the January overdue
  await deliver(t.deps, evt("PAYMENT_CONFIRMED", { id: "pay_s1", subscription: "sub_1", customer: "cus_1", dueDate: "2026-12-20" }));
  await deliver(t.deps, evt("PAYMENT_RECEIVED", { id: "pay_s1", subscription: "sub_1", customer: "cus_1", dueDate: "2026-12-20" }));
  assert.equal(t.row().status, "atrasado");
  assert.equal(t.row().overdue_since, "2027-01-20");
  // the overdue charge is paid: CONFIRMED clears it, the trailing RECEIVED changes nothing and is not re-verified
  await deliver(t.deps, evt("PAYMENT_CONFIRMED", { id: "pay_s2", subscription: "sub_1", customer: "cus_1", dueDate: "2027-01-20" }));
  assert.equal(t.row().status, "ativo");
  assert.equal(t.row().overdue_since, null);
  const before = names(t.asaas).filter((n) => n === "getPayment").length;
  await deliver(t.deps, evt("PAYMENT_OVERDUE", { id: "pay_s3", subscription: "sub_1", dueDate: "2027-02-20" }));
  await deliver(t.deps, evt("PAYMENT_RECEIVED", { id: "pay_s2", subscription: "sub_1", customer: "cus_1", dueDate: "2027-01-20" }));
  assert.equal(t.row().status, "atrasado");
  assert.equal(names(t.asaas).filter((n) => n === "getPayment").length, before);
});

test("refund: only the current setup/subscription payment cancels the plan (and the Asaas subscription)", async () => {
  const active = () => setup(baseRow({ status: "ativo", asaas_subscription_id: "sub_1", setup_payment_id: "pay_1" }));
  const other = active();
  await deliver(other.deps, evt("PAYMENT_REFUNDED", { id: "pay_old", customer: "cus_1" }));
  assert.equal(other.row().status, "ativo");
  assert.equal(names(other.asaas).includes("cancelSubscription"), false);
  const current = active();
  await deliver(current.deps, evt("PAYMENT_REFUNDED", { id: "pay_1", customer: "cus_1" }));
  assert.equal(current.row().status, "cancelado");
  assert.deepEqual(current.asaas.calls.find((c) => c[0] === "cancelSubscription"), ["cancelSubscription", "sub_1"]);
  const sub = active();
  await deliver(sub.deps, evt("PAYMENT_REFUNDED", { id: "pay_s1", subscription: "sub_1" }));
  assert.equal(sub.row().status, "cancelado");
});

test("own cancel: Asaas's SUBSCRIPTION_DELETED echo keeps the paid period", async () => {
  const t = setup(baseRow({ status: "ativo", asaas_subscription_id: "sub_1", cancel_at: "2026-12-20" }));
  await deliver(t.deps, evt("SUBSCRIPTION_DELETED", undefined, { subscription: { id: "sub_1", customer: "cus_1" } }));
  assert.equal(t.row().status, "ativo");
  assert.equal(t.row().cancel_at, "2026-12-20");
  const plain = setup(baseRow({ status: "ativo", asaas_subscription_id: "sub_1" }));
  await deliver(plain.deps, evt("SUBSCRIPTION_DELETED", undefined, { subscription: { id: "sub_1", customer: "cus_1" } }));
  assert.equal(plain.row().status, "cancelado");
});

test("scheduled downgrade is applied by the matching subscription charge", async () => {
  const t = setup(
    baseRow({ status: "ativo", asaas_subscription_id: "sub_1", price_cents: 17900, founder: true, pending_plan: "essencial", pending_cycle: "mensal", pending_since: "2026-12-01", current_period_end: "2026-12-20" }),
    { pay_s2: { id: "pay_s2", customer: "cus_1", value: 149, status: "CONFIRMED", dueDate: "2026-12-20" } },
  );
  await deliver(t.deps, evt("PAYMENT_CONFIRMED", { id: "pay_s2", subscription: "sub_1", customer: "cus_1", dueDate: "2026-12-20" }));
  assert.equal(t.row().plan, "essencial");
  assert.equal(t.row().price_cents, 14900);
  assert.equal(t.row().founder, false);
  assert.equal(t.row().pending_plan, null);
  assert.equal(t.row().current_period_end, "2027-01-20");
});
