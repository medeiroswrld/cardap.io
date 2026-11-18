import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loader } from "./lib/ts-loader.mjs";

const load = loader();
const p = load("src/lib/plans.ts");
const doc = load("src/lib/cpf-cnpj.ts");
const asaas = load("src/lib/asaas.ts");
const ev = load("src/lib/billing-events.ts");
const view = load("src/lib/billing-view.ts");

test("prices by plan, cycle and founder", () => {
  assert.equal(p.priceFor("essencial", "mensal"), 14900);
  assert.equal(p.priceFor("essencial", "anual"), 149000);
  assert.equal(p.priceFor("profissional", "mensal"), 24900);
  assert.equal(p.priceFor("profissional", "anual"), 249000);
  assert.equal(p.priceFor("profissional", "mensal", true), 17900);
  // founder price only exists for Profissional mensal
  assert.equal(p.priceFor("profissional", "anual", true), 249000);
  assert.equal(p.priceFor("essencial", "mensal", true), 14900);
  assert.equal(p.firstChargeCents("profissional", "mensal", true), 29700 + 17900);
  assert.equal(p.firstChargeCents("essencial", "anual"), 29700 + 149000);
  // reactivation: plan price only, no implantação
  assert.equal(p.firstChargeCents("essencial", "mensal", false, { reactivation: true }), 14900);
  assert.equal(p.firstChargeCents("profissional", "anual", false, { reactivation: true }), 249000);
  assert.equal(p.firstChargeCents("profissional", "mensal", false, { reactivation: false }), 29700 + 24900);
});
test("TypeScript prices match the SQL function", () => {
  const sql = fs.readFileSync("supabase/migrations/021_billing.sql", "utf8");
  for (const n of [17900, 14900, 149000, 24900, 249000]) assert.ok(sql.includes(String(n)), String(n));
});
test("feature map and page plans", () => {
  assert.equal(p.allows("essencial", "crm"), false);
  assert.equal(p.allows("profissional", "crm"), true);
  assert.equal(p.allows("agencia", "finance"), true);
  assert.equal(p.pagePlan("produtos"), "essencial");
  assert.equal(p.pagePlan("resumo"), "essencial");
  for (const page of ["contatos", "avaliacoes", "cupons", "reconquistar", "resultados", "metricas", "origem", "caixa", "mes", "contas"])
    assert.equal(p.pagePlan(page), "profissional", page);
  assert.equal(p.pageFeature("mes"), "finance");
  assert.equal(p.pageFeature("pedidos"), null);
});
test("stateBlocks pauses orders for pendente, bloqueado and cancelado only", () => {
  for (const s of ["pendente", "bloqueado", "cancelado"]) assert.equal(p.stateBlocks(s), true, s);
  for (const s of ["ativo", "atrasado", "cortesia"]) assert.equal(p.stateBlocks(s), false, s);
});
test("webhook event to status mapping", () => {
  assert.equal(p.webhookStatus("PAYMENT_CONFIRMED"), "ativo");
  assert.equal(p.webhookStatus("PAYMENT_RECEIVED"), "ativo");
  assert.equal(p.webhookStatus("PAYMENT_OVERDUE"), "atrasado");
  for (const e of ["PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED", "SUBSCRIPTION_DELETED", "SUBSCRIPTION_INACTIVATED"])
    assert.equal(p.webhookStatus(e), "cancelado", e);
  for (const e of ["PAYMENT_CREATED", "PAYMENT_UPDATED", "PAYMENT_DELETED", "PAYMENT_CHARGEBACK_REQUESTED"])
    assert.equal(p.webhookStatus(e), null, e);
});
test("slugFromName", () => {
  assert.equal(p.slugFromName("Capiburguer & Cia!"), "capiburguer-cia");
  assert.equal(p.slugFromName("  Pão de Queijo da Vó  "), "pao-de-queijo-da-vo");
  assert.equal(p.slugFromName("ab"), "restaurante");
  assert.equal(p.slugFromName("!!!"), "restaurante");
  assert.equal(p.slugFromName("Demo"), "demo-restaurante");
  const long = p.slugFromName("a".repeat(30) + " " + "b".repeat(60));
  assert.ok(long.length <= 50 && /^[a-z0-9-]{3,60}$/.test(long) && !long.endsWith("-"));
});
test("ifoodSavings clamps commission and rounds", () => {
  assert.equal(p.ifoodSavings(1000000, 27), 270000);
  assert.equal(p.ifoodSavings(1000000, 5), 120000);
  assert.equal(p.ifoodSavings(1000000, 50), 300000);
  assert.equal(p.ifoodSavings(-5, 27), 0);
  assert.equal(p.ifoodSavings(NaN, 27), 0);
  assert.equal(p.ifoodSavings(333, 27), 90);
});
test("date helpers", () => {
  assert.equal(p.addCycle("2026-01-31", "mensal"), "2026-02-28");
  assert.equal(p.addCycle("2026-11-18", "mensal"), "2026-12-18");
  assert.equal(p.addCycle("2026-12-18", "mensal"), "2027-01-18");
  assert.equal(p.addCycle("2028-02-29", "anual"), "2029-02-28");
  assert.equal(p.addDays("2026-11-30", 2), "2026-12-02");
  assert.match(p.todayBrt(new Date("2026-11-18T01:00:00Z")), /^2026-11-17$/);
});
test("CPF and CNPJ validation", () => {
  assert.equal(doc.isValidCpf("529.982.247-25"), true);
  assert.equal(doc.isValidCpf("52998224725"), true);
  assert.equal(doc.isValidCpf("529.982.247-24"), false);
  assert.equal(doc.isValidCpf("111.111.111-11"), false);
  assert.equal(doc.isValidCpf("123"), false);
  assert.equal(doc.isValidCnpj("11.222.333/0001-81"), true);
  assert.equal(doc.isValidCnpj("11.222.333/0001-82"), false);
  assert.equal(doc.isValidCnpj("00000000000000"), false);
  assert.equal(doc.isValidDocument("11222333000181"), true);
  assert.equal(doc.isValidDocument("abc"), false);
  assert.equal(doc.normalizeDocument("529.982.247-25"), "52998224725");
});

function mockFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  };
  return { impl, calls };
}
const KEY = "SENTINEL-asaas-key-123";
test("asaas client builds requests with reais values, access_token header and sandbox host", async () => {
  const m = mockFetch([
    { body: { id: "cus_1" } },
    { body: { id: "pay_1", invoiceUrl: "https://www.asaas.com/i/1", value: 476, status: "PENDING", dueDate: "2026-11-20" } },
    { body: { id: "sub_1", customer: "cus_1" } },
    { body: { id: "sub_1" } },
    { body: { id: "sub_1", deleted: true } },
    { body: { data: [{ id: "pay_1", value: 476, status: "PENDING", dueDate: "2026-11-20" }] } },
    { body: { id: "pay_1", customer: "cus_1", value: 476, status: "CONFIRMED", dueDate: "2026-11-20", invoiceUrl: "https://evil.example/i" } },
    { body: { deleted: true, id: "pay_1" } },
    { status: 404 },
    { status: 404 },
    { status: 404 },
  ]);
  const a = asaas.createAsaas({ apiKey: KEY, env: "sandbox", fetchImpl: m.impl });
  await a.createCustomer({ name: "Ana", cpfCnpj: "52998224725", email: "a@b.co", externalReference: "rid" });
  const pay = await a.createPayment({ customer: "cus_1", valueCents: 47600, dueDate: "2026-11-20", description: "x", externalReference: "rid" });
  assert.equal(pay.invoiceUrl, "https://www.asaas.com/i/1");
  await a.createSubscription({ customer: "cus_1", valueCents: 17900, nextDueDate: "2026-12-18", cycle: "mensal", description: "x", externalReference: "rid" });
  await a.updateSubscription("sub_1", { valueCents: 249000, cycle: "anual" });
  await a.cancelSubscription("sub_1");
  const list = await a.listPayments({ customer: "cus_1" });
  assert.equal(list[0].invoiceUrl, null);
  const got = await a.getPayment("pay_1");
  assert.equal(got.invoiceUrl, null); // not an asaas.com host
  assert.equal(got.status, "CONFIRMED");
  await a.deletePayment("pay_1");
  assert.deepEqual({ ...(await a.deletePayment("pay_gone")) }, { deleted: true, id: "pay_gone" }); // 404 ignored
  assert.deepEqual({ ...(await a.cancelSubscription("sub_gone")) }, { deleted: true, id: "sub_gone" });
  await assert.rejects(a.getPayment("pay_missing"), { message: "NOT_FOUND" });
  const [c, pm, sb, up, del, ls, gp, dp] = m.calls;
  assert.equal(gp.url, "https://api-sandbox.asaas.com/v3/payments/pay_1");
  assert.equal(gp.init.method, "GET");
  assert.equal(dp.init.method, "DELETE");
  assert.equal(dp.url, "https://api-sandbox.asaas.com/v3/payments/pay_1");
  assert.equal(c.url, "https://api-sandbox.asaas.com/v3/customers");
  assert.equal(c.init.headers.access_token, KEY);
  assert.equal(JSON.parse(c.init.body).notificationDisabled, true);
  const body = (call) => JSON.parse(call.init.body);
  assert.deepEqual(
    { ...body(pm) },
    { customer: "cus_1", billingType: "UNDEFINED", value: 476, dueDate: "2026-11-20", description: "x", externalReference: "rid" },
  );
  assert.equal(body(sb).value, 179);
  assert.equal(body(sb).cycle, "MONTHLY");
  assert.equal(body(sb).billingType, "UNDEFINED");
  assert.equal(up.init.method, "PUT");
  assert.equal(body(up).value, 2490);
  assert.equal(body(up).cycle, "YEARLY");
  assert.equal(del.init.method, "DELETE");
  assert.equal(ls.url, "https://api-sandbox.asaas.com/v3/payments?limit=20&customer=cus_1");
  assert.equal(asaas.toReais(29700 + 14900), 446);
});
test("asaas client maps failures to stable codes without leaking secrets", async () => {
  const run = (response) =>
    asaas
      .createAsaas({ apiKey: KEY, env: "production", fetchImpl: mockFetch([response]).impl })
      .createCustomer({ name: "A", cpfCnpj: "00000000000", email: "a@b.co", externalReference: "r" });
  await assert.rejects(run({ status: 500 }), { message: "BILLING_UNAVAILABLE" });
  await assert.rejects(run(new Error("socket " + KEY)), { message: "BILLING_UNAVAILABLE" });
  await assert.rejects(run({ status: 401, body: { errors: [] } }), { message: "BILLING_UNAVAILABLE" });
  await assert.rejects(run({ status: 400, body: { errors: [{ code: "invalid_cpfCnpj" }] } }), { message: "INVALID_DOCUMENT" });
  const m = mockFetch([{ body: { id: "cus_1" } }]);
  await asaas.createAsaas({ apiKey: KEY, env: "production", fetchImpl: m.impl }).createCustomer({ name: "A", cpfCnpj: "1", email: "a@b.co", externalReference: "r" });
  assert.ok(m.calls[0].url.startsWith("https://api.asaas.com/v3/"));
});
test("asaas config comes from env and is null when incomplete", () => {
  assert.equal(asaas.asaasConfigFromEnv({}), null);
  assert.equal(asaas.asaasConfigFromEnv({ ASAAS_API_KEY: "k", ASAAS_ENV: "staging" }), null);
  assert.deepEqual({ ...asaas.asaasConfigFromEnv({ ASAAS_API_KEY: "k", ASAAS_ENV: "sandbox" }) }, { apiKey: "k", env: "sandbox" });
});

const row = (over = {}) => ({
  restaurant_id: "r", plan: "profissional", cycle: "mensal", status: "pendente", founder: false, price_cents: 24900,
  asaas_customer_id: "cus", asaas_subscription_id: "sub", setup_payment_id: "pay", current_period_end: null,
  overdue_since: null, cancel_at: null, pending_plan: null, pending_cycle: null, pending_since: null, ...over,
});
test("webhook decisions: first activation, renewals, overdue, refund", () => {
  let d = ev.decideWebhook(row(), "PAYMENT_CONFIRMED", { id: "pay", dueDate: "2026-11-20" });
  assert.equal(d.firstActivation, true);
  assert.deepEqual({ ...d.patch }, { status: "ativo", overdue_since: null, current_period_end: "2026-12-20" });
  d = ev.decideWebhook(row({ status: "ativo", current_period_end: "2026-12-20" }), "PAYMENT_RECEIVED", { id: "pay", dueDate: "2026-11-20" });
  assert.equal(d.firstActivation, false);
  assert.equal(d.patch.current_period_end, "2026-12-20"); // never moves backwards
  d = ev.decideWebhook(row({ status: "atrasado", overdue_since: "2026-12-01", cycle: "anual" }), "PAYMENT_RECEIVED", { subscription: "sub", dueDate: "2026-12-20" });
  assert.deepEqual({ ...d.patch }, { status: "ativo", overdue_since: null, current_period_end: "2027-12-20" });
  // overdue
  d = ev.decideWebhook(row({ status: "ativo" }), "PAYMENT_OVERDUE", { subscription: "sub", dueDate: "2026-12-20" });
  assert.deepEqual({ ...d.patch }, { status: "atrasado", overdue_since: "2026-12-20" });
  d = ev.decideWebhook(row({ status: "atrasado", overdue_since: "2026-12-20" }), "PAYMENT_OVERDUE", { subscription: "sub", dueDate: "2027-01-20" });
  assert.equal(d.patch.overdue_since, "2026-12-20");
  assert.equal(ev.decideWebhook(row({ status: "pendente" }), "PAYMENT_OVERDUE", { dueDate: "2026-11-20" }), null);
  // refund cancels the plan and the Asaas subscription
  d = ev.decideWebhook(row({ status: "ativo" }), "PAYMENT_REFUNDED", { id: "pay" });
  assert.deepEqual({ ...d.patch }, { status: "cancelado", cancel_at: null });
  assert.equal(d.cancelAsaasSubscription, true);
  d = ev.decideWebhook(row({ status: "ativo" }), "PAYMENT_PARTIALLY_REFUNDED", { id: "pay" });
  assert.deepEqual({ ...d.patch }, { status: "cancelado", cancel_at: null });
  assert.equal(d.cancelAsaasSubscription, true);
  d = ev.decideWebhook(row({ status: "ativo" }), "SUBSCRIPTION_DELETED", null);
  assert.equal(d.cancelAsaasSubscription, false);
  // unknown events and protected states
  assert.equal(ev.decideWebhook(row(), "PAYMENT_CREATED", {}), null);
  assert.equal(ev.decideWebhook(row({ status: "cortesia" }), "PAYMENT_REFUNDED", {}), null);
  assert.equal(ev.decideWebhook(row({ status: "cancelado" }), "PAYMENT_RECEIVED", { id: "pay", dueDate: "2026-11-20" }), null);
});
test("our own cancel keeps the paid period when Asaas echoes SUBSCRIPTION_DELETED", () => {
  const cancelling = row({ status: "ativo", cancel_at: "2026-12-20" });
  assert.equal(ev.decideWebhook(cancelling, "SUBSCRIPTION_DELETED", null), null);
  assert.equal(ev.decideWebhook(cancelling, "SUBSCRIPTION_INACTIVATED", null), null);
});
test("scheduled downgrade applies on the next confirmed subscription charge only", () => {
  const pending = row({ status: "ativo", pending_plan: "essencial", pending_cycle: "mensal", price_cents: 17900, founder: false });
  // first charge (no subscription id) does not apply it
  let d = ev.decideWebhook(pending, "PAYMENT_CONFIRMED", { id: "pay", dueDate: "2026-11-20" });
  assert.equal(d.patch.plan, undefined);
  d = ev.decideWebhook(pending, "PAYMENT_CONFIRMED", { subscription: "sub", dueDate: "2026-12-20" });
  assert.deepEqual(
    { ...d.patch },
    { status: "ativo", overdue_since: null, plan: "essencial", cycle: "mensal", price_cents: 14900, founder: false, pending_plan: null, pending_cycle: null, pending_since: null, current_period_end: "2027-01-20" },
  );
});
test("invoice urls are accepted only on https asaas.com hosts", () => {
  for (const ok of ["https://www.asaas.com/i/1", "https://sandbox.asaas.com/i/1", "https://asaas.com/x"])
    assert.equal(asaas.safeInvoiceUrl(ok) !== null, true, ok);
  for (const bad of ["http://www.asaas.com/i/1", "https://asaas.com.evil.io/i", "https://evilasaas.com/i", "javascript:alert(1)", "//asaas.com", "", null, 5])
    assert.equal(asaas.safeInvoiceUrl(bad), null, String(bad));
});
test("phone normalisation strips a country code only when digits exceed a national number", () => {
  assert.equal(doc.normalizePhone("+55 (11) 91234-5678"), "11912345678");
  assert.equal(doc.normalizePhone("5511912345678"), "11912345678");
  assert.equal(doc.normalizePhone("551134567890"), "1134567890");
  assert.equal(doc.normalizePhone("(55) 91234-5678"), "55912345678"); // DDD 55, 11 digits: untouched
  assert.equal(doc.normalizePhone("11 3456-7890"), "1134567890");
});
test("webhook: payments that are not the current setup/subscription charge are ignored", () => {
  const r = row({ status: "ativo", setup_payment_id: "pay_new" });
  assert.equal(ev.decideWebhook(r, "PAYMENT_OVERDUE", { id: "pay_old", dueDate: "2026-11-20" }), null);
  assert.equal(ev.decideWebhook(r, "PAYMENT_CONFIRMED", { id: "pay_old", dueDate: "2026-11-20" }), null);
  assert.equal(ev.decideWebhook(r, "PAYMENT_REFUNDED", { id: "pay_old" }), null);
  assert.equal(ev.decideWebhook(r, "PAYMENT_REFUNDED", { id: "x", subscription: "other" }), null);
  assert.equal(ev.decideWebhook(r, "PAYMENT_REFUNDED", { id: "pay_new" }).patch.status, "cancelado");
  assert.equal(ev.decideWebhook(r, "SUBSCRIPTION_DELETED", null, { subscriptionId: "other" }), null);
});
test("webhook: first activation asks for subscription creation only while none exists", () => {
  const pending = row({ asaas_subscription_id: null });
  let d = ev.decideWebhook(pending, "PAYMENT_CONFIRMED", { id: "pay", dueDate: "2026-11-20" });
  assert.equal(d.createSubscription, true);
  assert.equal(d.needsVerification, true);
  d = ev.decideWebhook(row(), "PAYMENT_CONFIRMED", { id: "pay", dueDate: "2026-11-20" });
  assert.equal(d.createSubscription, false);
});
test("webhook: late RECEIVED after CONFIRMED is ignored; a payment older than the overdue one keeps atrasado", () => {
  const late = row({ status: "atrasado", overdue_since: "2026-12-20" });
  assert.equal(ev.decideWebhook(late, "PAYMENT_RECEIVED", { subscription: "sub", dueDate: "2026-12-20" }, { confirmedAlready: true }), null);
  // an older charge (due before overdue_since) gets paid: still atrasado
  let d = ev.decideWebhook(late, "PAYMENT_RECEIVED", { subscription: "sub", dueDate: "2026-11-20" });
  assert.equal(d.patch.status, undefined);
  assert.equal(d.patch.overdue_since, undefined);
  // the overdue charge itself (or newer) clears it
  d = ev.decideWebhook(late, "PAYMENT_RECEIVED", { subscription: "sub", dueDate: "2026-12-20" });
  assert.equal(d.patch.status, "ativo");
  assert.equal(d.patch.overdue_since, null);
});
test("webhook: a scheduled downgrade only applies to charges due on/after pending_since", () => {
  const pending = row({ status: "ativo", pending_plan: "essencial", pending_cycle: "mensal", pending_since: "2026-12-10", founder: true, price_cents: 17900 });
  let d = ev.decideWebhook(pending, "PAYMENT_CONFIRMED", { subscription: "sub", dueDate: "2026-12-05" });
  assert.equal(d.patch.plan, undefined);
  d = ev.decideWebhook(pending, "PAYMENT_CONFIRMED", { subscription: "sub", dueDate: "2026-12-10" });
  assert.equal(d.patch.plan, "essencial");
  assert.equal(d.patch.founder, false);
  assert.equal(d.patch.pending_since, null);
});
test("change_plan decision: upgrade, scheduled downgrade, founder price, same plan", () => {
  const base = { plan: "profissional", cycle: "mensal", founder: false, pending_plan: null };
  const today = "2026-11-18";
  assert.equal(ev.decideChangePlan(base, { plan: "profissional", cycle: "mensal" }, today).kind, "invalid");
  // upgrade applies now with the full price
  let d = ev.decideChangePlan({ ...base, plan: "essencial" }, { plan: "profissional", cycle: "mensal" }, today);
  assert.equal(d.kind, "upgrade");
  assert.equal(d.valueCents, 24900);
  assert.deepEqual({ ...d.patch }, { plan: "profissional", cycle: "mensal", price_cents: 24900, founder: false, pending_plan: null, pending_cycle: null, pending_since: null });
  // mixed (plan down, cycle up) and plain downgrade are scheduled
  d = ev.decideChangePlan(base, { plan: "essencial", cycle: "anual" }, today);
  assert.equal(d.kind, "schedule");
  assert.deepEqual({ ...d.patch }, { pending_plan: "essencial", pending_cycle: "anual", pending_since: today });
  assert.equal(ev.decideChangePlan({ ...base, cycle: "anual" }, { plan: "profissional", cycle: "mensal" }, today).kind, "schedule");
  // founder: confirmation needed, and a scheduled change keeps founder and price until it applies
  const founder = { ...base, founder: true };
  assert.equal(ev.decideChangePlan(founder, { plan: "essencial", cycle: "mensal" }, today).kind, "founder_confirm");
  d = ev.decideChangePlan(founder, { plan: "essencial", cycle: "mensal", confirmFounderLoss: true }, today);
  assert.equal(d.kind, "schedule");
  assert.equal("founder" in d.patch, false);
  assert.equal("price_cents" in d.patch, false);
  d = ev.decideChangePlan(founder, { plan: "profissional", cycle: "anual", confirmFounderLoss: true }, today);
  assert.equal(d.kind, "upgrade");
  assert.equal(d.patch.founder, false);
  assert.equal(d.patch.price_cents, 249000);
  // choosing the current plan again keeps the founder price consistent with Asaas
  d = ev.decideChangePlan({ ...founder, pending_plan: "essencial" }, { plan: "profissional", cycle: "mensal" }, today);
  assert.equal(d.kind, "keep");
  assert.equal(d.valueCents, 17900);
  assert.equal(d.patch.price_cents, 17900);
  assert.equal("founder" in d.patch, false);
  d = ev.decideChangePlan({ ...base, pending_plan: "essencial" }, { plan: "profissional", cycle: "mensal" }, today);
  assert.equal(d.valueCents, 24900);
});
test("asaas client: 4xx (except auth/404/throttle) is ASAAS_REJECTED, lists subscriptions, updates customers", async () => {
  const run = (response) =>
    asaas.createAsaas({ apiKey: KEY, env: "sandbox", fetchImpl: mockFetch([response]).impl }).getPayment("pay_1");
  await assert.rejects(run({ status: 400, body: { errors: [{ code: "x" }] } }), { message: "ASAAS_REJECTED" });
  await assert.rejects(run({ status: 422 }), { message: "ASAAS_REJECTED" });
  await assert.rejects(run({ status: 404 }), { message: "NOT_FOUND" });
  for (const status of [401, 403, 408, 429, 500, 503]) await assert.rejects(run({ status }), { message: "BILLING_UNAVAILABLE" }, String(status));
  const m = mockFetch([{ body: { data: [{ id: "sub_1" }] } }, { body: { id: "cus_1" } }]);
  const a = asaas.createAsaas({ apiKey: KEY, env: "sandbox", fetchImpl: m.impl });
  assert.deepEqual((await a.listSubscriptions({ customer: "cus_1", status: "ACTIVE" })).map((x) => x.id), ["sub_1"]);
  assert.equal(m.calls[0].url, "https://api-sandbox.asaas.com/v3/subscriptions?customer=cus_1&limit=10&status=ACTIVE");
  await a.updateCustomer("cus_1", { notificationDisabled: false });
  assert.equal(m.calls[1].init.method, "PUT");
  assert.equal(m.calls[1].url, "https://api-sandbox.asaas.com/v3/customers/cus_1");
  assert.deepEqual(JSON.parse(m.calls[1].init.body), { notificationDisabled: false });
});

const sales = loader()("src/lib/sales.ts");
test("safeRedirect only allows same-origin paths and https asaas.com", () => {
  for (const ok of ["/gestao", "/gestao?pagamento=documento", "https://www.asaas.com/i/abc", "https://asaas.com/i/1", "https://sandbox.asaas.com/i/1"])
    assert.ok(sales.safeRedirect(ok), ok);
  for (const bad of ["//evil.com", "/\\evil.com", "http://www.asaas.com/i/1", "https://asaas.com.evil.com/i", "https://evilasaas.com/i", "https://user@www.asaas.com/i", "javascript:alert(1)", "", null, 5])
    assert.equal(sales.safeRedirect(bad), null, String(bad));
});
test("agencyWhatsappUrl needs a configured number", () => {
  assert.equal(sales.agencyWhatsappUrl(undefined), null);
  assert.equal(sales.agencyWhatsappUrl(""), null);
  assert.equal(sales.agencyWhatsappUrl("12"), null);
  const url = sales.agencyWhatsappUrl("+55 (15) 99999-0000");
  assert.ok(url.startsWith("https://wa.me/5515999990000?text="));
  assert.ok(url.includes(encodeURIComponent("Oi! Quero saber do plano Agência do Fome Play.")));
});
test("brl drops zero cents", () => {
  assert.match(sales.brl(24900), /^R\$\s?249$/);
  assert.match(sales.brl(14933), /149,33/);
});

test("validateSubscription mirrors the API schema", () => {
  const ok = { restaurantName: "Casa do Chef", ownerName: "Ana", email: "ana@exemplo.com", phone: "(15) 99999-0000", document: "529.982.247-25", password: "12345678", acceptTerms: true };
  assert.deepEqual(sales.validateSubscription(ok), {});
  const bad = sales.validateSubscription({ restaurantName: "A", ownerName: "", email: "x", phone: "123", document: "111.111.111-11", password: "1234567", acceptTerms: false });
  assert.deepEqual(Object.keys(bad).sort(), ["acceptTerms", "document", "email", "ownerName", "password", "phone", "restaurantName"]);
  assert.deepEqual(sales.validateSubscription({ ...ok, document: "11.222.333/0001-81" }), {});
});
test("document and phone masks", () => {
  assert.equal(sales.formatDocument("52998224725"), "529.982.247-25");
  assert.equal(sales.formatDocument("11222333000181"), "11.222.333/0001-81");
  assert.equal(sales.formatDocument("5299"), "529.9");
  assert.equal(sales.formatPhone("15999990000"), "(15) 99999-0000");
  assert.equal(sales.formatPhone("1533334444"), "(15) 3333-4444");
});

test("billing view: dates, states, invoices and plan changes", () => {
  assert.equal(view.fullDate("2026-11-18"), "18/11/2026");
  assert.equal(view.shortDate("2026-11-18"), "18/11");
  assert.equal(view.fullDate(null), "");
  assert.equal(view.stateView("ativo").tone, "success");
  assert.equal(view.stateView("atrasado").tone, "warning");
  assert.equal(view.stateView("bloqueado").tone, "danger");
  assert.equal(view.stateView("cortesia").label, "Cortesia");
  assert.equal(view.invoiceView("PENDING").action, "pay");
  assert.equal(view.invoiceView("OVERDUE").action, "pay");
  assert.equal(view.invoiceView("RECEIVED").action, "receipt");
  // only hosted Asaas pages are linkable; the oldest unpaid one is the payable invoice
  const inv = (id, dueDate, status, invoiceUrl) => ({ id, dueDate, valueCents: 100, status, invoiceUrl });
  assert.equal(view.invoiceLink("http://www.asaas.com/i/1"), null);
  assert.equal(view.invoiceLink("https://evil.example.com/asaas.com"), null);
  assert.equal(view.invoiceLink("https://www.asaas.com/i/1"), "https://www.asaas.com/i/1");
  const payable = view.payableInvoice([
    inv("a", "2026-12-01", "PENDING", "https://www.asaas.com/i/a"),
    inv("b", "2026-11-01", "OVERDUE", "https://www.asaas.com/i/b"),
    inv("c", "2026-10-01", "OVERDUE", "https://evil.example.com/c"),
    inv("d", "2026-09-01", "RECEIVED", "https://www.asaas.com/i/d"),
  ]);
  assert.deepEqual(payable, { id: "b", url: "https://www.asaas.com/i/b" });
  assert.equal(view.payableInvoice(null), null);
  const cur = { plan: "essencial", cycle: "mensal" };
  assert.equal(view.changeKind(cur, { plan: "essencial", cycle: "mensal" }), "same");
  assert.equal(view.changeKind(cur, { plan: "profissional", cycle: "mensal" }), "upgrade");
  assert.equal(view.changeKind(cur, { plan: "essencial", cycle: "anual" }), "upgrade");
  assert.equal(view.changeKind({ plan: "profissional", cycle: "anual" }, { plan: "essencial", cycle: "anual" }), "schedule");
  assert.equal(view.changeKind({ plan: "profissional", cycle: "anual" }, { plan: "profissional", cycle: "mensal" }), "schedule");
  assert.equal(view.changeKind(cur, { plan: "profissional", cycle: "anual" }), "upgrade");
  assert.equal(view.changeKind({ plan: "profissional", cycle: "mensal" }, { plan: "essencial", cycle: "anual" }), "schedule");
});
