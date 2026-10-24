"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import { money } from "@/lib/utils";
import type { DeliveryZone, Workspace } from "@/lib/connected-types";

type Save = (body: unknown) => Promise<void>;

export function DeliverySettings({ data, save, busy }: { data: Workspace; save: Save; busy: boolean }) {
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<DeliveryZone | null>(null);
  const zones = data.zones;
  async function saveZone(zone: DeliveryZone) {
    try {
      setError("");
      await save({
        action: "save_delivery_zone",
        id: zone.id,
        name: zone.name,
        fee_cents: zone.fee_cents,
        estimate_minutes: zone.estimate_minutes,
        active: zone.active,
        position: zone.position,
      });
      setDraft(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <section className="admin-panel connected-panel form-stack">
      <h2>Bairros de entrega</h2>
      <p className="field-help">
        Liste os bairros atendidos com a taxa e o tempo estimado. O cliente escolhe o bairro e informa o endereço.
      </p>
      <ul className="connected-items">
        {zones.map((zone) => (
          <li key={zone.id}>
            <strong>{zone.name}</strong> · {money(zone.fee_cents)} · ~{zone.estimate_minutes} min
            {!zone.active && " · pausado"}{" "}
            <Button
              variant="ghost"
              disabled={busy}
              aria-label={`Editar bairro ${zone.name}`}
              onClick={() => setDraft(zone)}
            >
              Editar
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              aria-label={`${zone.active ? "Pausar" : "Reativar"} bairro ${zone.name}`}
              onClick={() => void saveZone({ ...zone, active: !zone.active })}
            >
              {zone.active ? "Pausar" : "Reativar"}
            </Button>
          </li>
        ))}
      </ul>
      {zones.length === 0 && <p>Nenhum bairro cadastrado. Sem bairros, a entrega não aparece para o cliente.</p>}
      <Button
        variant="outline"
        disabled={busy}
        onClick={() =>
          setDraft({ id: crypto.randomUUID(), name: "", fee_cents: 0, estimate_minutes: 40, active: true, position: zones.length })
        }
      >
        Adicionar bairro
      </Button>
      {draft && (
        <form
          key={draft.id}
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            // The form does not edit "active": keep the current value, which may
            // have been paused/reactivated after this draft was opened.
            const current = zones.find((z) => z.id === draft.id);
            void saveZone({
              ...draft,
              active: current?.active ?? draft.active,
              name: String(form.get("name")).trim(),
              fee_cents: Math.round(Number(String(form.get("fee")).replace(",", ".")) * 100),
              estimate_minutes: Number(form.get("estimate")),
            });
          }}
        >
          <label className="form-label">
            Bairro
            <input name="name" required minLength={2} maxLength={80} defaultValue={draft.name} />
          </label>
          <div className="form-columns">
            <label className="form-label">
              Taxa (R$)
              <input name="fee" type="number" min="0" max="1000" step="0.01" required defaultValue={draft.fee_cents / 100} />
            </label>
            <label className="form-label">
              Tempo estimado (min)
              <input name="estimate" type="number" min={5} max={240} required defaultValue={draft.estimate_minutes} />
            </label>
          </div>
          <div className="connected-toolbar">
            <Button type="submit" disabled={busy}>Salvar bairro</Button>
            <Button variant="outline" disabled={busy} onClick={() => setDraft(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="form-error">{error}</p>}
    </section>
  );
}
