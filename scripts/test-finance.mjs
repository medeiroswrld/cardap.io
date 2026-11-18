import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const f = loader()("src/lib/finance.ts");
const norm = (s) => s.replace(/ /g, " ");

test("expense categories and method labels", () => {
  assert.deepEqual(f.EXPENSE_CATEGORIES.map((c) => c.key), ["insumos", "embalagens", "funcionarios", "aluguel", "contas", "marketing", "impostos", "outros"]);
  assert.equal(f.METHOD_LABELS.mesa, "Mesa (pago no local)");
  assert.equal(f.METHOD_LABELS.cartao, "Cartão");
});

test("cash summary text lists present methods in order", () => {
  const day = {
    day: "2026-11-18",
    methods: [
      { method: "pix", orders: 2, total_cents: 41000 },
      { method: "dinheiro", orders: 3, total_cents: 32000 },
      { method: "mesa", orders: 1, total_cents: 18000 },
      { method: "cartao", orders: 5, total_cents: 124000 },
    ],
    other_income_cents: 60000,
    net_cents: 271240,
  };
  assert.equal(
    norm(f.cashSummaryText(day, "")),
    "Caixa 18/11 — Dinheiro R$ 320,00 · Cartão R$ 1.240,00 · Pix R$ 410,00 · Mesa R$ 180,00 · Outras R$ 600,00 · Líquido R$ 2.712,40",
  );
  const small = { day: "2026-11-02", methods: [{ method: "pix", orders: 1, total_cents: 1000 }], other_income_cents: 0, net_cents: 1000 };
  assert.equal(norm(f.cashSummaryText(small, "Bar do Zé")), "Bar do Zé · Caixa 02/11 — Pix R$ 10,00 · Líquido R$ 10,00");
});

test("due labels", () => {
  const t = "2026-11-18";
  assert.deepEqual(f.dueLabel("2026-11-10", t), { text: "Venceu há 8 dias", tone: "danger" });
  assert.deepEqual(f.dueLabel("2026-11-17", t), { text: "Venceu ontem", tone: "danger" });
  assert.deepEqual(f.dueLabel("2026-11-18", t), { text: "Vence hoje", tone: "warning" });
  assert.deepEqual(f.dueLabel("2026-11-19", t), { text: "Vence amanhã", tone: "warning" });
  assert.deepEqual(f.dueLabel("2026-11-25", t), { text: "Vence em 7 dias", tone: "warning" });
  assert.deepEqual(f.dueLabel("2026-11-26", t), { text: "Vence em 8 dias", tone: "neutral" });
  assert.deepEqual(f.dueLabel("2026-12-02", "2026-11-30"), { text: "Vence em 2 dias", tone: "warning" });
});

test("percent change", () => {
  assert.equal(f.percentChange(112, 100), "+12%");
  assert.equal(f.percentChange(95, 100), "−5%");
  assert.equal(f.percentChange(100, 100), "+0%");
  assert.equal(f.percentChange(10, 0), null);
  assert.equal(f.percentChange(10, -5), null);
});

test("finance day validation", () => {
  assert.equal(f.isFinanceDay("2026-11-18"), true);
  assert.equal(f.isFinanceDay("2026-02-30"), false);
  assert.equal(f.isFinanceDay("18/11/2026"), false);
});
