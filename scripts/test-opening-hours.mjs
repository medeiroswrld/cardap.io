import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const hours = loader()("src/lib/opening-hours.ts");
const week = (open, close, days = [0, 1, 2, 3, 4, 5, 6]) => days.map((day) => ({ day, open, close }));
const rest = (over = {}) => ({ accepting_orders: true, timezone: "America/Sao_Paulo", opening_hours: week("18:00", "23:00"), ...over });
// 2026-11-16 is a Monday. 15:00 UTC = 12:00 in São Paulo.
const mondayNoon = new Date("2026-11-16T15:00:00Z");
const mondayNight = new Date("2026-11-17T02:30:00Z"); // 23:30 Monday local

test("open now has no closed message", () => {
  assert.equal(hours.openingMessage(rest(), new Date("2026-11-16T22:00:00Z")), null);
});

test("before opening says it opens today", () => {
  assert.equal(hours.openingMessage(rest(), mondayNoon), "Fechado agora · abre hoje às 18:00");
});

test("after closing says it opens tomorrow", () => {
  assert.equal(hours.openingMessage(rest(), mondayNight), "Fechado agora · abre amanhã às 18:00");
});

test("skips closed days and names the weekday", () => {
  const r = rest({ opening_hours: week("18:00", "23:00", [5, 6]) });
  assert.equal(hours.openingMessage(r, mondayNoon), "Fechado agora · abre sexta às 18:00");
});

test("paused by the owner and no hours have their own messages", () => {
  assert.equal(hours.openingMessage(rest({ accepting_orders: false }), mondayNoon), "Pedidos pausados pelo restaurante no momento.");
  assert.equal(hours.openingMessage(rest({ opening_hours: [] }), mondayNoon), "Fechado agora.");
});

test("weekly hours group days with the same schedule", () => {
  const h = [...week("18:00", "23:00", [1, 2, 3, 4, 5]), ...week("11:00", "23:00", [6, 0])];
  assert.equal(hours.weeklyHours(h), "Seg a Sex 18:00–23:00 · Sáb e Dom 11:00–23:00");
  assert.equal(hours.weeklyHours(week("18:00", "23:59:59", [3])), "Qua 18:00–23:59");
  assert.equal(hours.weeklyHours([]), "");
});
