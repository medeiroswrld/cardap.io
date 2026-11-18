"use client";
import { useEffect, useState } from "react";
import { requestJson } from "@/lib/client-api";
import type { PaymentFees } from "@/lib/finance";
import { Button } from "./ui/button";

type Save = (body: unknown) => Promise<void>;

// "2,99" -> 2.99; null when it is not a number from 0 to 15 with up to 2 decimals.
export function parsePercent(value: string): number | null {
  const t = value.trim().replace(",", ".");
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n >= 0 && n <= 15 ? n : null;
}
const show = (n: number) => String(n).replace(".", ",");

export function PaymentFeesSettings({
  restaurantId,
  save,
  busy,
}: {
  restaurantId: string;
  save: Save;
  busy: boolean;
}) {
  const [card, setCard] = useState("");
  const [pix, setPix] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    requestJson<PaymentFees>(`/api/restaurants/${restaurantId}/finance/fees`)
      .then((fees) => {
        if (!active) return;
        setCard(show(Number(fees.card_fee_percent)));
        setPix(show(Number(fees.pix_fee_percent)));
        setLoadFailed(false);
        setError("");
        setReady(true);
      })
      .catch(() => {
        if (!active) return;
        setLoadFailed(true);
        setError("Não foi possível carregar as taxas agora.");
      });
    return () => {
      active = false;
    };
  }, [restaurantId, attempt]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const cardFee = parsePercent(card.trim() === "" ? "0" : card);
    const pixFee = parsePercent(pix.trim() === "" ? "0" : pix);
    if (cardFee === null || pixFee === null) {
      return setError("Informe taxas de 0 a 15%, com até 2 casas, ex.: 2,99.");
    }
    try {
      await save({ action: "save_payment_fees", card_fee_percent: cardFee, pix_fee_percent: pixFee });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form className="admin-panel connected-panel form-stack" onSubmit={(e) => void submit(e)}>
      <h2>Taxas da maquininha</h2>
      <p className="field-help">Usamos só para estimar quanto sobra no caixa. Não muda o preço dos pedidos.</p>
      <label className="form-label">
        Taxa do cartão (%)
        <input inputMode="decimal" value={card} placeholder="0" onChange={(e) => setCard(e.target.value)} />
      </label>
      <label className="form-label">
        Taxa do Pix (%)
        <input inputMode="decimal" value={pix} placeholder="0" onChange={(e) => setPix(e.target.value)} />
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
          {loadFailed && !ready && (
            <>
              {" "}
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setLoadFailed(false);
                  setError("");
                  setAttempt((n) => n + 1);
                }}
              >
                Tentar de novo
              </Button>
            </>
          )}
        </p>
      )}
      <Button type="submit" disabled={busy || !ready}>
        Salvar taxas
      </Button>
    </form>
  );
}
