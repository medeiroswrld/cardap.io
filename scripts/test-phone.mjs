import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const { normalizePhone, phoneForOrder, PHONE_MESSAGE } = loader()("src/lib/phone.ts");
const { orderPayload } = loader()("src/lib/order-payload.ts");

test("formats customers type or paste become DDD + number", () => {
  for (const [typed, digits] of [
    ["(15) 99999-9999", "15999999999"],
    ["15999999999", "15999999999"],
    ["+55 15 99999-9999", "15999999999"],
    ["+5515999999999", "15999999999"],
    ["55 (15) 99999-9999", "15999999999"],
    ["015 99999-9999", "15999999999"],
    ["(015) 99999-9999", "15999999999"],
    ["+55 15 3333-4444", "1533334444"],
    ["(55) 99999-9999", "55999999999"],
    ["55 3333-4444", "5533334444"],
  ]) {
    assert.equal(phoneForOrder(typed), digits, typed);
    assert.equal(normalizePhone(typed), digits, typed);
  }
});

test("every accepted phone passes the server order schema", () => {
  const base = {
    key: crypto.randomUUID(), fulfillment: "retirada", payment_method: "pix", change_for_cents: null,
    name: "Ana", marketing_consent: false,
    items: [{ product_id: crypto.randomUUID(), quantity: 1, expected_price: 100, note: "" }],
  };
  for (const typed of ["+55 15 99999-9999", "015 99999-9999", "(55) 99999-9999", "15 3333-4444"])
    assert.ok(orderPayload.safeParse({ ...base, phone: phoneForOrder(typed) }).success, typed);
});

test("a number without DDD or too short gets a clear message", () => {
  for (const typed of ["99999-9999", "3333-4444", "123", ""])
    assert.throws(() => phoneForOrder(typed), { message: PHONE_MESSAGE }, typed);
});
