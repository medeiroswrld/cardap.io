import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const load = loader();
const c = load("src/lib/coupons.ts");
const o = load("src/lib/origins.ts");
const { orderPayload } = loader()("src/lib/order-payload.ts");
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
test("win-back message with empty name and special characters", () => {
  assert.equal(c.winBackMessage("{nome}, volta!", { nome: "  ", restaurante: "X", link: "l" }), "Volta!");
  assert.equal(c.winBackMessage("Oi {nome}! Vem.", { nome: "", restaurante: "X", link: "l" }), "Oi! Vem.");
  assert.equal(
    c.winBackMessage("{restaurante}: {link}", { nome: "A", restaurante: "Pizza $& Cia $1", link: "https://x/?a=$&" }),
    "Pizza $& Cia $1: https://x/?a=$&",
  );
});
test("win-back message only capitalizes when the template starts with the name", () => {
  const v = { nome: "", restaurante: "pizzaria do Zé", link: "https://x/y" };
  assert.equal(c.winBackMessage("{restaurante} sente sua falta: {link}", v), "pizzaria do Zé sente sua falta: https://x/y");
  assert.equal(c.winBackMessage("{link} te espera", v), "https://x/y te espera");
  assert.equal(c.winBackMessage("{nome} volta!", { ...v, nome: "ana" }), "Ana volta!");
});
test("parseMoneyInput", () => {
  const ok = {
    "5": 500, "5,5": 550, "5,50": 550, "1234,56": 123456, "1.234,56": 123456, "5.00": 500, "2.5": 250,
    "1.000": 100000, "1.000,50": 100050, "0,01": 1, " 7 ": 700, "1.000.000": 100000000,
  };
  for (const [k, v] of Object.entries(ok)) assert.equal(c.parseMoneyInput(k), v, k);
  const bad = ["", "  ", "abc", "-1", "5,", ",5", "1,2,3", "5,555", "1.23.4", "1.2345", "12.3456", "1..000", "R$ 5", "1,000.50", "1e3"];
  for (const b of bad) assert.equal(c.parseMoneyInput(b), null, b);
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

const baseOrder = {
  key: "50000000-0000-4000-8000-000000000001",
  name: "Ana",
  phone: "11988887777",
  marketing_consent: false,
  items: [{ product_id: "40000000-0000-4000-8000-000000000001", quantity: 1, expected_price: 2500, note: "" }],
  fulfillment: "retirada",
  payment_method: "pix",
};
test("sanitizeOrigin keeps only clean slugs", () => {
  assert.equal(o.sanitizeOrigin("Instagram"), "instagram");
  assert.equal(o.sanitizeOrigin("  ifood "), "ifood");
  assert.equal(o.sanitizeOrigin("a"), null);
  assert.equal(o.sanitizeOrigin("x".repeat(31)), null);
  assert.equal(o.sanitizeOrigin("rua do <b>"), null);
  assert.equal(o.sanitizeOrigin("panfleto_2"), null);
  assert.equal(o.sanitizeOrigin(null), null);
});
test("cleanCouponCode normalizes or drops", () => {
  assert.equal(c.cleanCouponCode(" bem10 "), "BEM10");
  assert.equal(c.cleanCouponCode("ab"), null);
  assert.equal(c.cleanCouponCode("bem 10!"), null);
});
test("order schema: malformed origin becomes null, never breaks the order", () => {
  const r = orderPayload.safeParse({ ...baseOrder, origin: "Não é slug!!" });
  assert.equal(r.success, true);
  assert.equal(r.data.origin, null);
  assert.equal(orderPayload.parse({ ...baseOrder, origin: "instagram" }).origin, "instagram");
  assert.equal(orderPayload.parse(baseOrder).origin, undefined);
});
test("order schema: coupon code is normalized, discount required with it", () => {
  const ok = orderPayload.parse({ ...baseOrder, coupon_code: " bem10 ", expected_discount_cents: 250 });
  assert.equal(ok.coupon_code, "BEM10");
  assert.equal(orderPayload.safeParse({ ...baseOrder, coupon_code: "bem10" }).success, false);
});

test("coupon error codes: only invalid/expired drop the code, price and coupon errors refresh", () => {
  assert.equal(c.dropsCoupon("COUPON_INVALID"), true);
  assert.equal(c.dropsCoupon("COUPON_EXPIRED"), true);
  for (const code of [undefined, "RATE_LIMITED", "COUPON_MIN_ORDER", "PRICE_CHANGED"])
    assert.equal(c.dropsCoupon(code), false);
  for (const code of ["PRICE_CHANGED", "COUPON_INVALID", "COUPON_EXPIRED", "COUPON_MIN_ORDER", "COUPON_EXCEEDS_TOTAL"])
    assert.equal(c.isCouponRefreshCode(code), true);
  for (const code of [undefined, "", "CLOSED", "UNAVAILABLE", "RATE_LIMITED"])
    assert.equal(c.isCouponRefreshCode(code), false);
});

test("request errors carry the API code, so rewritten texts cannot hide it", async () => {
  const api = loader()("src/lib/client-api.ts");
  const e = new api.ApiRequestError("texto qualquer", 409, undefined, "PRICE_CHANGED");
  assert.equal(api.apiErrorCode(e), "PRICE_CHANGED");
  assert.equal(api.apiErrorCode(new Error("x")), undefined);
  assert.equal(api.apiErrorCode(new api.ApiRequestError("x", 500)), undefined);
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "PRICE_CHANGED" }), { status: 409, headers: { "content-type": "application/json" } });
  await assert.rejects(api.requestJson("/x", {}), (err) => api.apiErrorCode(err) === "PRICE_CHANGED");
});
