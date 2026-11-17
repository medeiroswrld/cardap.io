import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const l = loader()("src/lib/menu-look.ts");
const P = (categoryId, image, published = true) => ({ categoryId, image, published });

test("category thumb is the first published product with a real photo", () => {
  const products = [
    P("a", "/images/placeholder.svg"),
    P("a", "https://x/1.jpg", false),
    P("a", "https://x/2.jpg"),
    P("a", "https://x/3.jpg"),
    P("b", ""),
  ];
  assert.equal(l.categoryThumb(products, "a"), "https://x/2.jpg");
  assert.equal(l.categoryThumb(products, "b"), null);
  assert.equal(l.categoryThumb(products, "c"), null);
});
