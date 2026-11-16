"use client";
import { Plus } from "lucide-react";
import { useDemo } from "./demo-provider";
import { Button } from "./ui/button";
import { money } from "@/lib/utils";
import { applyCombo, bagSuggestions, comboOffers, suggestionItem } from "@/lib/bag-upsell";
import type { Product } from "@/lib/types";

export function useBagOffers() {
  const { state, update, add, notify } = useDemo();
  const combos = comboOffers(state.bag, state.products);
  const suggestions = bagSuggestions(state.bag, state.products, state.categories, state.settings.bagSuggestions);
  const acceptCombo = (index: number, optionId: string) => {
    try {
      update((s) => {
        const item = s.bag[index];
        const product = s.products.find((p) => p.id === item?.productId);
        const option = product?.addOns?.find((o) => o.id === optionId);
        if (!item || !product || !option) return s;
        return { ...s, bag: applyCombo(s.bag, index, product, option) };
      });
    } catch (err) {
      notify((err as Error).message || "Não foi possível atualizar a sacola. Tente novamente.");
    }
  };
  const addSuggestion = (product: Product) => {
    try {
      add(suggestionItem(product));
    } catch (err) {
      notify((err as Error).message || "Não foi possível adicionar. Tente novamente.");
    }
  };
  return { combos, suggestions, acceptCombo, addSuggestion, hasOffers: combos.length + suggestions.length > 0 };
}

export function BagOffers({ offers }: { offers: ReturnType<typeof useBagOffers> }) {
  if (!offers.hasOffers) return null;
  return (
    <section className="bag-offers" aria-label="Sugestões para o seu pedido">
      {offers.combos.map((offer) => (
        <div className="bag-offer" key={`${offer.index}-${offer.option.id}`}>
          <div>
            <strong>{offer.option.name}</strong>
            <span>
              {/combo/i.test(offer.option.name)
                ? `Transformar ${offer.productName} em combo por +${money(offer.option.price_cents)}?`
                : `Adicionar ao ${offer.productName} por +${money(offer.option.price_cents)}?`}
            </span>
          </div>
          <Button
            variant="outline"
            aria-label={`Adicionar ${offer.option.name} ao ${offer.productName}`}
            onClick={() => offers.acceptCombo(offer.index, offer.option.id)}
          >
            Adicionar
          </Button>
        </div>
      ))}
      {offers.suggestions.length > 0 && (
        <div className="bag-suggestions">
          <h3>Que tal adicionar?</h3>
          {offers.suggestions.map((p) => (
            <div className="bag-suggestion" key={p.id}>
              <img src={p.image || "/images/burger.jpg"} alt="" />
              <span>
                {p.name}
                <small>{money(p.price)}</small>
              </span>
              <button
                type="button"
                className="bag-suggestion-add"
                aria-label={`Adicionar ${p.name}`}
                onClick={() => offers.addSuggestion(p)}
              >
                <Plus size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
