import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const crm = loader()("src/lib/crm.ts");

test("first name and {nome} filling", () => {
  assert.equal(crm.firstName("  Ana   Souza "), "Ana");
  assert.equal(crm.firstName(""), "");
  assert.equal(crm.fillCampaignMessage("Oi {nome}, sentimos sua falta!", "Ana Souza"), "Oi Ana, sentimos sua falta!");
  assert.equal(crm.fillCampaignMessage("Oi {NOME}! {nome}", "Bia"), "Oi Bia! Bia");
  assert.equal(crm.fillCampaignMessage("Oi {nome}, tudo bem?", ""), "Oi, tudo bem?");
  assert.equal(crm.fillCampaignMessage("Oi {nome}!", "$& Ana"), "Oi $&!");
  assert.equal(crm.fillCampaignMessage("Oi {nome}!", "$$Bia"), "Oi $$Bia!");
});

test("campaign link targets the Brazilian number with the encoded message", () => {
  const url = new URL(crm.campaignLink("11988887777", "Oi Ana & cia"));
  assert.equal(url.origin + url.pathname, "https://wa.me/5511988887777");
  assert.equal(url.searchParams.get("text"), "Oi Ana & cia");
  const formatted = new URL(crm.campaignLink("(11) 98888-7777", "x"));
  assert.equal(formatted.origin + formatted.pathname, "https://wa.me/5511988887777");
});

test("CSV has BOM, semicolons, Brazilian formats, escaping and formula protection", () => {
  const csv = crm.customersCsv([
    { id: "1", name: "Ana; \"Souza\"", phone: "11988887777", segment: "vip", last_order_at: "2026-11-03T15:00:00Z", spent_cents: 123456 },
    { id: "2", name: "=HYPERLINK(1)", phone: "11977776666", segment: "sem_pedidos", last_order_at: null, spent_cents: 0 },
    { id: "3", name: " =1+1", phone: "11966665555", segment: "novo", last_order_at: "2026-11-03T02:00:00Z", spent_cents: 0 },
  ]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines[0], "nome;whatsapp;segmento;ultimo_pedido;total_gasto");
  assert.equal(lines[1], '"Ana; ""Souza""";11988887777;VIP;03/11/2026;1234,56');
  assert.equal(lines[2], "'=HYPERLINK(1);11977776666;Sem pedidos;;0,00");
  assert.ok(lines[3].startsWith("'"));
  assert.ok(lines[3].includes(";02/11/2026;"));
});

test("default settings and mapping from the restaurant row", () => {
  assert.deepEqual(crm.DEFAULT_CRM_SETTINGS, {
    recurring_min_orders: 2, recurring_days: 60, vip_min_orders: 5, vip_min_spent_cents: 50000, vip_days: 90, lapsed_days: 30,
  });
  assert.equal(crm.settingsFromRestaurant({
    crm_recurring_min_orders: 3, crm_recurring_days: 45, crm_vip_min_orders: 6, crm_vip_min_spent_cents: 0, crm_vip_days: 120, crm_lapsed_days: 20,
  }).vip_days, 120);
  assert.deepEqual(crm.CRM_SEGMENTS, ["novo", "recorrente", "vip", "sumido", "sem_pedidos"]);
});
