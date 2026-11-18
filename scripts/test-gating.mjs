import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loader } from "./lib/ts-loader.mjs";

// Server-side plan gating: the feature map, the catalog action gate, requirePlan/billingState with a
// fake Supabase client, order gating (billing state and coupons) and a source scan that every
// Profissional route really calls requirePlan with the right feature.
const load = loader({
  "./supabase/server": { serviceClient: () => { throw new Error("real client must not be used"); } },
  "./observability/logger": { logger: { warn() {}, error() {} } },
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
  assert.equal(p.catalogActionFeature({ action: "save_option", offer_in_bag: false }), null);
  assert.equal(p.catalogActionFeature({ action: "save_option" }), null);
  assert.equal(p.catalogActionFeature({ action: "options_in_bag_all", offer: true }), "upsell");
  assert.equal(p.catalogActionFeature({ action: "options_in_bag_all", offer: false }), null);
  assert.equal(p.catalogActionFeature({ action: "bag_suggestions", product_ids: ["a"] }), "upsell");
  assert.equal(p.catalogActionFeature({ action: "bag_suggestions", product_ids: [] }), null);
});

test("menu_theme: Essencial may only send logo_url, cover_url and brand", () => {
  const feature = (theme) => p.catalogActionFeature({ action: "menu_theme", theme });
  assert.equal(feature({}), null);
  assert.equal(feature({ logo_url: "https://x/a.png" }), null);
  assert.equal(feature({ logo_url: "u", cover_url: "u", brand: "#aa0000" }), null);
  for (const key of ["preset", "background", "surface", "text", "heading_font", "body_font", "radius", "mode"])
    assert.equal(feature({ brand: "#aa0000", [key]: "x" }), "theme_full", key);
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

test("catalog gate end to end: Essencial menu_theme with extra keys is refused, basic identity passes", async () => {
  const gate = async (plan, body) => {
    const feature = p.catalogActionFeature(body);
    if (feature) await billing.requirePlan("r1", feature, fakeClient(plan));
  };
  await gate("essencial", { action: "menu_theme", theme: { logo_url: "u", cover_url: "u", brand: "#112233" } });
  await assert.rejects(gate("essencial", { action: "menu_theme", theme: { brand: "#112233", radius: "reto" } }), { message: "PLAN_REQUIRED" });
  await gate("profissional", { action: "menu_theme", theme: { brand: "#112233", radius: "reto" } });
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
  assert.ok(catalog.indexOf("catalogActionFeature(body)") > catalog.indexOf("schema.parse"));
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
