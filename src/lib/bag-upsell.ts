// Which upsell offers the bag shows. Prices are recalculated here only for
// display; the server validates them again when the order is placed.
import type { BagItem, Category, Product } from "./types";
import { choicePrice, sameBagChoice, type AddOn } from "./product-options";

export type ComboOffer = { index: number; productName: string; option: AddOn };

export function comboOffers(bag: BagItem[], products: Product[]): ComboOffer[] {
  const offers: ComboOffer[] = [];
  bag.forEach((item, index) => {
    const product = products.find((p) => p.id === item.productId);
    if (!product || !product.available || !product.published) return;
    const chosen = new Set((item.addOns || []).map((o) => o.id));
    const option = (product.addOns || [])
      .filter((o) => o.offer_in_bag && !chosen.has(o.id))
      .sort((x, y) => x.name.localeCompare(y.name, "pt-BR"))[0];
    if (option) offers.push({ index, productName: product.name, option });
  });
  return offers;
}

export function applyCombo(bag: BagItem[], index: number, product: Product, option: AddOn): BagItem[] {
  const item = bag[index];
  if (!item) return bag;
  const next: BagItem = { ...item, addOns: [...(item.addOns || []), option] };
  next.price = choicePrice(product, next);
  const others = bag.filter((_, i) => i !== index);
  const same = others.findIndex((b) => sameBagChoice(b, next));
  if (same >= 0)
    return others.map((b, i) =>
      i === same ? { ...b, quantity: Math.min(20, b.quantity + next.quantity) } : b,
    );
  return bag.map((b, i) => (i === index ? next : b));
}

export function bagSuggestions(
  bag: BagItem[],
  products: Product[],
  categories: Category[],
  ids: string[] = [],
): Product[] {
  const inBag = new Set(bag.map((b) => b.productId));
  const visible = new Set(categories.filter((c) => c.visible).map((c) => c.id));
  return ids
    .map((id) => products.find((p) => p.id === id))
    .filter(
      (p): p is Product =>
        !!p && !inBag.has(p.id) && p.available && p.published && visible.has(p.categoryId),
    )
    .slice(0, 3);
}

export function suggestionItem(product: Product): BagItem {
  return { productId: product.id, quantity: 1, note: "", price: product.price, removedIngredients: [], addOns: [] };
}
