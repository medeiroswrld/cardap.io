import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const p = loader()("src/lib/period.ts");

test("presets count today as one of the days", () => {
  assert.deepEqual(p.presetRange("hoje", "2026-11-23"), { from: "2026-11-23", to: "2026-11-23" });
  assert.deepEqual(p.presetRange("7d", "2026-11-23"), { from: "2026-11-17", to: "2026-11-23" });
  assert.deepEqual(p.presetRange("14d", "2026-11-23"), { from: "2026-11-10", to: "2026-11-23" });
  assert.deepEqual(p.presetRange("30d", "2026-03-01"), { from: "2026-01-31", to: "2026-03-01" });
  assert.deepEqual(p.presetRange("mes", "2026-11-23"), { from: "2026-11-01", to: "2026-11-23" });
});

test("day starts at local midnight in the restaurant timezone", () => {
  assert.equal(p.dayStart("2026-11-23", "America/Sao_Paulo"), "2026-11-23T03:00:00.000Z");
  assert.equal(p.dayStart("2026-11-23", "UTC"), "2026-11-23T00:00:00.000Z");
  assert.equal(p.dayStart("2026-07-01", "Europe/Lisbon"), "2026-06-30T23:00:00.000Z");
});

test("today follows the timezone, not UTC", () => {
  const lateNight = new Date("2026-11-24T01:30:00Z");
  assert.equal(p.todayIn("America/Sao_Paulo", lateNight), "2026-11-23");
});

test("range problems", () => {
  const today = "2026-11-23";
  assert.equal(p.rangeProblem("2026-11-01", "2026-11-23", today), "");
  assert.match(p.rangeProblem("", "2026-11-23", today), /data inicial/);
  assert.match(p.rangeProblem("2026-02-30", "2026-03-01", today), /data inicial/);
  assert.match(p.rangeProblem("2026-11-20", "2026-11-10", today), /antes da final/);
  assert.match(p.rangeProblem("2026-11-20", "2026-11-24", today), /depois de hoje/);
  assert.match(p.rangeProblem("2024-11-01", "2026-11-23", today), /1 ano/);
});

test("summary adds revenue, splits by type and ranks dishes", () => {
  const orders = [
    { total_cents: 5000, fulfillment: "entrega", order_items: [{ product_id: "a", product_name: "X-Bacon", quantity: 2, unit_price_cents: 2000 }] },
    { total_cents: 3000, fulfillment: "retirada", order_items: [{ product_id: "b", product_name: "Coca", quantity: 3, unit_price_cents: 700 }, { product_id: null, product_name: "Removido", quantity: 9, unit_price_cents: 1 }] },
    { total_cents: 1000, fulfillment: "mesa", order_items: [{ product_id: "a", product_name: "X-Bacon", quantity: 1, unit_price_cents: 2000 }] },
  ];
  const s = p.summarizePeriod("2026-11-17", "2026-11-23", orders, true);
  assert.equal(s.count, 3);
  assert.equal(s.revenue_cents, 9000);
  assert.equal(s.average_cents, 3000);
  assert.deepEqual(s.by_fulfillment.entrega, { count: 1, revenue_cents: 5000 });
  assert.deepEqual(s.dishes.map((d) => [d.product_id, d.quantity]), [["a", 3], ["b", 3]]);
  assert.deepEqual(p.summarizePeriod("2026-11-17", "2026-11-23", orders, false).dishes, []);
  assert.equal(p.summarizePeriod("2026-11-17", "2026-11-23", [], true).average_cents, 0);
});
