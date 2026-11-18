"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { requestJson } from "@/lib/client-api";
import { money } from "@/lib/utils";
import { parseMoneyInput } from "@/lib/coupons";
import { monthOptions } from "@/lib/results-report";
import {
  EXPENSE_CATEGORIES,
  isFinanceDay,
  percentChange,
  type ExpenseCategory,
  type FinanceEntry,
  type FinanceMonth,
} from "@/lib/finance";
import { shortDate, todayIn } from "./coupons-admin";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";

type Save = (body: unknown) => Promise<void>;

const categoryLabel = (key: string | null) =>
  EXPENSE_CATEGORIES.find((c) => c.key === key)?.label ?? "Receita";
const reaisText = (cents: number) => (cents ? (cents / 100).toFixed(2).replace(".", ",") : "");
const MONEY_INVALID = "Valor inválido. Use vírgula, ex.: 150,00";

export function FinanceMonthPanel({
  restaurantId,
  timezone,
  save,
  busy,
}: {
  restaurantId: string;
  timezone: string;
  save: Save;
  busy: boolean;
}) {
  const [options] = useState(() => monthOptions(new Date(), timezone));
  const [today] = useState(() => todayIn(timezone));
  const [month, setMonth] = useState(options[0].value);
  const [report, setReport] = useState<FinanceMonth | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ kind: "expense" | "income"; entry: FinanceEntry | null } | null>(null);
  const latest = useRef(0);

  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    setError("");
    try {
      const data = await requestJson<FinanceMonth>(
        `/api/restaurants/${restaurantId}/finance/month?month=${month}-01`,
      );
      if (id === latest.current) setReport(data);
    } catch {
      if (id === latest.current) {
        setReport(null);
        setError("Não foi possível carregar o resultado do mês. Tente novamente.");
      }
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [restaurantId, month]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function remove(entry: FinanceEntry) {
    if (!window.confirm(`Apagar "${entry.description}"?`)) return;
    setActionError("");
    try {
      await save({ action: "delete_finance_entry", id: entry.id });
      await load();
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  const revenue = report ? report.sales.sold_cents + report.other_income_cents : 0;
  const change = report ? percentChange(report.profit_cents, report.previous_profit_cents) : null;
  const maxCategory = report ? Math.max(1, ...report.by_category.map((c) => c.total_cents)) : 1;
  const defaultDate = today.startsWith(month) ? today : `${month}-01`;
  return (
    <section className="fin-section">
      <div className="connected-toolbar">
        <label className="form-label inline-label">
          Mês
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="fin-toolbar-actions">
          <Button onClick={() => setEditing({ kind: "expense", entry: null })}>
            <Plus size={17} /> Nova despesa
          </Button>
          <Button variant="outline" onClick={() => setEditing({ kind: "income", entry: null })}>
            <Plus size={17} /> Nova receita
          </Button>
        </div>
      </div>
      {loading && <p role="status">Carregando resultado…</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}{" "}
          <Button type="button" variant="ghost" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </p>
      )}
      {report && !loading && (
        <>
          <div className="fin-cards fin-numbers">
            <article className="admin-panel fin-card">
              <span>Receitas</span>
              <strong>{money(revenue)}</strong>
              <small>Fome Play + outras receitas</small>
            </article>
            <article className="admin-panel fin-card">
              <span>Taxa da maquininha</span>
              <strong>{money(report.sales.machine_fee_cents)}</strong>
              <small>Estimada</small>
            </article>
            <article className="admin-panel fin-card">
              <span>Despesas</span>
              <strong>{money(report.expenses_cents)}</strong>
            </article>
            <article className="admin-panel fin-card fin-profit">
              <span>Lucro</span>
              <strong className={report.profit_cents >= 0 ? "fin-positive" : "fin-negative"}>
                {report.profit_cents < 0 ? "−" : ""}
                {money(Math.abs(report.profit_cents))}
              </strong>
              {change && <small>{change} em relação ao mês anterior</small>}
            </article>
          </div>
          <div className="admin-panel overview-table-panel">
            <h2 className="overview-title">Despesas por categoria</h2>
            {report.by_category.length ? (
              <ul className="fin-bars">
                {report.by_category.map((c) => (
                  <li key={c.category}>
                    <span>{categoryLabel(c.category)}</span>
                    <span className="fin-bar" aria-hidden="true">
                      <i style={{ width: `${Math.max(3, (c.total_cents / maxCategory) * 100)}%` }} />
                    </span>
                    <strong>{money(c.total_cents)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="field-help">Nenhuma despesa lançada neste mês.</p>
            )}
          </div>
          <div className="admin-panel overview-table-panel">
            <h2 className="overview-title">Lançamentos do mês</h2>
            {actionError && (
              <p role="alert" className="form-error">
                {actionError}
              </p>
            )}
            {report.entries.length ? (
              <table className="overview-table fin-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Categoria</th>
                    <th>Valor</th>
                    <th>Situação</th>
                    <th>
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.entries.map((e) => (
                    <tr key={e.id}>
                      <td>{shortDate(e.entry_date)}</td>
                      <td>{e.description}</td>
                      <td>{categoryLabel(e.category)}</td>
                      <td>
                        {e.kind === "income" ? "+" : "−"}
                        {money(e.amount_cents)}
                      </td>
                      <td>
                        {e.kind === "expense" &&
                          (e.paid_at ? (
                            <span className="status-pill tone-success">Paga</span>
                          ) : (
                            <span className="status-pill tone-warning">
                              A pagar{e.due_date ? ` até ${shortDate(e.due_date)}` : ""}
                            </span>
                          ))}
                      </td>
                      <td className="fin-actions">
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`Editar ${e.description}`}
                          onClick={() => setEditing({ kind: e.kind, entry: e })}
                        >
                          <Pencil size={15} />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          aria-label={`Apagar ${e.description}`}
                          onClick={() => void remove(e)}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="field-help">Nenhum lançamento neste mês.</p>
            )}
          </div>
        </>
      )}
      {editing && (
        <EntryForm
          key={editing.entry?.id ?? editing.kind}
          kind={editing.kind}
          entry={editing.entry}
          defaultDate={defaultDate}
          save={save}
          busy={busy}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function EntryForm({
  kind,
  entry,
  defaultDate,
  save,
  busy,
  onSaved,
  onClose,
}: {
  kind: "expense" | "income";
  entry: FinanceEntry | null;
  defaultDate: string;
  save: Save;
  busy: boolean;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [description, setDescription] = useState(entry?.description ?? "");
  const [category, setCategory] = useState<ExpenseCategory>(entry?.category ?? "insumos");
  const [amount, setAmount] = useState(entry ? reaisText(entry.amount_cents) : "");
  const [date, setDate] = useState(entry?.entry_date ?? defaultDate);
  const [paid, setPaid] = useState(entry ? !!entry.paid_at : false);
  const [due, setDue] = useState(entry?.due_date ?? "");
  const [error, setError] = useState("");
  const expense = kind === "expense";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const text = description.trim();
    const [min, max] = expense ? [2, 80] : [2, 60];
    if (text.length < min || text.length > max) return setError(`A descrição deve ter de ${min} a ${max} letras.`);
    const cents = parseMoneyInput(amount);
    if (cents === null) return setError(MONEY_INVALID);
    const limit = expense ? 100000000 : 10000000;
    if (cents < 1 || cents > limit) {
      return setError(`O valor deve ser de R$ 0,01 a ${expense ? "R$ 1.000.000,00" : "R$ 100.000,00"}.`);
    }
    if (!isFinanceDay(date)) return setError("Informe a data.");
    let payload: Record<string, unknown>;
    if (expense) {
      if (!paid && !isFinanceDay(due)) return setError("Informe o vencimento da conta.");
      payload = {
        kind: "expense",
        description: text,
        category,
        amount_cents: cents,
        entry_date: date,
        paid,
        due_date: paid ? (entry?.due_date ?? null) : due,
        // Keep the original payment date when editing an already-paid expense.
        ...(paid && entry?.paid_at ? { paid_at: entry.paid_at } : {}),
      };
    } else {
      payload = { kind: "income", description: text, amount_cents: cents, entry_date: date };
    }
    try {
      await save({ action: "save_finance_entry", id: entry?.id ?? null, entry: payload });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const title = entry
    ? expense
      ? "Editar despesa"
      : "Editar receita"
    : expense
      ? "Nova despesa"
      : "Nova receita";
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={title}>
      <form className="form-stack" onSubmit={(e) => void submit(e)}>
        <label className="form-label">
          Descrição
          <input
            value={description}
            maxLength={expense ? 80 : 60}
            placeholder={expense ? "Compra de carne" : "iFood"}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        {expense && (
          <label className="form-label">
            Categoria
            <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="form-label">
          Valor
          <input inputMode="decimal" value={amount} placeholder="0,00" onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="form-label">
          Data
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {expense && (
          <>
            <label className="crm-check">
              <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Já paga?
            </label>
            {!paid && (
              <label className="form-label">
                Vencimento
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </label>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="coupon-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
