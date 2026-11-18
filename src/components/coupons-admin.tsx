"use client";
import { useEffect, useState } from "react";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { apiErrorMessages, requestJson } from "@/lib/client-api";
import { money } from "@/lib/utils";
import { couponLink, normalizeCode, parseMoneyInput, type CouponRow, type CouponStats } from "@/lib/coupons";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";

type Save = (body: unknown) => Promise<void>;

// "2026-12-05" -> "05/12"
export function shortDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
export function todayIn(timeZone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function couponExpired(c: { valid_until: string | null }, today: string) {
  return !!c.valid_until && c.valid_until < today;
}
function valueText(c: CouponRow) {
  return c.kind === "percent" ? `${c.value}%` : money(c.value);
}
const MONEY_INVALID = "Valor inválido. Use vírgula, ex.: 5,00";
// Never show a raw server code: map known codes, fall back to a generic text.
export function formMessage(message: string, invalid = "Confira os campos do cupom.") {
  if (!/^[A-Z][A-Z0-9_]+$/.test(message)) return message;
  if (message === "INVALID_INPUT") return invalid;
  return Object.hasOwn(apiErrorMessages, message)
    ? apiErrorMessages[message]
    : "Não foi possível concluir. Tente novamente.";
}
function reaisText(cents: number) {
  return cents ? (cents / 100).toFixed(2).replace(".", ",") : "";
}

export function CouponsAdmin({
  restaurantId,
  slug,
  timezone,
  coupons,
  save,
  busy,
}: {
  restaurantId: string;
  slug: string;
  timezone: string;
  coupons: CouponRow[];
  save: Save;
  busy: boolean;
}) {
  const [stats, setStats] = useState<CouponStats>({});
  const [editing, setEditing] = useState<CouponRow | "new" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [statsError, setStatsError] = useState(false);
  const today = todayIn(timezone);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 3000);
    return () => clearTimeout(t);
  }, [message]);

  const codesKey = coupons.map((c) => c.code).sort().join(",");
  useEffect(() => {
    let active = true;
    requestJson<CouponStats>(`/api/restaurants/${restaurantId}/coupon-stats`)
      .then((s) => {
        if (!active) return;
        setStats(s);
        setStatsError(false);
      })
      .catch(() => {
        if (active) setStatsError(true);
      });
    return () => {
      active = false;
    };
  }, [restaurantId, codesKey]);

  async function copy(c: CouponRow) {
    setMessage("");
    try {
      await navigator.clipboard.writeText(couponLink(slug, c.code));
      setMessage(`Link do cupom ${c.code} copiado.`);
    } catch {
      setMessage("Não foi possível copiar. Tente de novo.");
    }
  }
  async function toggle(c: CouponRow) {
    setError("");
    try {
      await save({
        action: "save_coupon",
        id: c.id,
        code: c.code,
        kind: c.kind,
        value: c.value,
        min_order_cents: c.min_order_cents,
        valid_until: c.valid_until,
        active: !c.active,
      });
    } catch (err) {
      setError(formMessage((err as Error).message));
    }
  }
  async function remove(c: CouponRow) {
    if (!window.confirm(`Apagar o cupom ${c.code}?`)) return;
    setError("");
    try {
      await save({ action: "delete_coupon", id: c.id });
    } catch (err) {
      setError(formMessage((err as Error).message));
    }
  }

  return (
    <section className="admin-panel connected-panel form-stack" aria-labelledby="coupons-title">
      <div className="connected-toolbar">
        <div>
          <h2 id="coupons-title">Cupons de desconto</h2>
          <p className="field-help">O cliente aplica o código na finalização ou entra pelo link do cupom.</p>
        </div>
        <Button
          onClick={() => {
            setMessage("");
            setEditing("new");
          }}
        >
          <Plus size={17} /> Novo cupom
        </Button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {statsError && (
        <p role="status" className="field-help">
          Não foi possível carregar o uso dos cupons.
        </p>
      )}
      {message && (
        <p role="status" className="field-help">
          {message}
        </p>
      )}
      {coupons.length === 0 ? (
        <p className="notice small">Nenhum cupom ainda. Crie o primeiro para trazer clientes de volta.</p>
      ) : (
        <ul className="coupon-list">
          {coupons.map((c) => {
            const st = stats[c.code];
            const expired = couponExpired(c, today);
            const uses = st?.uses ?? 0;
            return (
              <li key={c.id} className="admin-coupon-item">
                <div className="coupon-main">
                  <strong className="coupon-code">{c.code}</strong>
                  <span className="coupon-value">{valueText(c)}</span>
                  <span className={`status-pill ${c.active && !expired ? "tone-success" : "tone-neutral"}`}>
                    {expired ? "Vencido" : c.active ? "Ativo" : "Pausado"}
                  </span>
                </div>
                <p className="field-help">
                  {c.min_order_cents > 0 ? `Pedido mínimo ${money(c.min_order_cents)}` : "Sem pedido mínimo"} ·{" "}
                  {c.valid_until ? `até ${shortDate(c.valid_until)}` : "Sem validade"}
                </p>
                <p className="field-help">
                  Usado {uses} {uses === 1 ? "vez" : "vezes"} · {money(st?.discount_cents ?? 0)} de desconto
                </p>
                <div className="coupon-actions">
                  <Button variant="outline" size="sm" onClick={() => void copy(c)}>
                    <Copy size={15} /> Copiar link
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMessage("");
                      setEditing(c);
                    }}
                  >
                    <Pencil size={15} /> Editar
                  </Button>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void toggle(c)}>
                    {c.active ? "Pausar" : "Ativar"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void remove(c)}
                    aria-label={`Apagar cupom ${c.code}`}
                  >
                    <Trash2 size={15} /> Apagar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {editing && (
        <CouponForm
          key={editing === "new" ? "new" : editing.id}
          coupon={editing === "new" ? null : editing}
          save={save}
          busy={busy}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function CouponForm({
  coupon,
  save,
  busy,
  onClose,
}: {
  coupon: CouponRow | null;
  save: Save;
  busy: boolean;
  onClose: () => void;
}) {
  const [code, setCode] = useState(coupon?.code ?? "");
  const [kind, setKind] = useState<"percent" | "fixed">(coupon?.kind ?? "percent");
  const [value, setValue] = useState(
    coupon ? (coupon.kind === "percent" ? String(coupon.value) : reaisText(coupon.value)) : "",
  );
  const [min, setMin] = useState(reaisText(coupon?.min_order_cents ?? 0));
  const [until, setUntil] = useState(coupon?.valid_until ?? "");
  const [active, setActive] = useState(coupon?.active ?? true);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const clean = normalizeCode(code);
    if (!/^[A-Z0-9]{3,20}$/.test(clean)) return setError("Use de 3 a 20 letras ou números, sem espaços.");
    let amount: number;
    if (kind === "percent") {
      amount = Number(value);
      if (!Number.isInteger(amount) || amount < 1 || amount > 90) return setError("O desconto deve ser de 1% a 90%.");
    } else {
      const cents = parseMoneyInput(value);
      if (cents === null) return setError(MONEY_INVALID);
      if (cents < 1 || cents > 50000) return setError("O desconto deve ser de R$ 0,01 a R$ 500,00.");
      amount = cents;
    }
    let minCents = 0;
    if (min.trim()) {
      const m = parseMoneyInput(min);
      if (m === null) return setError(MONEY_INVALID);
      if (m < 0 || m > 100000) return setError("O pedido mínimo vai até R$ 1.000,00.");
      minCents = m;
    }
    try {
      await save({
        action: "save_coupon",
        id: coupon?.id ?? null,
        code: clean,
        kind,
        value: amount,
        min_order_cents: minCents,
        valid_until: until || null,
        active,
      });
      onClose();
    } catch (err) {
      setError(formMessage((err as Error).message));
    }
  }

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={coupon ? "Editar cupom" : "Novo cupom"}>
      <form className="form-stack" onSubmit={(e) => void submit(e)}>
        <label className="form-label">
          Código
          <input
            value={code}
            maxLength={20}
            autoCapitalize="characters"
            placeholder="VOLTA10"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <span className="field-help">De 3 a 20 letras ou números.</span>
        </label>
        <div className="form-label" role="group" aria-label="Tipo de desconto">
          Tipo de desconto
          <div className="segmented-control">
            <button
              type="button"
              className={kind === "percent" ? "active" : ""}
              aria-pressed={kind === "percent"}
              onClick={() => setKind("percent")}
            >
              Porcentagem (%)
            </button>
            <button
              type="button"
              className={kind === "fixed" ? "active" : ""}
              aria-pressed={kind === "fixed"}
              onClick={() => setKind("fixed")}
            >
              Valor fixo (R$)
            </button>
          </div>
        </div>
        <label className="form-label">
          {kind === "percent" ? "Desconto (1 a 90%)" : "Desconto em reais"}
          <input
            inputMode="decimal"
            value={value}
            placeholder={kind === "percent" ? "10" : "5,00"}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <label className="form-label">
          Pedido mínimo em reais (opcional)
          <input inputMode="decimal" value={min} placeholder="0,00" onChange={(e) => setMin(e.target.value)} />
          <span className="field-help">Vale sobre os itens, sem a taxa de entrega.</span>
        </label>
        <label className="form-label">
          Válido até (opcional)
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
        <label className="crm-check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Cupom ativo
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="coupon-actions">
          <Button type="submit" disabled={busy}>
            {busy ? "Salvando…" : "Salvar cupom"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
