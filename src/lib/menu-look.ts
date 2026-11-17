// Small presentation helpers for the customer menu (spec K, phase 2).
const PLACEHOLDER = "/images/placeholder.svg";

export function categoryThumb(
  products: { categoryId: string; image: string; published: boolean }[],
  categoryId: string,
): string | null {
  const hit = products.find((p) => p.published && p.categoryId === categoryId && p.image && p.image !== PLACEHOLDER);
  return hit ? hit.image : null;
}
