import { test, expect } from "@playwright/test";
import { isRestaurantOpen } from "../src/lib/opening-hours";
test("atendimento respeita fuso, abertura, fechamento e pausa", () => {
  const r = {
    accepting_orders: true,
    timezone: "America/Sao_Paulo",
    opening_hours: [{ day: 1, open: "18:00", close: "23:00" }],
  };
  expect(isRestaurantOpen(r, new Date("2026-10-12T20:59:00Z"))).toBe(false);
  expect(isRestaurantOpen(r, new Date("2026-10-12T21:00:00Z"))).toBe(true);
  expect(isRestaurantOpen(r, new Date("2026-10-13T02:00:00Z"))).toBe(false);
  expect(
    isRestaurantOpen(
      { ...r, accepting_orders: false },
      new Date("2026-10-12T21:00:00Z"),
    ),
  ).toBe(false);
  expect(
    isRestaurantOpen(
      { ...r, opening_hours: [] },
      new Date("2026-10-12T21:00:00Z"),
    ),
  ).toBe(false);
});
