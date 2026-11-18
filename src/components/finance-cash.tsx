"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { requestJson } from "@/lib/client-api";
import { money } from "@/lib/utils";
import { parseMoneyInput } from "@/lib/coupons";
import {
  addDays,
  cashSummaryText,
  clampCashDay,
  defaultCashDay,
  METHOD_LABELS,
  type CashDay,
} from "@/lib/finance";
import { todayIn } from "./coupons-admin";
import { Button } from "./ui/button";

type Save = (body: unknown) => Promise<void>;

export function FinanceCash({
  restaurantId,
  restaurantName,
  timezone,
  save,
  busy,
}: {
  restaurantId: string;
  restaurantName: string;
  timezone: string;
  save: Save;
  busy: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const today = todayIn(timezone, new Date(now));
  const [day, setDay] = useState(() => defaultCashDay(new Date().toISOString(), timezone));
  const [report, setReport] = useState<CashDay | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const latest = useRef(0);

  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    setError("");
    try {
      const data = await requestJson<CashDay>(`/api/restaurants/${restaurantId}/finance/cash?day=${day}`);
      if (id === latest.current) setReport(data);
    } catch {
      if (id === latest.current) {
        setReport(null);
        setError("Não foi possível carregar o caixa. Tente novamente.");
      }
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [restaurantId, day]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(""), 3000);
    return () => clearTimeout(t);
  }, [note]);

  async function copy() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(cashSummaryText(report, restaurantName));
      setNote("Resumo copiado.");
    } catch {
      setNote("Não foi possível copiar. Tente de novo.");
    }
  }

  async function addIncome(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const text = description.trim();
    if (text.length < 2 || text.length > 60) return setFormError("A descrição deve ter de 2 a 60 letras.");
    const cents = parseMoneyInput(amount);
    if (cents === null) return setFormError("Valor inválido. Use vírgula, ex.: 150,00");
    if (cents < 1 || cents > 10000000) return setFormError("O valor deve ser de R$ 0,01 a R$ 100.000,00.");
    try {
      await save({
        action: "save_finance_entry",
        id: null,
        entry: { kind: "income", description: text, amount_cents: cents, entry_date: day },
      });
      setDescription("");
      setAmount("");
      await load();
    } catch (err) {
      setFormError((err as Error).message);
    }
  }
  async function remove(id: string, label: string) {
    if (!window.confirm(`Apagar a receita "${label}"?`)) return;
    setFormError("");
    try {
      await save({ action: "delete_finance_entry", id });
      await load();
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  const hasSales = !!report && report.methods.length > 0;
  return (
    <section className="fin-section">
      <div className="connected-toolbar">
        <label className="form-label inline-label">
          Dia
          <input
            type="date"
            value={day}
            min={addDays(today, -90)}
            max={today}
            onChange={(e) => {
              const next = clampCashDay(e.target.value, today);
              if (next) setDay(next);
            }}
          />
        </label>
        <div className="fin-toolbar-actions">
          {note && (
            <span role="status" className="field-help">
              {note}
            </span>
          )}
          <Button variant="outline" disabled={!report || loading} onClick={() => void copy()}>
            <Copy size={16} /> Copiar resumo
          </Button>
        </div>
      </div>
      <p className="field-help">Conta os pedidos entregues criados entre 00:00 e 23:59 desse dia.</p>
      {loading && !report && <p role="status">Carregando…</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}{" "}
          <Button type="button" variant="ghost" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </p>
      )}
      {report && (
        <div className={loading ? "fin-reloading" : undefined} aria-busy={loading}>
          {hasSales ? (
            <div className="fin-cards">
              {report.methods.map((m) => (
                <article key={m.method} className="admin-panel fin-card">
                  <span>{METHOD_LABELS[m.method] ?? m.method}</span>
                  <strong>{money(m.total_cents)}</strong>
                  <small>
                    {m.orders} {m.orders === 1 ? "pedido" : "pedidos"}
                  </small>
                </article>
              ))}
            </div>
          ) : (
            <p className="notice small">Nenhuma venda entregue neste dia.</p>
          )}
          <div className="admin-panel overview-table-panel">
            <h2 className="overview-title">Resumo do dia</h2>
            <dl className="fin-summary">
              <div>
                <dt>Itens</dt>
                <dd>{money(report.items_cents)}</dd>
              </div>
              <div>
                <dt>Taxas de entrega</dt>
                <dd>{money(report.delivery_fees_cents)}</dd>
              </div>
              <div>
                <dt>Descontos de cupom</dt>
                <dd>−{money(report.discount_cents)}</dd>
              </div>
              <div className="fin-strong">
                <dt>Total vendido</dt>
                <dd>{money(report.sold_cents)}</dd>
              </div>
              <div>
                <dt>Taxa da maquininha (estimada)</dt>
                <dd>−{money(report.machine_fee_cents)}</dd>
              </div>
              <div>
                <dt>Outras receitas</dt>
                <dd>{money(report.other_income_cents)}</dd>
              </div>
              <div className="fin-strong fin-total">
                <dt>Líquido do dia</dt>
                <dd>{money(report.net_cents)}</dd>
              </div>
            </dl>
          </div>
          <div className="admin-panel overview-table-panel">
            <h2 className="overview-title">Outras receitas</h2>
            <p className="field-help">Vendas que não passaram pelo Fome Play, como iFood ou balcão.</p>
            {report.other_income.length > 0 && (
              <ul className="fin-list">
                {report.other_income.map((i) => (
                  <li key={i.id}>
                    <span>{i.description}</span>
                    <strong>{money(i.amount_cents)}</strong>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      aria-label={`Apagar receita ${i.description}`}
                      onClick={() => void remove(i.id, i.description)}
                    >
                      <Trash2 size={15} /> Apagar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <form className="fin-inline-form" onSubmit={(e) => void addIncome(e)}>
              <label className="form-label">
                Descrição
                <input
                  value={description}
                  maxLength={60}
                  placeholder="iFood"
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <label className="form-label">
                Valor
                <input inputMode="decimal" value={amount} placeholder="0,00" onChange={(e) => setAmount(e.target.value)} />
              </label>
              <Button type="submit" disabled={busy}>
                Adicionar
              </Button>
            </form>
            {formError && (
              <p role="alert" className="form-error">
                {formError}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
