import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const load = loader();
const s = load("src/lib/admin-sections.ts");
const plans = load("src/lib/plans.ts");
const ALL = ["resumo", "pedidos", "produtos", "opcionais", "categorias", "qr", "contatos", "avaliacoes", "cupons", "reconquistar", "resultados", "metricas", "origem", "caixa", "mes", "contas", "configuracoes", "plano"];

test("every page belongs to exactly one section", () => {
  for (const page of ALL) {
    assert.equal(s.SECTIONS.filter((x) => x.pages.includes(page)).length, 1, page);
  }
  assert.equal(s.SECTIONS.flatMap((x) => x.pages).length, ALL.length);
  assert.deepEqual(s.SECTIONS.map((x) => x.label), ["Visão geral", "Pedidos", "Cardápio", "Clientes", "Relatórios", "Financeiro", "Configurações"]);
});

test("section of a page", () => {
  assert.equal(s.sectionOf("qr"), "cardapio");
  assert.equal(s.sectionOf("avaliacoes"), "clientes");
  assert.equal(s.sectionOf("metricas"), "relatorios");
  assert.equal(s.sectionOf("pedidos"), "pedidos");
  assert.equal(s.sectionOf("cupons"), "clientes");
  assert.equal(s.sectionOf("reconquistar"), "clientes");
  assert.equal(s.sectionOf("origem"), "relatorios");
  for (const p of ["caixa", "mes", "contas"]) assert.equal(s.sectionOf(p), "financeiro");
});

test("staff only see overview and orders", () => {
  assert.deepEqual(s.visibleSections(false).map((x) => x.key), ["resumo", "pedidos"]);
  assert.equal(s.visibleSections(true).length, 7);
  assert.equal(s.pageAllowed("produtos", false), false);
  assert.equal(s.pageAllowed("pedidos", false), true);
  for (const p of ["caixa", "mes", "contas"]) assert.equal(s.pageAllowed(p, false), false, p);
  for (const p of ["cupons", "reconquistar", "origem"]) assert.equal(s.pageAllowed(p, false), false, p);
});

test("Plano e pagamento is an owner-only tab of Configurações", () => {
  assert.equal(s.sectionOf("plano"), "configuracoes");
  assert.deepEqual(s.SECTIONS.find((x) => x.key === "configuracoes").pages, ["configuracoes", "plano"]);
  assert.equal(s.pageAllowed("plano", false), false);
  assert.equal(s.pageAllowed("plano", true), true);
});

test("pages carry their feature: Profissional pages lock on Essencial, the rest never", () => {
  const locked = ["contatos", "avaliacoes", "cupons", "reconquistar", "resultados", "metricas", "origem", "caixa", "mes", "contas"];
  for (const page of ALL) {
    const feature = plans.pageFeature(page);
    if (locked.includes(page)) {
      assert.ok(feature, page);
      assert.equal(plans.allows("essencial", feature), false, page);
      assert.equal(plans.allows("profissional", feature), true, page);
      assert.equal(plans.pagePlan(page), "profissional", page);
    } else {
      assert.equal(feature, null, page);
      assert.equal(plans.pagePlan(page), "essencial", page);
    }
  }
});
