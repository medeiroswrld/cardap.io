"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { requestJson } from "@/lib/client-api";
import { money } from "@/lib/utils";
import { couponLink, whatsappUrl, winBackMessage, SITE_URL, type CouponRow } from "@/lib/coupons";
import { Button } from "./ui/button";
import { couponExpired, todayIn } from "./coupons-admin";

type Lapsed = {
  id: string;
  name: string;
  phone: string;
  last_order_at: string;
  orders_count: number;
  spent_cents: number;
};
type Page = { total: number; rows: Lapsed[] };
const DAYS = [30, 60, 90] as const;
const DEFAULT_MESSAGE =
  "Oi {nome}! Faz tempo que você não pede no {restaurante}. Preparamos um desconto pra você voltar: {link}";

const DEFAULT_MESSAGE_NO_COUPON =
  "Oi {nome}! Faz tempo que você não pede no {restaurante}. Bateu saudade? Peça por aqui: {link}";

function dateText(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(iso),
  );
}

export function WinBackPanel({
  restaurantId,
  restaurantName,
  slug,
  timezone,
  coupons,
}: {
  restaurantId: string;
  restaurantName: string;
  slug: string;
  timezone: string;
  coupons: CouponRow[];
}) {
  const [days, setDays] = useState<30 | 60 | 90>(30);
  const [couponCode, setCouponCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<Lapsed[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const latest = useRef(0);
  const today = todayIn(timezone);
  const usable = coupons.filter((c) => c.active && !couponExpired(c, today));
  const selected = usable.some((c) => c.code === couponCode) ? couponCode : "";
  const text = message ?? (selected ? DEFAULT_MESSAGE : DEFAULT_MESSAGE_NO_COUPON);
  const link = selected ? couponLink(slug, selected) : `${SITE_URL}/r/${slug}`;

  const load = useCallback(
    async (offset: number) => {
      const id = ++latest.current;
      setLoading(true);
      setError("");
      try {
        const page = await requestJson<Page>(
          `/api/restaurants/${restaurantId}/lapsed-customers?days=${days}&offset=${offset}`,
        );
        if (id !== latest.current) return;
        setTotal(page.total);
        setRows((prev) => {
          if (offset === 0) return page.rows;
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...page.rows.filter((r) => !seen.has(r.id))];
        });
      } catch {
        if (id === latest.current) setError("Não foi possível carregar a lista. Tente novamente.");
      } finally {
        if (id === latest.current) setLoading(false);
      }
    },
    [restaurantId, days],
  );
  useEffect(() => {
    queueMicrotask(() => {
      setRows([]);
      setTotal(0);
      void load(0);
    });
  }, [load]);

  return (
    <section className="admin-panel connected-panel form-stack" aria-labelledby="winback-title">
      <h2 id="winback-title">Reconquistar clientes</h2>
      <p className="notice small">
        Clientes que autorizaram receber ofertas e não pedem há um tempo. Nada é enviado automaticamente: cada botão abre
        uma conversa com a mensagem pronta.
      </p>
      <div className="segmented-control win-back-days" role="group" aria-label="Sumidos há">
        {DAYS.map((d) => (
          <button
            key={d}
            type="button"
            className={d === days ? "active" : ""}
            aria-pressed={d === days}
            onClick={() => setDays(d)}
          >
            {d} dias
          </button>
        ))}
      </div>
      <label className="form-label">
        Cupom para enviar
        <select value={selected} onChange={(e) => setCouponCode(e.target.value)}>
          <option value="">Sem cupom</option>
          {usable.map((c) => (
            <option key={c.id} value={c.code}>
              {c.code} · {c.kind === "percent" ? `${c.value}%` : money(c.value)}
            </option>
          ))}
        </select>
      </label>
      <label className="form-label">
        Mensagem ({text.length}/500) — use {"{nome}"}, {"{restaurante}"} e {"{link}"}
        <textarea maxLength={500} value={text} onChange={(e) => setMessage(e.target.value)} />
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}{" "}
          <Button type="button" variant="ghost" onClick={() => void load(rows.length)}>
            Tentar novamente
          </Button>
        </p>
      )}
      {!error && loading && rows.length === 0 && <p role="status">Carregando clientes…</p>}
      {!loading && !error && total === 0 && <p className="notice small">Ninguém sumido há {days} dias. Bom sinal!</p>}
      {rows.length > 0 && (
        <>
          <p role="status" className="field-help">
            {total} {total === 1 ? "cliente sumido" : "clientes sumidos"} há {days} dias ou mais.
          </p>
          <div className="crm-table-wrap">
            <table className="overview-table win-back-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Último pedido</th>
                  <th>Pedidos</th>
                  <th>Total gasto</th>
                  <th>
                    <span className="crm-sr-only">Ação</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Cliente">
                      <strong>{r.name || "Sem nome"}</strong>
                      <small className="field-help">{r.phone}</small>
                    </td>
                    <td data-label="Último pedido">{dateText(r.last_order_at, timezone)}</td>
                    <td data-label="Pedidos">{r.orders_count}</td>
                    <td data-label="Total gasto">{money(r.spent_cents)}</td>
                    <td>
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={whatsappUrl(
                            r.phone,
                            winBackMessage(text, { nome: r.name, restaurante: restaurantName, link }),
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Chamar ${r.name || "cliente"} no WhatsApp`}
                        >
                          Chamar no WhatsApp
                        </a>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length < total && (
            <Button variant="outline" disabled={loading} onClick={() => void load(rows.length)}>
              {loading ? "Carregando…" : "Carregar mais"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
