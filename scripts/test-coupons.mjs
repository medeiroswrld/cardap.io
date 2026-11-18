import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const load = loader();
const c = load("src/lib/coupons.ts");
const o = load("src/lib/origins.ts");
const pct = { code: "BEMVINDO", kind: "percent", value: 10, min_order_cents: 0, valid_until: null };
const fixed = { code: "CINCO", kind: "fixed", value: 500, min_order_cents: 2000, valid_until: null };

test("discount matches the SQL rule", () => {
  assert.equal(c.discountFor(pct, 4590), 459);
  assert.equal(c.discountFor(pct, 999), 99); // floor
  assert.equal(c.discountFor(fixed, 300), 300);
  assert.equal(c.discountFor(fixed, 4000), 500);
});
test("exceedsTotal mirrors COUPON_EXCEEDS_TOTAL", () => {
  assert.equal(c.exceedsTotal(fixed, 500, 0), true);
  assert.equal(c.exceedsTotal(fixed, 500, 300), false);
  assert.equal(c.exceedsTotal(fixed, 400, 0), true);
  assert.equal(c.exceedsTotal(fixed, 501, 0), false);
  assert.equal(c.exceedsTotal(pct, 4590, 0), false);
});
test("normalizeCode trims and uppercases", () => {
  assert.equal(c.normalizeCode("  bem10 "), "BEM10");
});
test("coupon error texts", () => {
  assert.equal(c.couponError("COUPON_INVALID"), "Cupom não encontrado.");
  assert.equal(c.couponError("COUPON_EXPIRED"), "Este cupom expirou.");
  assert.match(c.couponError("COUPON_MIN_ORDER", 2500), /^Este cupom vale para pedidos a partir de R\$\s25,00\.$/);
  assert.equal(
    c.couponError("COUPON_EXCEEDS_TOTAL"),
    "O desconto não pode ser maior que o pedido. Adicione mais itens.",
  );
});
test("coupon link", () => {
  assert.equal(c.couponLink("pizzaria", "BEM10"), "https://fomeplay.com.br/r/pizzaria?cupom=BEM10");
});
test("win-back message uses first name only and replaces every placeholder", () => {
  const text = c.winBackMessage("Oi {nome}! Faz tempo no {restaurante}: {link} {nome}", {
    nome: "  Maria da Silva ",
    restaurante: "Pizzaria",
    link: "https://x/y",
  });
  assert.equal(text, "Oi Maria! Faz tempo no Pizzaria: https://x/y Maria");
});
test("wa.me link keeps digits only and encodes the text", () => {
  assert.equal(c.whatsappUrl("(15) 99999-1234", "Oi, tudo bem?"), "https://wa.me/5515999991234?text=Oi%2C%20tudo%20bem%3F");
});
test("origin labels", () => {
  const custom = [{ slug: "panfleto", name: "Panfleto" }];
  assert.equal(o.originLabel("mesa", custom), "Mesa");
  assert.equal(o.originLabel(null, custom), "Direto");
  assert.equal(o.originLabel("direto", custom), "Direto");
  assert.equal(o.originLabel("ifood", custom), "Embalagem do iFood");
  assert.equal(o.originLabel("instagram", custom), "Instagram");
  assert.equal(o.originLabel("panfleto", custom), "Panfleto");
  assert.equal(o.originLabel("sumiu", custom), "Origem apagada");
});
test("origin link", () => {
  assert.equal(o.originLink("pizzaria", "panfleto"), "https://fomeplay.com.br/r/pizzaria?origem=panfleto");
});
