"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { requestJson } from "@/lib/client-api";
import { money } from "@/lib/utils";
import { dueLabel, EXPENSE_CATEGORIES, type Bill, type Bills } from "@/lib/finance";
import { shortDate } from "./coupons-admin";
import { Button } from "./ui/button";

type Save = (body: unknown) => Promise<void>;

const categoryLabel = (key: string) => EXPENSE_CATEGORIES.find((c) => c.key === key)?.label ?? key;
function dayNumber(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

export function FinanceBills({
  restaurantId,
  save,
  busy,
}: {
  restaurantId: string;
  save: Save;
  busy: boolean;
}) {
  const [bills, setBills] = useState<Bills | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);

  const load = useCallback(async () => {
    const id = ++latest.current;
    setError("");
    try {
      const data = await requestJson<Bills>(`/api/restaurants/${restaurantId}/finance/bills`);
      if (id === latest.current) setBills(data);
    } catch {
      if (id === latest.current) setError("Não foi possível carregar as contas. Tente novamente.");
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [restaurantId]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function setPaid(id: string, paid: boolean) {
    setActionError("");
    try {
      await save({ action: "set_entry_paid", id, paid });
      await load();
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  const groups = bills
    ? [
        {
          key: "overdue",
          title: "Vencidas",
          items: bills.open.filter((b) => dayNumber(b.due_date) < dayNumber(bills.today)),
        },
        {
          key: "week",
          title: "Vencem nos próximos 7 dias",
          items: bills.open.filter((b) => {
            const diff = dayNumber(b.due_date) - dayNumber(bills.today);
            return diff >= 0 && diff <= 7;
          }),
        },
        {
          key: "later",
          title: "Depois",
          items: bills.open.filter((b) => dayNumber(b.due_date) - dayNumber(bills.today) > 7),
        },
      ].filter((g) => g.items.length)
    : [];

  function row(b: Bill, today: string) {
    const label = dueLabel(b.due_date, today);
    return (
      <li key={b.id}>
        <div className="fin-bill-main">
          <strong>{b.description}</strong>
          <small>
            {categoryLabel(b.category)} · vence {shortDate(b.due_date)}
          </small>
        </div>
        <span className={`status-pill tone-${label.tone}`}>{label.text}</span>
        <strong className="fin-bill-amount">{money(b.amount_cents)}</strong>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void setPaid(b.id, true)}>
          Marcar como pago
        </Button>
      </li>
    );
  }

  return (
    <section className="fin-section">
      {loading && <p role="status">Carregando contas…</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}{" "}
          <Button type="button" variant="ghost" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </p>
      )}
      {actionError && (
        <p role="alert" className="form-error">
          {actionError}
        </p>
      )}
      {bills && (
        <>
          {groups.length === 0 ? (
            <p className="notice small">Nenhuma conta em aberto.</p>
          ) : (
            groups.map((g) => (
              <div key={g.key} className="admin-panel overview-table-panel">
                <h2 className="overview-title">{g.title}</h2>
                <ul className="fin-bills">{g.items.map((b) => row(b, bills.today))}</ul>
              </div>
            ))
          )}
          {bills.recently_paid.length > 0 && (
            <div className="admin-panel overview-table-panel">
              <h2 className="overview-title">Pagas recentemente</h2>
              <p className="field-help">Últimos 30 dias.</p>
              <ul className="fin-bills">
                {bills.recently_paid.map((b) => (
                  <li key={b.id}>
                    <div className="fin-bill-main">
                      <strong>{b.description}</strong>
                      <small>
                        {categoryLabel(b.category)} · paga em {shortDate(b.paid_at)}
                      </small>
                    </div>
                    <span className="status-pill tone-success">Paga</span>
                    <strong className="fin-bill-amount">{money(b.amount_cents)}</strong>
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => void setPaid(b.id, false)}>
                      Desfazer
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
