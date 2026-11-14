import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const pix = loader()("src/lib/pix.ts");

test("matches the Banco Central reference payload", () => {
  assert.equal(
    pix.pixPayload({ key: "123e4567-e12b-12d1-a456-426655440000", name: "Fulano de Tal", city: "BRASILIA", txid: "***" }),
    "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D",
  );
});

test("adds the exact amount and the order txid", () => {
  const code = pix.pixPayload({ key: "chave@casa.com", name: "Capi Burguer", city: "Curitiba", amountCents: 6300, txid: pix.orderTxid(42) });
  assert.ok(code.includes("540563.00"));
  assert.ok(code.includes("0505PED42"));
  assert.equal(code.slice(-4), pix.crc16(code.slice(0, -4)));
});

test("removes accents and cuts name and city to the limits", () => {
  assert.equal(pix.pixText("  São José dos Pinhais ", 15), "Sao Jose dos Pi");
  assert.equal(pix.pixText("Pão & Cia Lanchonete Ltda ME", 25), "Pao  Cia Lanchonete Ltda");
  const code = pix.pixPayload({ key: "k", name: "Açaí", city: "Maringá", amountCents: 100, txid: "PED1" });
  assert.ok(code.includes("5904Acai6007Maringa"));
});

test("receipt link opens WhatsApp with the order and amount", () => {
  const link = pix.pixReceiptLink({ phone: "(41) 99131-4989", number: 42, totalCents: 6300, restaurantName: "Capi Burguer" });
  assert.ok(link.startsWith("https://wa.me/5541991314989?text="));
  const text = decodeURIComponent(link.split("text=")[1]);
  assert.match(text, /Pedido #42 no Capi Burguer/);
  assert.match(text, /R\$\s63,00/);
  assert.equal(pix.pixReceiptLink({ phone: "5541991314989", number: 1, totalCents: 1, restaurantName: "x" }).startsWith("https://wa.me/5541991314989"), true);
  assert.equal(pix.pixReceiptLink({ phone: "123", number: 1, totalCents: 1, restaurantName: "x" }), null);
});
