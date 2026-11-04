"use client";
import { useState } from "react";
import { Button } from "../ui/button";
import { DEFAULT_CRM_SETTINGS, settingsFromRestaurant, type CrmSettings as Settings } from "@/lib/crm";
import type { Workspace } from "@/lib/connected-types";

type Save = (body: unknown) => Promise<void>;
const fields: [keyof Settings, string, number, number][] = [
  ["recurring_min_orders", "Recorrente: mínimo de pedidos", 2, 50],
  ["recurring_days", "Recorrente: dentro de quantos dias", 7, 365],
  ["vip_min_orders", "VIP: mínimo de pedidos", 2, 100],
  ["vip_days", "VIP: dentro de quantos dias", 7, 365],
  ["lapsed_days", "Sumido: dias sem pedir", 7, 365],
];

export function CrmSettings({ data, save, busy }: { data: Workspace; save: Save; busy: boolean }) {
  const [values, setValues] = useState<Settings>(() => settingsFromRestaurant(data.restaurant));
  const [error, setError] = useState("");
  return (
    <form
      className="admin-panel connected-panel form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          setError("");
          await save({ action: "crm_settings", ...values });
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <h2>Segmentos de clientes</h2>
      <p className="field-help">
        Ordem: Sem pedidos → Sumido → VIP → Recorrente → Novo. Pedidos recusados e cancelados não contam.
      </p>
      <div className="crm-settings-grid">
        {fields.map(([key, label, min, max]) => (
          <label className="form-label" key={key}>
            {label}
            <input
              type="number"
              min={min}
              max={max}
              required
              value={values[key]}
              onChange={(e) => setValues({ ...values, [key]: Number(e.target.value) })}
            />
          </label>
        ))}
        <label className="form-label">
          VIP: ou gasto mínimo (R$, 0 desliga)
          <input
            type="number"
            min={0}
            max={1000000}
            step="0.01"
            required
            value={values.vip_min_spent_cents / 100}
            onChange={(e) => setValues({ ...values, vip_min_spent_cents: Math.round(Number(e.target.value) * 100) })}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="connected-order-actions">
        <Button type="submit" disabled={busy}>
          Salvar regras
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => setValues(DEFAULT_CRM_SETTINGS)}>
          Restaurar padrão
        </Button>
      </div>
    </form>
  );
}
