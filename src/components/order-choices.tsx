import type { AddOn } from "@/lib/product-options";
import { money } from "@/lib/utils";

export function OrderChoices({
  removed = [],
  additions = [],
}: {
  removed?: string[];
  additions?: AddOn[];
}) {
  if (!removed.length && !additions.length) return null;
  return (
    <span className="order-choices">
      {removed.length > 0 && <small>Sem: {removed.join(", ")}</small>}
      {additions.length > 0 && (
        <small>
          Adicionais:{" "}
          {additions
            .map(
              (o) =>
                `${o.name} (${o.price_cents ? "+ " + money(o.price_cents) : "grátis"})`,
            )
            .join(", ")}{" "}
          · por unidade
        </small>
      )}
    </span>
  );
}
