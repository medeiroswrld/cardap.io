import type { BagItem, Product } from "./types";

export type AddOn = { id: string; name: string; price_cents: number };

export function sameBagChoice(a: BagItem, b: BagItem) {
  return (
    a.productId === b.productId &&
    a.note === b.note &&
    a.price === b.price &&
    JSON.stringify([...(a.removedIngredients || [])].sort()) ===
      JSON.stringify([...(b.removedIngredients || [])].sort()) &&
    JSON.stringify((a.addOns || []).map((o) => o.id).sort()) ===
      JSON.stringify((b.addOns || []).map((o) => o.id).sort())
  );
}

export function choicePrice(product: Product, item: BagItem) {
  const ids = (item.addOns || []).map((o) => o.id);
  const removed = item.removedIngredients || [];
  if (
    new Set(ids).size !== ids.length ||
    new Set(removed).size !== removed.length ||
    removed.some((name) => !product.removableIngredients?.includes(name))
  )
    throw new Error(
      "Os ingredientes mudaram. Remova o item da sacola e escolha novamente.",
    );
  return ids.reduce((total, id) => {
    const option = product.addOns?.find((o) => o.id === id);
    if (!option)
      throw new Error(
        "Um adicional não está mais disponível. Remova o item e escolha novamente.",
      );
    return total + option.price_cents;
  }, product.price);
}
