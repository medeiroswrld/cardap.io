import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

// provisionCheckout and the Asaas webhook handler against a fake Asaas client and a fake service
// client (in-memory tables). No network, no database, no real Asaas.
const load = loader({
  "./supabase/server": { serviceClient: () => { throw new Error("real client must not be used"); } },
  "./observability/logger": { logger: { warn() {}, error() {} } },
});
const { processAsaasWebhook, processingClaimFilter, subscriptionClaimFilter } = load("src/lib/billing-webhook.ts");
const { provisionCheckout } = load("src/lib/billing-server.ts");
const { toReais } = load("src/lib/asaas.ts");

const RID = "11111111-1111-4111-8111-111111111111";
const TODAY = "2026-11-18";

class Query {
  constructor(db, table, fail) {
    Object.assign(this, { db, table, fail, op: "select", filters: [], opts: {}, max: Infinity });
  }
  select(_cols, opts = {}) { this.opts = opts; if (this.op === "update") this.returning = true; return this; }
  insert(row) { this.op = "insert"; this.row = row; return this; }
  update(patch) { this.op = "update"; this.patch = patch; return this; }
  eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
  in(c, vs) { this.filters.push((r) => vs.includes(r[c])); return this; }
  is(c, v) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  or(expr) {
    (this.db.orFilters ??= []).push(expr);
    // PostgREST reads a quoted value as one literal, so ":" and "." inside it are not separators.
    const parts = expr.match(/(?:[^,"]|"[^"]*")+/g) ?? [];
    const tests = parts.map((part) => {
      const [c, op, ...rest] = part.split(/\.(?=(?:[^"]*"[^"]*")*[^"]*$)/);
      const v = rest.join(".").replace(/^"(.*)"$/, "$1");
      if (op === "is") return (r) => (r[c] ?? null) === (v === "null" ? null : v);
      if (op === "lt") return (r) => r[c] != null && r[c] < v;
      throw new Error("unsupported or(): " + part);
    });
    this.filters.push((r) => tests.some((t) => t(r)));
    return this;
  }
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
      rows.push({ processed_at: null, processing_started_at: null, ...this.row });
      return { data: null, error: null };
    }
    const match = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === "update") {
      for (const r of match) Object.assign(r, this.patch);
      return { data: this.returning ? match.map((r) => ({ ...r })) : null, error: null };
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
  const fail = { getPayment: null, createSubscription: null, updateCustomer: null };
  const subs = [];
  const api = {
    calls,
    store,
    subs,
    async listSubscriptions(filter) { calls.push(["listSubscriptions", filter]); return subs.map((x) => ({ ...x })); },
    async updateCustomer(id, input) {
      calls.push(["updateCustomer", id, input]);
      if (fail.updateCustomer) throw fail.updateCustomer;
      return { id };
    },
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
      if (api.gate) await api.gate;
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
    notify: async (id, plan, reactivation) => notified.push(reactivation ? [id, plan, true] : [id, plan]),
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
  // renewal e-mails/SMS are switched back on exactly once, at first activation
  assert.deepEqual(t.asaas.calls.filter((c) => c[0] === "updateCustomer"), [["updateCustomer", "cus_1", { notificationDisabled: false }]]);
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
  active.asaas.store.set("pay_s1", { id: "pay_s1", customer: "cus_1", value: 249, status: "OVERDUE", dueDate: "2026-12-20" });
  await deliver(active.deps, evt("PAYMENT_OVERDUE", { id: "pay_s1", subscription: "sub_1", dueDate: "2026-12-20" }));
  assert.equal(active.row().status, "atrasado");
  assert.equal(active.row().overdue_since, "2026-12-20");
});

test("I1 sequence: a late payment of an older charge does not clear a newer overdue; duplicate RECEIVED is dropped", async () => {
  const t = setup(baseRow({ status: "ativo", asaas_subscription_id: "sub_1", current_period_end: "2026-12-20" }), {
    pay_s1: { id: "pay_s1", customer: "cus_1", value: 249, status: "RECEIVED", dueDate: "2026-12-20" },
    pay_s2: { id: "pay_s2", customer: "cus_1", value: 249, status: "OVERDUE", dueDate: "2027-01-20" },
    pay_s3: { id: "pay_s3", customer: "cus_1", value: 249, status: "OVERDUE", dueDate: "2027-02-20" },
  });
  await deliver(t.deps, evt("PAYMENT_OVERDUE", { id: "pay_s2", subscription: "sub_1", dueDate: "2027-01-20" }));
  assert.equal(t.row().status, "atrasado");
  assert.equal(t.row().overdue_since, "2027-01-20");
  // pay_s1 (due 12-20) is confirmed late: it must not lift the January overdue
  await deliver(t.deps, evt("PAYMENT_CONFIRMED", { id: "pay_s1", subscription: "sub_1", customer: "cus_1", dueDate: "2026-12-20" }));
  await deliver(t.deps, evt("PAYMENT_RECEIVED", { id: "pay_s1", subscription: "sub_1", customer: "cus_1", dueDate: "2026-12-20" }));
  assert.equal(t.row().status, "atrasado");
  assert.equal(t.row().overdue_since, "2027-01-20");
  t.asaas.store.get("pay_s2").status = "CONFIRMED";
  // the overdue charge is paid: CONFIRMED clears it, the trailing RECEIVED changes nothing and is not re-verified
  await deliver(t.deps, evt("PAYMENT_CONFIRMED", { id: "pay_s2", subscription: "sub_1", customer: "cus_1", dueDate: "2027-01-20" }));
  assert.equal(t.row().status, "ativo");
  assert.equal(t.row().overdue_since, null);
  await deliver(t.deps, evt("PAYMENT_OVERDUE", { id: "pay_s3", subscription: "sub_1", dueDate: "2027-02-20" }));
  const before = names(t.asaas).filter((n) => n === "getPayment").length;
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

// ---- round 2 ----
test("OVERDUE is confirmed with Asaas: one that arrives after the charge was paid does not mark atrasado", async () => {
  const mk = (status) =>
    setup(baseRow({ status: "ativo", asaas_subscription_id: "sub_1", current_period_end: "2026-12-20" }), {
      pay_s1: { id: "pay_s1", customer: "cus_1", value: 249, status, dueDate: "2026-12-20" },
    });
  const overdue = evt("PAYMENT_OVERDUE", { id: "pay_s1", subscription: "sub_1", dueDate: "2026-12-20" });
  for (const status of ["CONFIRMED", "RECEIVED", "PENDING"]) {
    const t = mk(status);
    assert.equal((await deliver(t.deps, overdue)).status, 200);
    assert.equal(t.row().status, "ativo", status);
  }
  const gone = setup(baseRow({ status: "ativo", asaas_subscription_id: "sub_1" })); // Asaas answers 404
  await deliver(gone.deps, evt("PAYMENT_OVERDUE", { id: "pay_s1", subscription: "sub_1", dueDate: "2026-12-20" }));
  assert.equal(gone.row().status, "ativo");
  const real = mk("OVERDUE");
  await deliver(real.deps, evt("PAYMENT_OVERDUE", { id: "pay_s1", subscription: "sub_1", dueDate: "2026-12-20" }));
  assert.equal(real.row().status, "atrasado");
  const down = mk("OVERDUE");
  down.asaas.fail.getPayment = new Error("BILLING_UNAVAILABLE");
  await assert.rejects(deliver(down.deps, evt("PAYMENT_OVERDUE", { id: "pay_s1", subscription: "sub_1", dueDate: "2026-12-20" })), { message: "BILLING_UNAVAILABLE" });
  assert.equal(down.row().status, "ativo");
});

test("first activation reuses a live Asaas subscription instead of creating a second one", async () => {
  const t = setup(baseRow(), { pay_1: paid });
  t.asaas.subs.push({ id: "sub_existing", customer: "cus_1", status: "ACTIVE" });
  await deliver(t.deps, evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" }));
  assert.equal(names(t.asaas).includes("createSubscription"), false);
  assert.deepEqual(t.asaas.calls.find((c) => c[0] === "listSubscriptions")[1], { customer: "cus_1", status: "ACTIVE" });
  assert.equal(t.row().asaas_subscription_id, "sub_existing");
  assert.equal(t.row().status, "ativo");
});

test("concurrent duplicate deliveries process the event once", async () => {
  const t = setup(baseRow(), { pay_1: paid });
  const e = evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" });
  const results = await Promise.allSettled([deliver(t.deps, e), deliver(t.deps, e), deliver(t.deps, e)]);
  assert.equal(names(t.asaas).filter((n) => n === "createSubscription").length, 1);
  assert.equal(t.asaas.calls.filter((c) => c[0] === "updateCustomer").length, 1);
  assert.equal(t.notified.length, 1);
  assert.ok(results.some((r) => r.status === "fulfilled"));
  for (const r of results) if (r.status === "rejected") assert.equal(r.reason.message, "BILLING_UNAVAILABLE"); // "in progress": Asaas retries
  assert.equal(t.row().status, "ativo");
  assert.equal((await (await deliver(t.deps, e)).json()).duplicate, true);
});

test("processing lease: a fresh claim blocks, an expired one is taken over", async () => {
  const e = evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" });
  const claimed = (ageMs) => ({ id: e.id, restaurant_id: RID, type: e.event, payload: e, payment_id: "pay_1", processed_at: null, processing_started_at: new Date(Date.now() - ageMs).toISOString() });
  const fresh = setup(baseRow(), { pay_1: paid });
  fresh.db.billing_events.push(claimed(10_000));
  await assert.rejects(deliver(fresh.deps, e), { message: "BILLING_UNAVAILABLE" });
  assert.equal(fresh.row().status, "pendente");
  const stale = setup(baseRow(), { pay_1: paid });
  stale.db.billing_events.push(claimed(5 * 60_000));
  await deliver(stale.deps, e);
  assert.equal(stale.row().status, "ativo");
  assert.ok(stale.db.billing_events[0].processed_at);
  // a transient failure hands the claim back so the very next delivery can run
  const fails = setup(baseRow(), { pay_1: paid });
  fails.asaas.fail.getPayment = new Error("BILLING_UNAVAILABLE");
  await assert.rejects(deliver(fails.deps, e));
  assert.equal(fails.db.billing_events[0].processing_started_at, null);
});

test("provisionCheckout: any first-charge status other than PENDING/OVERDUE blocks a replacement", async () => {
  for (const status of ["AWAITING_RISK_ANALYSIS", "RECEIVED_IN_CASH", "CONFIRMED", "RECEIVED", "REFUNDED"]) {
    const asaas = fakeAsaas({ pay_1: { id: "pay_1", customer: "cus_1", value: 546, status, dueDate: "2026-11-20", invoiceUrl: "https://www.asaas.com/i/pay_1" } });
    await assert.rejects(provisionCheckout(asaas, input(), fakeService(newDb()), TODAY), { message: "STATE_CONFLICT" }, status);
    assert.equal(names(asaas).includes("createPayment"), false, status);
    assert.equal(names(asaas).includes("deletePayment"), false, status);
  }
});

test("RECEIVED_IN_CASH counts as paid for activation", async () => {
  const t = setup(baseRow(), { pay_1: { ...paid, status: "RECEIVED_IN_CASH" } });
  await deliver(t.deps, evt("PAYMENT_RECEIVED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" }));
  assert.equal(t.row().status, "ativo");
});

test("a failing renewal-notice switch is logged and does not undo the activation", async () => {
  const t = setup(baseRow(), { pay_1: paid });
  t.asaas.fail.updateCustomer = new Error("BILLING_UNAVAILABLE");
  const e = evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" });
  const res = await deliver(t.deps, e);
  assert.equal(res.status, 200);
  assert.equal(t.row().status, "ativo");
  assert.deepEqual(t.logs.find(([ev]) => ev === "billing.notify_failed"), ["billing.notify_failed", e.id]);
});

test("Asaas rejections and DB constraint errors are non-transient (200); outages stay transient; unactivated paid setup charges are flagged", async () => {
  const rejected = setup(baseRow(), { pay_1: paid });
  rejected.asaas.fail.createSubscription = new Error("ASAAS_REJECTED");
  const e = evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" });
  assert.equal((await deliver(rejected.deps, e)).status, 200);
  assert.deepEqual(rejected.logs.find(([ev]) => ev === "billing.webhook_unactivated"), ["billing.webhook_unactivated", e.id]);
  assert.ok(rejected.db.billing_events[0].processed_at);
  const constraint = setup(baseRow(), { pay_1: paid }, (table, op) => (table === "restaurant_billing" && op === "update" ? { code: "23514", message: "check violation" } : null));
  assert.equal((await deliver(constraint.deps, evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" }))).status, 200);
  const outage = setup(baseRow(), { pay_1: paid });
  outage.asaas.fail.createSubscription = new Error("BILLING_UNAVAILABLE");
  await assert.rejects(deliver(outage.deps, evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" })));
  // paid at Asaas but for another value/customer: flagged; merely unpaid: not flagged
  const mismatch = setup(baseRow(), { pay_1: { ...paid, value: 1 } });
  const e2 = evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" });
  await deliver(mismatch.deps, e2);
  assert.deepEqual(mismatch.logs.find(([ev]) => ev === "billing.webhook_unactivated"), ["billing.webhook_unactivated", e2.id]);
  const unpaid = setup(baseRow(), { pay_1: { ...paid, status: "PENDING" } });
  await deliver(unpaid.deps, evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" }));
  assert.equal(unpaid.logs.some(([ev]) => ev === "billing.webhook_unactivated"), false);
});

test("claim filters quote the timestamp so PostgREST reads it as one value", async () => {
  const iso = "2026-11-18T12:34:56.789Z";
  assert.equal(processingClaimFilter(iso), `processing_started_at.is.null,processing_started_at.lt."${iso}"`);
  assert.equal(subscriptionClaimFilter(iso), `subscription_claimed_at.is.null,subscription_claimed_at.lt."${iso}"`);
  // the filter the handler really sends when it claims a known, unfinished event
  const t = setup(baseRow(), { pay_1: paid });
  const e = evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" });
  t.db.billing_events.push({ id: e.id, restaurant_id: RID, type: e.event, payload: e, payment_id: "pay_1", processed_at: null, processing_started_at: new Date(Date.now() - 5 * 60_000).toISOString() });
  await deliver(t.deps, e);
  assert.equal(t.row().status, "ativo");
  const [eventFilter, claimFilter] = t.db.orFilters;
  assert.match(eventFilter, /^processing_started_at\.is\.null,processing_started_at\.lt\."\d{4}-\d{2}-\d{2}T[\d:.]+Z"$/);
  assert.match(claimFilter, /^subscription_claimed_at\.is\.null,subscription_claimed_at\.lt\."\d{4}-\d{2}-\d{2}T[\d:.]+Z"$/);
});

test("subscription race: CONFIRMED and RECEIVED (distinct events) create ONE subscription", async () => {
  const t = setup(baseRow(), { pay_1: paid });
  let release;
  t.asaas.gate = new Promise((resolve) => (release = resolve));
  const confirmed = evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" });
  const received = evt("PAYMENT_RECEIVED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" });
  const both = Promise.allSettled([deliver(t.deps, confirmed), deliver(t.deps, received)]);
  await new Promise((resolve) => setTimeout(resolve, 20));
  release();
  const results = await both;
  assert.equal(names(t.asaas).filter((n) => n === "createSubscription").length, 1);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const loser = results.find((r) => r.status === "rejected");
  assert.equal(loser.reason.message, "BILLING_UNAVAILABLE"); // retryable: Asaas redelivers
  assert.equal(t.row().asaas_subscription_id, "sub_1");
  assert.equal(t.row().status, "ativo");
  // the retried loser finds the saved subscription and creates nothing more
  await deliver(t.deps, loser === results[0] ? confirmed : received);
  assert.equal(names(t.asaas).filter((n) => n === "createSubscription").length, 1);
  assert.equal(t.notified.length, 1);
});

test("subscription lease: a fresh claim blocks, an expired one is taken over, a failed creation frees it", async () => {
  const e = () => evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" });
  const held = setup(baseRow({ subscription_claimed_at: new Date(Date.now() - 10_000).toISOString() }), { pay_1: paid });
  await assert.rejects(deliver(held.deps, e()), { message: "BILLING_UNAVAILABLE" });
  assert.equal(names(held.asaas).includes("createSubscription"), false);
  assert.equal(held.row().status, "pendente");
  const stale = setup(baseRow({ subscription_claimed_at: new Date(Date.now() - 10 * 60_000).toISOString() }), { pay_1: paid });
  await deliver(stale.deps, e());
  assert.equal(stale.row().asaas_subscription_id, "sub_1");
  const failing = setup(baseRow(), { pay_1: paid });
  failing.asaas.fail.createSubscription = new Error("BILLING_UNAVAILABLE");
  await assert.rejects(deliver(failing.deps, e()));
  assert.equal(failing.row().subscription_claimed_at, null);
});

test("checkout retry: a charge Asaas still returns with deleted: true is not reusable", async () => {
  const db = newDb(baseRow());
  const asaas = fakeAsaas({ pay_1: { id: "pay_1", customer: "cus_1", value: 546, status: "PENDING", dueDate: "2026-11-20", invoiceUrl: "https://www.asaas.com/i/pay_1", deleted: true } });
  assert.equal(await provisionCheckout(asaas, input(), fakeService(db), TODAY), "https://www.asaas.com/i/pay_new1");
  assert.equal(names(asaas).includes("deletePayment"), false);
  assert.equal(db.restaurant_billing[0].setup_payment_id, "pay_new1");
});

test("plan or state changes invalidate the public menu cache; other events do not", async () => {
  const t = setup(baseRow(), { pay_1: paid });
  const invalidated = [];
  t.deps.invalidate = async (id) => invalidated.push(id);
  await deliver(t.deps, evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" }));
  assert.deepEqual(invalidated, [RID]);
  const quiet = setup(baseRow(), { pay_1: paid });
  quiet.deps.invalidate = async (id) => invalidated.push(id);
  await deliver(quiet.deps, evt("PAYMENT_CREATED", { id: "pay_1", customer: "cus_1" }));
  assert.equal(invalidated.length, 1);
  // a failing invalidation never fails the webhook
  const broken = setup(baseRow(), { pay_1: paid });
  broken.deps.invalidate = async () => { throw new Error("boom"); };
  assert.equal((await deliver(broken.deps, evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" }))).status, 200);
});

test("lease release is conditional: another claimant's lease is not cleared", async () => {
  const t = setup(baseRow(), { pay_1: paid });
  t.asaas.fail.createSubscription = new Error("BILLING_UNAVAILABLE");
  // while we are creating, a later claimant took the lease over
  t.asaas.gate = Promise.resolve().then(() => { t.row().subscription_claimed_at = "2099-01-01T00:00:00.000Z"; });
  await assert.rejects(deliver(t.deps, evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" })));
  assert.equal(t.row().subscription_claimed_at, "2099-01-01T00:00:00.000Z");
});

// ---- final review ----
test("partial refund of the current charge cancels the plan like a full refund; foreign charges do not", async () => {
  const active = () => setup(baseRow({ status: "ativo", asaas_subscription_id: "sub_1", setup_payment_id: "pay_1", cancel_at: "2099-01-01", current_period_end: "2099-01-01" }));
  const other = active();
  await deliver(other.deps, evt("PAYMENT_PARTIALLY_REFUNDED", { id: "pay_old", customer: "cus_1" }));
  assert.equal(other.row().status, "ativo");
  assert.equal(names(other.asaas).includes("cancelSubscription"), false);
  const current = active();
  await deliver(current.deps, evt("PAYMENT_PARTIALLY_REFUNDED", { id: "pay_1", customer: "cus_1" }));
  assert.equal(current.row().status, "cancelado");
  assert.equal(current.row().cancel_at, null, "no future access date after a refund");
  assert.deepEqual(current.asaas.calls.find((c) => c[0] === "cancelSubscription"), ["cancelSubscription", "sub_1"]);
  const sub = active();
  await deliver(sub.deps, evt("PAYMENT_PARTIALLY_REFUNDED", { id: "pay_s1", subscription: "sub_1" }));
  assert.equal(sub.row().status, "cancelado");
});

test("webhook payloads are stored with the parsed fields only (no card data or tokens)", async () => {
  const t = setup(baseRow(), { pay_1: paid });
  await deliver(
    t.deps,
    evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20", creditCard: { creditCardToken: "tok_secret", creditCardNumber: "1234" }, value: 546 }, { extra: "x" }),
  );
  const stored = JSON.stringify(t.db.billing_events[0].payload);
  assert.equal(stored.includes("tok_secret"), false);
  assert.equal(stored.includes("creditCard"), false);
  assert.equal(stored.includes('"extra"'), false);
  assert.equal(t.db.billing_events[0].payload.payment.id, "pay_1");
});

test("events with no status mapping are logged by type", async () => {
  for (const type of ["PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_DELETED"]) {
    const t = setup(baseRow({ status: "ativo", asaas_subscription_id: "sub_1" }));
    await deliver(t.deps, evt(type, { id: "pay_1", customer: "cus_1" }));
    assert.ok(t.logs.some(([e, r]) => e === "billing.webhook_ignored" && r === type), type);
    assert.equal(t.row().status, "ativo");
  }
});

test("verification compares what we billed (originalValue), not what was paid with interest", async () => {
  const t = setup(baseRow(), { pay_1: { ...paid, value: 553.2, originalValue: 546 } });
  await deliver(t.deps, evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" }));
  assert.equal(t.row().status, "ativo");
});

test("reactivation: first charge is the plan price only (no implantação) and its payment activates the plan", async () => {
  const bare = baseRow({ setup_payment_id: null, reactivated: true });
  const db = newDb(bare);
  const asaas = fakeAsaas();
  const url = await provisionCheckout(asaas, input({ reactivation: true }), fakeService(db), TODAY);
  assert.equal(url, "https://www.asaas.com/i/pay_new1");
  assert.equal(asaas.calls.find((c) => c[0] === "createPayment")[1].valueCents, 24900);
  assert.equal(names(asaas).includes("createCustomer"), false, "the kept customer is reused");
  assert.equal(db.restaurant_billing[0].setup_payment_id, "pay_new1");
  // the webhook accepts exactly the plan price for a reactivated row, and not the old setup + price total
  const ok = setup(baseRow({ reactivated: true, setup_payment_id: "pay_r" }), { pay_r: { ...paid, id: "pay_r", value: 249 } });
  await deliver(ok.deps, evt("PAYMENT_CONFIRMED", { id: "pay_r", customer: "cus_1", dueDate: "2026-11-20" }));
  assert.equal(ok.row().status, "ativo");
  assert.equal(ok.asaas.calls.find((c) => c[0] === "createSubscription")[1].nextDueDate, "2026-12-20");
  const wrong = setup(baseRow({ reactivated: true, setup_payment_id: "pay_r" }), { pay_r: { ...paid, id: "pay_r", value: 546 } });
  await deliver(wrong.deps, evt("PAYMENT_CONFIRMED", { id: "pay_r", customer: "cus_1", dueDate: "2026-11-20" }));
  assert.equal(wrong.row().status, "pendente");
});

test("owner notification: reactivated rows are announced as a reactivation, new ones as new subscribers", async () => {
  const r = setup(baseRow({ reactivated: true }), { pay_1: { ...paid, value: 249 } });
  await deliver(r.deps, evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" }));
  assert.deepEqual(r.notified, [[RID, "profissional", true]]);
  const n = setup(baseRow(), { pay_1: paid });
  await deliver(n.deps, evt("PAYMENT_CONFIRMED", { id: "pay_1", customer: "cus_1", dueDate: "2026-11-20" }));
  assert.deepEqual(n.notified, [[RID, "profissional"]]);
});
