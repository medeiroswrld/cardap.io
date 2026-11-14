"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import type { Workspace } from "@/lib/connected-types";

type Save = (body: unknown) => Promise<void>;

export function PixSettings({ data, save, busy }: { data: Workspace; save: Save; busy: boolean }) {
  const [error, setError] = useState("");
  const pix = data.pix;
  async function submit(values: { pix_key: string; merchant_name: string; merchant_city: string }) {
    try {
      setError("");
      await save({ action: "save_pix", ...values });
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <form
      key={pix?.pix_key ?? "sem-pix"}
      className="admin-panel connected-panel form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        void submit({
          pix_key: String(form.get("pix_key")).trim(),
          merchant_name: String(form.get("merchant_name")).trim(),
          merchant_city: String(form.get("merchant_city")).trim(),
        });
      }}
    >
      <h2>Pix pelo cardápio</h2>
      <p className="field-help">
        Com a chave cadastrada, quem escolhe Pix na retirada ou entrega paga na hora pelo QR Code.
        O pedido fica em &quot;Aguardando pagamento&quot; até a equipe clicar em &quot;Pix recebido&quot;.
        O cliente envia o comprovante para o telefone do restaurante no WhatsApp.
      </p>
      <label className="form-label">
        Chave Pix
        <input name="pix_key" required maxLength={77} defaultValue={pix?.pix_key ?? ""} />
      </label>
      <div className="form-columns">
        <label className="form-label">
          Nome do recebedor
          <input name="merchant_name" required maxLength={25} defaultValue={pix?.merchant_name ?? data.restaurant.name.slice(0, 25)} />
        </label>
        <label className="form-label">
          Cidade
          <input name="merchant_city" required maxLength={15} defaultValue={pix?.merchant_city ?? ""} />
        </label>
      </div>
      {!data.restaurant.phone && (
        <p className="notice">Cadastre o telefone do restaurante para o cliente enviar o comprovante no WhatsApp.</p>
      )}
      <div className="connected-toolbar">
        <Button type="submit" disabled={busy}>Salvar Pix</Button>
        {pix && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void submit({ pix_key: "", merchant_name: "", merchant_city: "" })}
          >
            Desligar Pix pelo cardápio
          </Button>
        )}
      </div>
      {error && <p role="alert" className="form-error">{error}</p>}
    </form>
  );
}
