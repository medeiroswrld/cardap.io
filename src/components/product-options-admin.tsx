"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { Workspace, OptionRow } from "@/lib/connected-types";
import { money } from "@/lib/utils";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";

export function ProductOptionsAdmin({
  data,
  save,
  busy,
}: {
  data: Workspace;
  save: (body: unknown) => Promise<void>;
  busy: boolean;
}) {
  const [edit, setEdit] = useState<
    (OptionRow & { product_ids: string[] }) | null
  >(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  function open(option?: OptionRow) {
    setError("");
    setQuery("");
    setEdit(
      option
        ? {
            ...option,
            product_ids: data.optionLinks
              .filter(
                (l) =>
                  l.option_id === option.id &&
                  data.products.some((p) => p.id === l.product_id),
              )
              .map((l) => l.product_id),
          }
        : {
            id: crypto.randomUUID(),
            name: "",
            restaurant_id: data.restaurant.id,
            price_cents: 0,
            active: true,
            product_ids: [],
          },
    );
  }
  return (
    <>
      <div className="connected-toolbar">
        <p>
          Cadastre adicionais e escolha em quais produtos oferecê-los. O preço é
          por unidade do produto.
        </p>
        <Button onClick={() => open()}>
          <Plus size={17} /> Novo opcional
        </Button>
      </div>
      {!data.options.length && (
        <section className="admin-panel connected-panel">
          <h2>Um toque a mais no pedido.</h2>
          <p>
            Queijo extra, bacon ou molho: crie um opcional e vincule aos
            produtos em que ele pode ser escolhido.
          </p>
        </section>
      )}
      <div className="options-list">
        {data.options.map((option) => {
          const names = data.products
            .filter((p) =>
              data.optionLinks.some(
                (l) => l.option_id === option.id && l.product_id === p.id,
              ),
            )
            .map((p) => p.name);
          return (
            <article className="admin-panel option-card" key={option.id}>
              <div>
                <h2>{option.name}</h2>
                <p>
                  {option.active ? "Ativo" : "Pausado"} ·{" "}
                  {option.price_cents ? money(option.price_cents) : "Grátis"}{" "}
                  por unidade
                </p>
                <p className="field-help">
                  {names.length
                    ? `Usado em: ${names.join(", ")}`
                    : "Nenhum produto vinculado. Ainda não aparece no cardápio."}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => open(option)}
                aria-label={`Editar ${option.name}`}
              >
                Editar opcional
              </Button>
            </article>
          );
        })}
      </div>
      <Modal
        open={!!edit}
        onOpenChange={(open) => {
          if (!open && !busy) setEdit(null);
        }}
        title={
          edit && data.options.some((o) => o.id === edit.id)
            ? "Editar opcional"
            : "Novo opcional"
        }
        description="O cliente escolhe os adicionais antes de colocar o produto na sacola."
      >
        {edit && (
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setError("");
              try {
                await save({
                  action: "save_option",
                  id: edit.id,
                  name: edit.name,
                  price_cents: edit.price_cents,
                  active: edit.active,
                  product_ids: edit.product_ids,
                });
                setEdit(null);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <label className="form-label">
              Nome do opcional
              <input
                required
                minLength={2}
                maxLength={80}
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                placeholder="Ex.: Queijo extra"
              />
            </label>
            <label className="form-label">
              Preço adicional (R$)
              <input
                required
                type="number"
                min="0"
                max="1000"
                step="0.01"
                value={edit.price_cents / 100}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    price_cents: Math.round(Number(e.target.value) * 100),
                  })
                }
              />
            </label>
            <p className="field-help">
              Use 0 para oferecer gratuitamente. Cada opcional pode ser marcado
              uma vez por unidade do produto.
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={edit.active}
                onChange={(e) => setEdit({ ...edit, active: e.target.checked })}
              />
              Ativo no cardápio
            </label>
            <fieldset className="choice-group">
              <legend>Em quais produtos?</legend>
              <p className="field-help">
                {edit.product_ids.length} selecionados. Desmarcar remove apenas
                o vínculo, sem alterar pedidos já recebidos.
              </p>
              <input
                aria-label="Buscar produtos para o opcional"
                placeholder="Buscar produto"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="option-product-list">
                {data.products
                  .filter((p) =>
                    p.name
                      .toLocaleLowerCase("pt-BR")
                      .includes(query.toLocaleLowerCase("pt-BR")),
                  )
                  .map((p) => (
                    <label key={p.id} className="choice-row">
                      <input
                        type="checkbox"
                        checked={edit.product_ids.includes(p.id)}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            product_ids: e.target.checked
                              ? [...edit.product_ids, p.id]
                              : edit.product_ids.filter((id) => id !== p.id),
                          })
                        }
                      />
                      <span>
                        {p.name}
                        {!p.published && <small>Rascunho</small>}
                      </span>
                    </label>
                  ))}
              </div>
              {!data.products.length && (
                <p>Cadastre um produto na aba Produtos para vinculá-lo aqui.</p>
              )}
              {!!data.products.length &&
                !data.products.some((p) =>
                  p.name
                    .toLocaleLowerCase("pt-BR")
                    .includes(query.toLocaleLowerCase("pt-BR")),
                ) && <p>Nenhum produto encontrado.</p>}
            </fieldset>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Salvando…" : "Salvar opcional"}
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}
