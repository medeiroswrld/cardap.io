"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import { money } from "@/lib/utils";
import type { Workspace } from "@/lib/connected-types";

type Save = (body: unknown) => Promise<void>;

export function BagSuggestionsSettings({ data, save, busy }: { data: Workspace; save: Save; busy: boolean }) {
  const [selected, setSelected] = useState<string[]>(data.restaurant.bag_suggestions ?? []);
  const [error, setError] = useState("");
  const products = data.products.filter((p) => p.published);
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((v) => v !== id) : current.length < 3 ? [...current, id] : current,
    );
  return (
    <section className="admin-panel connected-panel form-stack">
      <h2>Sugestões na sacola</h2>
      <p className="field-help">
        Escolha até 3 produtos para aparecer na sacola como &quot;Que tal adicionar?&quot;.
        Batata, bebida e sobremesa costumam funcionar bem.
      </p>
      <fieldset className="choice-group">
        <legend>{selected.length} de 3 escolhidos</legend>
        {products.map((p) => (
          <label key={p.id} className="choice-row">
            <input
              type="checkbox"
              checked={selected.includes(p.id)}
              disabled={!selected.includes(p.id) && selected.length >= 3}
              onChange={() => toggle(p.id)}
            />
            {p.name} · {money(p.price_cents)}
          </label>
        ))}
      </fieldset>
      <Button
        disabled={busy}
        onClick={async () => {
          try {
            setError("");
            await save({ action: "bag_suggestions", product_ids: selected });
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        Salvar sugestões
      </Button>
      {error && <p role="alert" className="form-error">{error}</p>}
    </section>
  );
}
