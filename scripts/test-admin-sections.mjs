import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const s = loader()("src/lib/admin-sections.ts");
const ALL = ["resumo", "pedidos", "produtos", "opcionais", "categorias", "qr", "contatos", "avaliacoes", "cupons", "reconquistar", "resultados", "metricas", "origem", "caixa", "mes", "contas", "configuracoes"];

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
