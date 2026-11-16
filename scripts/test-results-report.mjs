import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const r = loader()("src/lib/results-report.ts");
// 2026-12-01T02:30Z is still November 30 in São Paulo.
const now = new Date("2026-12-01T02:30:00Z");

test("month options use the restaurant timezone, newest first", () => {
  const options = r.monthOptions(now, "America/Sao_Paulo");
  assert.equal(options.length, 13);
  assert.deepEqual(options[0], { value: "2026-11", label: "novembro de 2026 (até hoje)" });
  assert.deepEqual(options[1], { value: "2026-10", label: "outubro de 2026" });
  assert.deepEqual(options[12], { value: "2025-11", label: "novembro de 2025" });
});

test("only listed months are valid", () => {
  assert.equal(r.isValidMonth("2026-11", now, "America/Sao_Paulo"), true);
  assert.equal(r.isValidMonth("2026-12", now, "America/Sao_Paulo"), false);
  assert.equal(r.isValidMonth("2025-10", now, "America/Sao_Paulo"), false);
  assert.equal(r.isValidMonth("2026-1", now, "America/Sao_Paulo"), false);
});

test("variation against the previous month", () => {
  assert.equal(r.variation(118, 100), "+18%");
  assert.equal(r.variation(95, 100), "-5%");
  assert.equal(r.variation(100, 100), "0%");
  assert.equal(r.variation(50, 0), "—");
});

test("savings text shows the formula", () => {
  assert.equal(r.savingsText(460000, 27, 124200).replace(/ /g, " "), "R$ 4.600,00 × 27% = R$ 1.242,00 que ficaram com você");
  assert.equal(r.savingsText(10000, "12.50", 1250).replace(/ /g, " "), "R$ 100,00 × 12,5% = R$ 12,50 que ficaram com você");
});
