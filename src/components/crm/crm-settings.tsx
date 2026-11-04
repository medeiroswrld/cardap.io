"use client";
import { useState } from "react";
import { Button } from "../ui/button";
import { DEFAULT_CRM_SETTINGS, parseCrmSettings, settingsFromRestaurant, type CrmSettings as Settings } from "@/lib/crm";
import type { Workspace } from "@/lib/connected-types";

type Save = (body: unknown) => Promise<void>;
type Raw = Record<Exclude<keyof Settings, "vip_min_spent_cents"> | "vip_min_spent", string>;
const fields: [Exclude<keyof Settings, "vip_min_spent_cents">, string, number, number][] = [
  ["recurring_min_orders", "Recorrente: mínimo de pedidos", 2, 50],
  ["recurring_days", "Recorrente: dentro de quantos dias", 7, 365],
  ["vip_min_orders", "VIP: mínimo de pedidos", 2, 100],
  ["vip_days", "VIP: dentro de quantos dias", 7, 365],
  ["lapsed_days", "Sumido: dias sem pedir", 7, 365],
];

function toRaw(s: Settings): Raw {
  return {
    recurring_min_orders: String(s.recurring_min_orders),
    recurring_days: String(s.recurring_days),
    vip_min_orders: String(s.vip_min_orders),
    vip_days: String(s.vip_days),
    lapsed_days: String(s.lapsed_days),
    vip_min_spent: String(s.vip_min_spent_cents / 100),
  };
}

export function CrmSettings({ data, save, busy }: { data: Workspace; save: Save; busy: boolean }) {
  const [values, setValues] = useState<Raw>(() => toRaw(settingsFromRestaurant(data.restaurant)));
  const [errors, setErrors] = useState<string[]>([]);
  const [error, setError] = useState("");
  return (
    <form
      noValidate
      className="admin-panel connected-panel form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        const parsed = parseCrmSettings(values);
        if (!parsed.ok) {
          setErrors(parsed.errors);
          return;
        }
        setErrors([]);
        try {
          await save({ action: "crm_settings", ...parsed.values });
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
            {label} ({min} a {max})
            <input
              type="number"
              inputMode="numeric"
              min={min}
              max={max}
              value={values[key]}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            />
          </label>
        ))}
        <label className="form-label">
          VIP: ou gasto mínimo (R$ 0 a 1.000.000; 0 desliga)
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={1000000}
            step="0.01"
            value={values.vip_min_spent}
            onChange={(e) => setValues({ ...values, vip_min_spent: e.target.value })}
          />
        </label>
      </div>
      {errors.length > 0 && (
        <div role="alert" className="form-error">
          <ul>
            {errors.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="connected-order-actions">
        <Button type="submit" disabled={busy}>
          Salvar regras
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setValues(toRaw(DEFAULT_CRM_SETTINGS));
            setErrors([]);
          }}
        >
          Restaurar padrão
        </Button>
      </div>
    </form>
  );
}
