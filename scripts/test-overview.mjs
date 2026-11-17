import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const o = loader()("src/lib/overview.ts");

test("recent orders are newest first and limited", () => {
  const list = [
    { id: "a", created_at: "2026-11-17T10:00:00Z" },
    { id: "b", created_at: "2026-11-17T12:00:00Z" },
    { id: "c", created_at: "2026-11-16T09:00:00Z" },
  ];
  assert.deepEqual(o.recentOrders(list, 2).map((x) => x.id), ["b", "a"]);
  assert.equal(list[0].id, "a");
});

test("search ignores case and accents", () => {
  assert.equal(o.matchesQuery("Pão de Açúcar", "acucar"), true);
  assert.equal(o.matchesQuery("Capibacon", "BACON"), true);
  assert.equal(o.matchesQuery("Capibacon", "pizza"), false);
  assert.equal(o.matchesQuery("qualquer", ""), true);
});
