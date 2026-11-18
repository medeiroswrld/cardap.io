import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loader } from "./lib/ts-loader.mjs";

// Server-side plan gating: the feature map, the catalog action gate, requirePlan/billingState with a
// fake Supabase client, order gating (billing state and coupons) and a source scan that every
// Profissional route really calls requirePlan with the right feature.
let service = null; // the fake service client of the test at hand
const warnings = [];
const load = loader({
  "./supabase/server": { serviceClient: () => { if (!service) throw new Error("real client must not be used"); return service; } },
  "./observability/logger": { logger: { warn: (event, fields) => warnings.push([event, fields]), error() {} } },
});
const p = load("src/lib/plans.ts");
const billing = load("src/lib/billing-server.ts");
const read = (file) => fs.readFileSync(file, "utf8");
const API = "src/app/api/restaurants/[id]";

function fakeClient(plan = "profissional", state = "ativo", { fail = false } = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (fn, args) => {
      calls.push([fn, args.p_restaurant]);
      if (fail) return { data: null, error: { code: "XX000", message: "db down" } };
      return { data: fn === "restaurant_plan" ? plan : state, error: null };
    },
  };
}

test("every Profissional feature requires profissional; Essencial gets none of them", () => {
  for (const feature of Object.keys(p.FEATURES)) {
    assert.equal(p.FEATURES[feature], "profissional", feature);
    assert.equal(p.allows("essencial", feature), false, feature);
    assert.equal(p.allows("profissional", feature), true, feature);
    assert.equal(p.allows("agencia", feature), true, feature);
  }
});

test("catalog actions: every action in the route is mapped, every mapping exists in the route", () => {
  const route = read(`${API}/catalog/route.ts`);
  const actions = [...route.matchAll(/action: z\.literal\("([a-z_]+)"\)/g)].map((m) => m[1]);
  assert.ok(actions.length >= 20);
  for (const action of actions) assert.ok(Object.hasOwn(p.CATALOG_ACTIONS, action), `${action} is not in CATALOG_ACTIONS`);
  // crm_settings comes from crmSettingsBody (crm-query.ts), not a literal in the route
  for (const action of Object.keys(p.CATALOG_ACTIONS)) assert.ok(actions.includes(action) || action === "crm_settings", `${action} is not a route action`);
  assert.throws(() => p.catalogActionFeature({ action: "unmapped_action" }), { message: "INVALID_INPUT" });
});

test("catalog actions: the Profissional ones and the Essencial allowed set", () => {
  const needs = {
    feedback_settings: "reviews",
    moderate_feedback: "reviews",
    crm_settings: "crm",
    save_coupon: "coupons",
    delete_coupon: "coupons",
    save_origin: "origin",
    delete_origin: "origin",
    save_finance_entry: "finance",
    delete_finance_entry: "finance",
    set_entry_paid: "finance",
    save_payment_fees: "finance",
  };
  for (const [action, feature] of Object.entries(needs)) {
    assert.equal(p.catalogActionFeature({ action }), feature, action);
    assert.equal(p.allows("essencial", feature), false, action);
  }
  for (const action of [
    "save_product", "archive_product", "save_category", "remove_category", "settings",
    "save_delivery_zone", "save_pix", "revoke_marketing",
  ])
    assert.equal(p.catalogActionFeature({ action }), null, action);
});

test("catalog actions: upsell is gated only when it turns something on", () => {
  assert.equal(p.catalogActionFeature({ action: "save_option", offer_in_bag: true }), "upsell");
  // already offered: renaming/repricing (the editor resends offer_in_bag: true) keeps working
  assert.equal(p.catalogActionFeature({ action: "save_option", offer_in_bag: true }, true), null);
  assert.equal(p.catalogActionFeature({ action: "save_option", offer_in_bag: false }, true), null);
  assert.equal(p.catalogActionFeature({ action: "save_option", offer_in_bag: false }), null);
  assert.equal(p.catalogActionFeature({ action: "save_option" }), null);
  assert.equal(p.catalogActionFeature({ action: "options_in_bag_all", offer: true }), "upsell");
  assert.equal(p.catalogActionFeature({ action: "options_in_bag_all", offer: false }), null);
  assert.equal(p.catalogActionFeature({ action: "bag_suggestions", product_ids: ["a"] }), "upsell");
  assert.equal(p.catalogActionFeature({ action: "bag_suggestions", product_ids: [] }), null);
});

// The payload menu-theme-settings.tsx really sends: every key it has, `mode` always derived from the background.
const editorPayload = (over = {}) => ({
  preset: "personalizado", brand: "#a63232", background: "#fff8f2", surface: "#ffffff", text: "#251c1a",
  heading_font: "padrao", body_font: "manrope", radius: "suave", mode: "light",
  logo_url: "https://x.supabase.co/storage/v1/object/public/restaurant-media/r/a.png", ...over,
});

test("menu_theme on Essencial: basic keys and mode are kept, repeated stored keys are dropped silently", () => {
  assert.equal(p.catalogActionFeature({ action: "menu_theme" }), null); // decided by essencialTheme in the route
  // fresh restaurant: logo + brand + the derived mode (what the editor sends after picking only those)
  const fresh = p.essencialTheme({ brand: "#112233", logo_url: "u", cover_url: "c", mode: "dark" }, {});
  assert.deepEqual(fresh, { theme: { brand: "#112233", logo_url: "u", cover_url: "c", mode: "dark" }, denied: false });
  assert.deepEqual(p.essencialTheme({}, {}), { theme: {}, denied: false });
  // a downgraded owner whose editor resends the stored Profissional theme but changes logo and brand
  const stored = editorPayload({ heading_font: "forte", radius: "reto", preset: "noite" });
  const resent = p.essencialTheme({ ...stored, brand: "#00aa00", logo_url: "new" }, stored);
  assert.equal(resent.denied, false);
  assert.deepEqual(resent.theme, { brand: "#00aa00", logo_url: "new", mode: "light" });
});

test("menu_theme on Essencial: a non-basic key that differs from the stored one is PLAN_REQUIRED territory", () => {
  for (const key of ["preset", "background", "surface", "text", "heading_font", "body_font", "radius"]) {
    assert.equal(p.essencialTheme(editorPayload({ [key]: "changed" }), editorPayload()).denied, true, key);
    assert.equal(p.essencialTheme(editorPayload(), {}).denied, true, `${key}: nothing stored`);
  }
  assert.equal(p.essencialTheme(editorPayload(), null).denied, true);
  assert.equal(p.essencialTheme(editorPayload(), editorPayload()).denied, false);
});

test("requirePlan: PLAN_REQUIRED on Essencial (also when the plan lapsed), fine on Profissional/cortesia", async () => {
  // restaurant_plan already folds the billing status in: lapsed accounts answer "essencial"
  await assert.rejects(billing.requirePlan("r1", "crm", fakeClient("essencial", "ativo")), { message: "PLAN_REQUIRED" });
  await assert.rejects(billing.requirePlan("r1", "finance", fakeClient("essencial", "bloqueado")), { message: "PLAN_REQUIRED" });
  await billing.requirePlan("r1", "crm", fakeClient("profissional", "ativo"));
  await billing.requirePlan("r1", "finance", fakeClient("profissional", "cortesia"));
  await assert.rejects(billing.requirePlan("r1", "crm", fakeClient("x", "y", { fail: true })), { code: "XX000" });
});

test("requirePlan and billingState: one database call per request client", async () => {
  const client = fakeClient("profissional", "ativo");
  await billing.requirePlan("r1", "crm", client);
  await billing.requirePlan("r1", "coupons", client);
  assert.equal(await billing.restaurantPlan("r1", client), "profissional");
  assert.equal(await billing.billingState("r1", client), "ativo");
  assert.equal(await billing.billingState("r1", client), "ativo");
  assert.deepEqual(client.calls, [["restaurant_plan", "r1"], ["restaurant_billing_state", "r1"]]);
  await billing.requirePlan("r2", "crm", client); // another restaurant is not served from the cache
  assert.equal(client.calls.length, 3);
  // a different request (client) asks again; a failure is not cached
  const other = fakeClient("essencial");
  await assert.rejects(billing.requirePlan("r1", "crm", other), { message: "PLAN_REQUIRED" });
  assert.equal(other.calls.length, 1);
  let healthy = false;
  const flaky = { rpc: async () => (healthy ? { data: "profissional", error: null } : { data: null, error: { code: "XX000" } }) };
  await assert.rejects(billing.requirePlan("r1", "crm", flaky));
  await new Promise((resolve) => setTimeout(resolve, 0));
  healthy = true;
  await billing.requirePlan("r1", "crm", flaky);
});

test("catalog gate end to end: Profissional actions are refused on Essencial, the rest passes", async () => {
  const gate = async (plan, body) => {
    const feature = p.catalogActionFeature(body);
    if (feature) await billing.requirePlan("r1", feature, fakeClient(plan));
  };
  await assert.rejects(gate("essencial", { action: "save_coupon" }), { message: "PLAN_REQUIRED" });
  await gate("essencial", { action: "save_product" });
});

test("orders: pendente, bloqueado and cancelado pause them; ativo, atrasado and cortesia never do", () => {
  const payload = { key: "k", coupon_code: null };
  for (const state of ["pendente", "bloqueado", "cancelado"])
    for (const plan of ["essencial", "profissional"])
      assert.equal(p.gateOrder(payload, plan, state).blocked, true, `${plan}/${state}`);
  for (const state of ["ativo", "atrasado", "cortesia"])
    for (const plan of ["essencial", "profissional"])
      assert.equal(p.gateOrder(payload, plan, state).blocked, false, `${plan}/${state}`);
});

test("orders: Essencial drops the coupon (and its expected discount); Profissional keeps it; origin always stays", () => {
  const payload = { key: "k", coupon_code: "BEMVINDO", expected_discount_cents: 500, origin: "instagram", name: "Ana" };
  const essencial = p.gateOrder(payload, "essencial", "ativo");
  assert.equal(essencial.blocked, false);
  assert.equal("coupon_code" in essencial.payload, false);
  assert.equal("expected_discount_cents" in essencial.payload, false);
  assert.equal(essencial.payload.origin, "instagram");
  assert.equal(essencial.payload.name, "Ana");
  assert.equal(payload.coupon_code, "BEMVINDO"); // the input is not mutated
  assert.equal(p.gateOrder(payload, "profissional", "ativo").payload.coupon_code, "BEMVINDO");
  assert.equal(p.gateOrder(payload, "profissional", "cortesia").payload.expected_discount_cents, 500);
  const plain = { key: "k", origin: null };
  assert.equal(p.gateOrder(plain, "essencial", "atrasado").payload, plain);
});

test("every Profissional route calls requirePlan with its feature", () => {
  const routes = {
    "crm/route.ts": ["crm"],
    "crm/campaign/route.ts": ["crm"],
    "crm/[contactId]/route.ts": ["crm"],
    "coupon-stats/route.ts": ["coupons"],
    "lapsed-customers/route.ts": ["lapsed"],
    "origin-report/route.ts": ["origin"],
    "results/route.ts": ["results"],
    "associations/route.ts": ["metrics"],
    "photo-associations/route.ts": ["metrics"],
    "finance/bills/route.ts": ["finance"],
    "finance/cash/route.ts": ["finance"],
    "finance/fees/route.ts": ["finance"],
    "finance/month/route.ts": ["finance"],
  };
  for (const [file, features] of Object.entries(routes)) {
    const source = read(`${API}/${file}`);
    for (const feature of features) assert.ok(source.includes(`requirePlan(id, "${feature}", supabase)`), `${file} -> ${feature}`);
  }
  // crm contact: GET and the "save" action are gated, the LGPD erase is deliberately not
  const contact = read(`${API}/crm/[contactId]/route.ts`);
  assert.equal(contact.match(/requirePlan\(/g).length, 2);
  assert.ok(contact.lastIndexOf("requirePlan(") < contact.indexOf("crm_erase_customer"));
  // the catalog route applies the action map right after validating the body
  const catalog = read(`${API}/catalog/route.ts`);
  assert.ok(catalog.indexOf("catalogActionFeature(body, storedOffer)") > catalog.indexOf("schema.parse"));
  assert.ok(catalog.indexOf("requirePlan(id, feature, supabase)") < catalog.indexOf('body.action === "feedback_settings"'));
});

test("public side: coupon preview, orders and catalog follow the plan", () => {
  const coupon = read(`${API}/coupon/route.ts`);
  assert.match(coupon, /allows\(await restaurantPlan\(id, service\), "coupons"\)[\s\S]*COUPON_INVALID/);
  assert.ok(coupon.indexOf('"coupons"') < coupon.indexOf('rpc("check_coupon"'));
  const orders = read(`${API}/orders/route.ts`);
  assert.ok(orders.includes("gateOrder(payload, plan, state)"));
  assert.ok(orders.indexOf("gateOrder(") < orders.indexOf('rpc("place_guest_order"'));
  assert.ok(orders.includes('"CLOSED"'));
  assert.ok(read("src/lib/catalog.ts").includes('"restaurant_plan"'));
});

test("workspace: staff only get billing_state; the owner also gets plan and a billing summary without Asaas ids", () => {
  const source = read(`${API}/workspace/route.ts`);
  assert.match(source, /role === "owner" \? \{ plan, billing \} : \{\}/);
  const columns = source.match(/\.from\("restaurant_billing"\)\s*\.select\(\s*"([^"]+)"\s*\)/)[1].split(",");
  assert.deepEqual(columns, ["plan", "cycle", "status", "founder", "price_cents", "current_period_end", "overdue_since", "cancel_at", "pending_plan", "pending_cycle"]);
  assert.equal(/asaas/i.test(columns.join()), false);
});

test("save_option reads the stored flag and only a false -> true change needs upsell", () => {
  const route = read(`${API}/catalog/route.ts`);
  assert.match(route, /body\.action === "save_option" && body\.offer_in_bag === true/);
  assert.ok(route.includes("catalogActionFeature(body, storedOffer)"));
  assert.ok(route.includes('.select("offer_in_bag")'));
  assert.ok(route.indexOf("storedOffer = ") < route.indexOf("catalogActionFeature(body, storedOffer)"));
  // menu_theme: Essencial goes through essencialTheme, the body is replaced by the filtered theme
  assert.match(route, /essencialTheme\(body\.theme, stored\.menu_theme\)/);
  assert.ok(route.includes("body.theme = basic.theme"));
});

test("readBilling fails open: a broken or missing billing function never blocks orders or the admin", async () => {
  const missing = { code: "PGRST202", message: "Could not find the function" };
  service = { rpc: async () => ({ data: null, error: missing }) };
  warnings.length = 0;
  let r = await billing.readBilling("r1");
  assert.deepEqual(r, { plan: "profissional", state: "ativo", degraded: true });
  assert.equal(warnings.filter(([e]) => e === "billing.state_unavailable").length, 1);
  const coupon = { coupon_code: "X1Y", expected_discount_cents: 100 };
  assert.equal(p.gateOrder(coupon, r.plan, r.state).blocked, false);
  assert.equal(p.gateOrder(coupon, r.plan, r.state).payload.coupon_code, "X1Y");
  // only one of the two reads fails: the other answer is kept
  service = { rpc: async (fn) => (fn === "restaurant_plan" ? { data: "essencial", error: null } : { data: null, error: missing }) };
  r = await billing.readBilling("r2");
  assert.deepEqual(r, { plan: "essencial", state: "ativo", degraded: true });
  // healthy
  service = { rpc: async (fn) => ({ data: fn === "restaurant_plan" ? "essencial" : "bloqueado", error: null }) };
  warnings.length = 0;
  r = await billing.readBilling("r3");
  assert.deepEqual(r, { plan: "essencial", state: "bloqueado", degraded: false });
  assert.equal(warnings.length, 0);
  // service client not configured
  service = null;
  assert.equal((await billing.readBilling("r4")).state, "ativo");
});

test("orders and workspace read billing through readBilling; the state function is service-role only", () => {
  assert.ok(read(`${API}/orders/route.ts`).includes("await readBilling(id)"));
  assert.ok(read(`${API}/workspace/route.ts`).includes("await readBilling(id, supabase)"));
  assert.ok(read(`${API}/billing/route.ts`).includes("await billingState(id)"));
  const sql = read("supabase/migrations/021_billing.sql");
  assert.match(sql, /revoke all on function public\.restaurant_billing_state\(uuid\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.restaurant_billing_state\(uuid\) to service_role;/);
});

test("catalog: a failed plan read serves profissional and is not cached", async () => {
  const cache = new Map();
  let planAnswer = { data: null, error: { code: "PGRST202" } };
  const builder = (data) => {
    const b = new Proxy({}, {
      get: (_, key) =>
        key === "then" ? (resolve, reject) => Promise.resolve({ data, error: null }).then(resolve, reject)
        : key === "maybeSingle" ? () => Promise.resolve({ data, error: null })
        : () => b,
    });
    return b;
  };
  const client = {
    from: (table) => builder(table === "restaurants" ? { id: "r1", slug: "casa" } : []),
    rpc: async (fn) => (fn === "restaurant_plan" ? planAnswer : { data: true, error: null }),
  };
  const catalogModule = loader({
    "next/cache": { unstable_cache: (fn, key) => async () => { const k = key.join("/"); if (!cache.has(k)) cache.set(k, await fn()); return cache.get(k); } },
    "@supabase/supabase-js": { createClient: () => client },
    "./supabase/server": { isConfigured: () => true },
    "./catalog-cache": { catalogTag: () => "tag" },
    "./observability/logger": { logger: { warn: (e) => warnings.push([e]), error() {} } },
  })("src/lib/catalog.ts");
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  warnings.length = 0;
  const degraded = await catalogModule.readCatalog("casa");
  assert.equal(degraded.plan, "profissional");
  assert.equal(cache.size, 0); // the degraded answer was not stored
  assert.ok(warnings.some(([e]) => e === "billing.state_unavailable"));
  planAnswer = { data: "essencial", error: null };
  assert.equal((await catalogModule.readCatalog("casa")).plan, "essencial");
  assert.equal(cache.size, 1);
});
