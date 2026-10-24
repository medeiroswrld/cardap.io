"use client";
import { money } from "@/lib/utils";
import { missingForMinimum, orderTotals } from "@/lib/online-order";
import { paymentNames, type PaymentMethod } from "@/lib/order-flow";
import type { FulfillmentDraft, OnlineOptions } from "@/lib/fulfillment-draft";

export function FulfillmentFields({
  options,
  draft,
  onChange,
  subtotal,
}: {
  options: OnlineOptions;
  draft: FulfillmentDraft;
  onChange: (draft: FulfillmentDraft) => void;
  subtotal: number;
}) {
  const set = (patch: Partial<FulfillmentDraft>) => onChange({ ...draft, ...patch });
  const zone = options.zones.find((z) => z.id === draft.zoneId) ?? null;
  const totals = orderTotals(subtotal, draft.fulfillment, zone);
  const missing =
    draft.fulfillment === "entrega" ? missingForMinimum(subtotal, options.minimum) : 0;
  return (
    <div className="form-stack">
      <fieldset className="choice-group">
        <legend>Como você quer receber?</legend>
        {options.pickup && (
          <label className="checkbox-label">
            <input
              type="radio"
              name="fulfillment"
              checked={draft.fulfillment === "retirada"}
              onChange={() => set({ fulfillment: "retirada" })}
            />
            <span>Retirada</span>
          </label>
        )}
        {options.delivery && (
          <label className="checkbox-label">
            <input
              type="radio"
              name="fulfillment"
              checked={draft.fulfillment === "entrega"}
              onChange={() => set({ fulfillment: "entrega" })}
            />
            <span>Entrega</span>
          </label>
        )}
      </fieldset>
      {draft.fulfillment === "entrega" && (
        <>
          <label className="form-label">
            Bairro
            <select
              required
              value={draft.zoneId}
              onChange={(e) => set({ zoneId: e.target.value })}
            >
              {options.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} · {money(z.fee_cents)} · ~{z.estimate_minutes} min
                </option>
              ))}
            </select>
          </label>
          <div className="form-columns">
            <label className="form-label">
              Rua
              <input
                required
                minLength={3}
                maxLength={150}
                autoComplete="address-line1"
                value={draft.street}
                onChange={(e) => set({ street: e.target.value })}
              />
            </label>
            <label className="form-label">
              Número
              <input
                required
                maxLength={20}
                value={draft.number}
                onChange={(e) => set({ number: e.target.value })}
              />
            </label>
          </div>
          <label className="form-label">
            Complemento (opcional)
            <input
              maxLength={80}
              autoComplete="address-line2"
              value={draft.complement}
              onChange={(e) => set({ complement: e.target.value })}
            />
          </label>
          <label className="form-label">
            Ponto de referência (opcional)
            <input
              maxLength={150}
              value={draft.reference}
              onChange={(e) => set({ reference: e.target.value })}
            />
          </label>
        </>
      )}
      <fieldset className="choice-group">
        <legend>
          Pagamento na {draft.fulfillment === "entrega" ? "entrega" : "retirada"}
        </legend>
        {(Object.keys(paymentNames) as PaymentMethod[]).map((method) => (
          <label className="checkbox-label" key={method}>
            <input
              type="radio"
              name="payment"
              checked={draft.payment === method}
              onChange={() => set({ payment: method, changeFor: "" })}
            />
            <span>{paymentNames[method]}</span>
          </label>
        ))}
      </fieldset>
      {draft.payment === "dinheiro" && (
        <label className="form-label">
          Troco para quanto? (opcional)
          <input
            inputMode="decimal"
            placeholder="Ex.: 100"
            value={draft.changeFor}
            onChange={(e) => set({ changeFor: e.target.value })}
          />
        </label>
      )}
      <div className="checkout-summary">
        <div>
          <span>Subtotal</span>
          <strong>{money(totals.subtotal)}</strong>
        </div>
        {draft.fulfillment === "entrega" && (
          <div>
            <span>Taxa de entrega</span>
            <strong>{money(totals.fee)}</strong>
          </div>
        )}
        <div className="total-row">
          <span>Total</span>
          <strong>{money(totals.total)}</strong>
        </div>
      </div>
      {missing > 0 && (
        <p className="notice small" role="status">
          Faltam {money(missing)} para o pedido mínimo da entrega ({money(options.minimum)}).
        </p>
      )}
    </div>
  );
}
