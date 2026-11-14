import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const up = loader()("src/lib/bag-upsell.ts");

const combo = { id: "c", name: "Combo batata + refri", price_cents: 790, offer_in_bag: true };
const cheese = { id: "q", name: "Queijo", price_cents: 300 };
const burger = { id: "b", name: "Burger", price: 2500, categoryId: "k", available: true, published: true, removableIngredients: [], addOns: [combo, cheese] };
const fries = { id: "f", name: "Batata", price: 1200, categoryId: "k", available: true, published: true, removableIngredients: [], addOns: [] };
const soda = { id: "s", name: "Refri", price: 700, categoryId: "k", available: false, published: true, removableIngredients: [], addOns: [] };
const cake = { id: "d", name: "Bolo", price: 900, categoryId: "hidden", available: true, published: true, removableIngredients: [], addOns: [] };
const pie = { id: "p", name: "Torta", price: 800, categoryId: "k", available: true, published: true, removableIngredients: [], addOns: [] };
const categories = [{ id: "k", visible: true }, { id: "hidden", visible: false }];
const item = (over = {}) => ({ productId: "b", quantity: 1, note: "", price: 2500, removedIngredients: [], addOns: [], ...over });

test("offers the combo once per item that does not have it", () => {
  const offers = up.comboOffers([item(), item({ addOns: [combo], price: 3290 })], [burger]);
  assert.deepEqual(offers.map((o) => [o.index, o.productName, o.option.id]), [[0, "Burger", "c"]]);
  assert.deepEqual(up.comboOffers([item({ productId: "gone" })], [burger]), []);
});

test("picks the first offered option by name", () => {
  const early = { id: "a", name: "Batata grande", price_cents: 500, offer_in_bag: true };
  const offers = up.comboOffers([item()], [{ ...burger, addOns: [combo, early] }]);
  assert.equal(offers[0].option.id, "a");
});

test("accepting the combo adds the option and recalculates the price", () => {
  const bag = up.applyCombo([item({ quantity: 2 })], 0, burger, combo);
  assert.equal(bag.length, 1);
  assert.equal(bag[0].price, 3290);
  assert.equal(bag[0].quantity, 2);
  assert.deepEqual(bag[0].addOns.map((o) => o.id), ["c"]);
});

test("accepting the combo merges with an identical combo item", () => {
  const bag = up.applyCombo([item(), item({ addOns: [combo], price: 3290, quantity: 2 })], 0, burger, combo);
  assert.equal(bag.length, 1);
  assert.equal(bag[0].quantity, 3);
  assert.equal(bag[0].price, 3290);
});

test("suggestions skip bag items, unavailable, hidden and unknown products, max 3", () => {
  const products = [burger, fries, soda, cake, pie];
  assert.deepEqual(
    up.bagSuggestions([item()], products, categories, ["b", "f", "s", "d", "x", "p"]).map((p) => p.id),
    ["f", "p"],
  );
  assert.deepEqual(up.bagSuggestions([], products, categories, ["f", "p", "b", "x"]).map((p) => p.id), ["f", "p", "b"]);
  assert.deepEqual(up.bagSuggestions([], products, categories), []);
});

test("a suggestion enters the bag with the default choice", () => {
  assert.deepEqual(up.suggestionItem(fries), { productId: "f", quantity: 1, note: "", price: 1200, removedIngredients: [], addOns: [] });
});
