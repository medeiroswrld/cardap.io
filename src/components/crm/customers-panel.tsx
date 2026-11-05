"use client";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { requestJson } from "@/lib/client-api";
import { money } from "@/lib/utils";
import { CRM_PAGE_SIZE, CRM_SEGMENTS, segmentLabel, segmentNames, type CrmList, type CrmSegment } from "@/lib/crm";
import { CustomerDetail } from "./customer-detail";

type Save = (body: unknown) => Promise<void>;
const sorts = [
  ["last_order", "Último pedido"],
  ["spent", "Total gasto"],
  ["orders", "Nº de pedidos"],
  ["name", "Nome"],
] as const;
type Result = { key: string; error?: string };

export function CustomersPanel({
  restaurantId,
  save,
  onChanged,
}: {
  restaurantId: string;
  save: Save;
  onChanged?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [segment, setSegment] = useState<CrmSegment | "">("");
  const [tag, setTag] = useState("");
  const [debouncedTag, setDebouncedTag] = useState("");
  const [marketing, setMarketing] = useState(false);
  const [sort, setSort] = useState<(typeof sorts)[number][0]>("last_order");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [data, setData] = useState<CrmList | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTag(tag.trim()), 300);
    return () => clearTimeout(timer);
  }, [tag]);

  const query = new URLSearchParams({
    search: debounced,
    segment,
    tag: debouncedTag,
    marketing: marketing ? "1" : "",
    sort,
    page: String(page),
  }).toString();
  const key = `${restaurantId}?${query}#${version}`;

  useEffect(() => {
    let alive = true;
    requestJson<CrmList>(`/api/restaurants/${restaurantId}/crm?${query}`)
      .then((next) => {
        if (!alive) return;
        const last = Math.max(1, Math.ceil(next.total / CRM_PAGE_SIZE));
        if (page > last) {
          setPage(last);
          return;
        }
        setData(next);
        setResult({ key });
      })
      .catch((err) => alive && setResult({ key, error: (err as Error).message }));
    return () => {
      alive = false;
    };
  }, [restaurantId, query, key, page]);

  // Loading is derived: the latest answer belongs to a different request key.
  const loading = result?.key !== key;
  const error = loading ? "" : (result?.error ?? "");
  const pages = data ? Math.max(1, Math.ceil(data.total / CRM_PAGE_SIZE)) : 1;
  const reset = () => setPage(1);
  return (
    <section className="admin-panel connected-panel form-stack" aria-labelledby="crm-title">
      <h2 id="crm-title">Clientes</h2>
      <p className="field-help">
        Totais calculados com todo o histórico; pedidos recusados e cancelados não contam. Telefones informados pelos
        clientes, sem verificação.
      </p>
      <div className="crm-segments" role="group" aria-label="Filtrar por segmento">
        {CRM_SEGMENTS.map((seg) => (
          <button
            key={seg}
            type="button"
            className="crm-segment"
            aria-pressed={segment === seg}
            aria-label={data ? `${data.segments[seg]} ${segmentNames[seg]}` : `${segmentNames[seg]} (carregando)`}
            onClick={() => {
              setSegment(segment === seg ? "" : seg);
              reset();
            }}
          >
            <strong>{data?.segments[seg] ?? "–"}</strong>
            <span>{segmentNames[seg]}</span>
          </button>
        ))}
      </div>
      <div className="crm-filters">
        <label className="form-label">
          Buscar
          <input
            type="search"
            placeholder="Nome ou telefone"
            maxLength={80}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              reset();
            }}
          />
        </label>
        <label className="form-label">
          Etiqueta
          <input
            maxLength={30}
            value={tag}
            onChange={(e) => {
              setTag(e.target.value);
              reset();
            }}
          />
        </label>
        <label className="form-label">
          Ordenar por
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as (typeof sorts)[number][0]);
              reset();
            }}
          >
            {sorts.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-label crm-check">
          <input
            type="checkbox"
            checked={marketing}
            onChange={(e) => {
              setMarketing(e.target.checked);
              reset();
            }}
          />
          <span>Só quem autorizou marketing</span>
        </label>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <p role="status" className="field-help">
        {loading ? "Carregando clientes…" : data ? `${data.total} cliente(s)` : ""}
      </p>
      <div className="crm-table-wrap">
        <table className="crm-table">
          <caption className="crm-sr-only">Lista de clientes</caption>
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">Segmento</th>
              <th scope="col">Pedidos</th>
              <th scope="col">Total gasto</th>
              <th scope="col">Último pedido</th>
              <th scope="col">Etiquetas</th>
            </tr>
          </thead>
          <tbody>
            {data?.customers.map((c) => (
              <tr key={c.id}>
                <td>
                  <button type="button" className="crm-link" aria-label={`${c.name}, ${c.phone}`} onClick={() => setSelected(c.id)}>
                    {c.name}
                  </button>
                  <small>{c.phone}</small>
                </td>
                <td>{segmentLabel[c.segment]}</td>
                <td>{c.orders_count}</td>
                <td>{money(Number(c.spent_cents))}</td>
                <td>{c.last_order_at ? new Date(c.last_order_at).toLocaleDateString("pt-BR") : "—"}</td>
                <td>{c.tags.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.customers.length === 0 && !loading && <p>Nenhum cliente encontrado com esses filtros.</p>}
      <nav className="crm-pages" aria-label="Paginação de clientes">
        <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Anterior
        </Button>
        <span>
          Página {page} de {pages}
        </span>
        <Button variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>
          Próxima
        </Button>
      </nav>
      {selected && (
        <CustomerDetail
          key={selected}
          restaurantId={restaurantId}
          contactId={selected}
          open
          save={save}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setVersion((v) => v + 1);
            onChanged?.();
          }}
        />
      )}
    </section>
  );
}
