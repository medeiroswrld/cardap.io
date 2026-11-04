"use client";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Modal } from "../ui/dialog";
import { requestJson } from "@/lib/client-api";
import { money } from "@/lib/utils";
import { campaignLink, segmentLabel, type CrmDetail } from "@/lib/crm";
import { statusLabel, type Fulfillment, type OrderStatus } from "@/lib/order-flow";

type Save = (body: unknown) => Promise<void>;
type Run = (action: () => Promise<unknown>, after?: "reload" | "close") => Promise<void>;
type Loaded = { key: string; detail?: CrmDetail; error?: string };
const marketingText = { authorized: "Autorizado", not_authorized: "Não autorizado", revoked: "Revogado" } as const;
const fulfillmentText: Record<Fulfillment, string> = { mesa: "Mesa", retirada: "Retirada", entrega: "Entrega" };
const dateText = (value: string | null) => (value ? new Date(value).toLocaleDateString("pt-BR") : "—");

export function CustomerDetail({
  restaurantId,
  contactId,
  open,
  onClose,
  onChanged,
  save,
}: {
  restaurantId: string;
  contactId: string;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  save: Save;
}) {
  const base = `/api/restaurants/${restaurantId}/crm/${contactId}`;
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const key = `${base}#${reload}`;

  useEffect(() => {
    let alive = true;
    requestJson<CrmDetail>(base)
      .then((detail) => alive && setLoaded({ key, detail }))
      .catch((err) => alive && setLoaded({ key, error: (err as Error).message }));
    return () => {
      alive = false;
    };
  }, [base, key]);

  const detail = loaded?.detail;
  const error = actionError || (loaded?.key === key ? (loaded.error ?? "") : "");

  const run: Run = async (action, after = "reload") => {
    setBusy(true);
    setActionError("");
    try {
      await action();
      onChanged();
      if (after === "close") onClose();
      else setReload((n) => n + 1);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={(v) => !v && !busy && onClose()} title={detail?.name ?? "Cliente"} wide>
      {!detail && !error && <p role="status">Carregando ficha…</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {detail && <DetailBody key={loaded.key} detail={detail} base={base} busy={busy} run={run} save={save} />}
    </Modal>
  );
}

function DetailBody({
  detail,
  base,
  busy,
  run,
  save,
}: {
  detail: CrmDetail;
  base: string;
  busy: boolean;
  run: Run;
  save: Save;
}) {
  const [tags, setTags] = useState<string[]>(detail.tags);
  const [newTag, setNewTag] = useState("");
  const [notes, setNotes] = useState(detail.notes);
  const [erasing, setErasing] = useState(false);
  const [confirm, setConfirm] = useState("");

  const addTag = () => {
    const value = newTag.trim().slice(0, 30);
    if (!value || tags.some((t) => t.toLowerCase() === value.toLowerCase()) || tags.length >= 10) return;
    setTags([...tags, value]);
    setNewTag("");
  };

  return (
    <div className="form-stack crm-detail">
      <p>
        {detail.phone} · {segmentLabel[detail.segment]} · Marketing: {marketingText[detail.marketing_status]}
      </p>
      <dl className="crm-stats">
        <div>
          <dt>Pedidos</dt>
          <dd>{detail.orders_count}</dd>
        </div>
        <div>
          <dt>Total gasto</dt>
          <dd>{money(Number(detail.spent_cents))}</dd>
        </div>
        <div>
          <dt>Ticket médio</dt>
          <dd>{money(detail.avg_ticket_cents)}</dd>
        </div>
        <div>
          <dt>Primeiro pedido</dt>
          <dd>{dateText(detail.first_order_at)}</dd>
        </div>
        <div>
          <dt>Último pedido</dt>
          <dd>{dateText(detail.last_order_at)}</dd>
        </div>
      </dl>
      {detail.favorites.length > 0 && (
        <p>
          <strong>Favoritos:</strong> {detail.favorites.map((f) => `${f.product_name} (${f.quantity})`).join(", ")}
        </p>
      )}
      <p>
        <strong>Como costuma pedir:</strong> Mesa {detail.fulfillment_mix.mesa} · Retirada{" "}
        {detail.fulfillment_mix.retirada} · Entrega {detail.fulfillment_mix.entrega}
      </p>
      {detail.addresses.length > 0 && (
        <div>
          <strong>Últimos endereços</strong>
          <ul>
            {detail.addresses.map((a, i) => (
              <li key={i}>
                {a.street}, {a.number}
                {a.complement ? ` (${a.complement})` : ""} · {a.zone_name}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <strong>Últimos pedidos</strong>
        <ul>
          {detail.orders.map((o) => (
            <li key={o.id}>
              #{o.number} · {dateText(o.created_at)} · {fulfillmentText[o.fulfillment]} ·{" "}
              {statusLabel(o.status as OrderStatus, o.fulfillment)} · {money(o.total_cents)}
            </li>
          ))}
        </ul>
      </div>
      <fieldset className="crm-tags">
        <legend>Etiquetas ({tags.length}/10)</legend>
        <ul>
          {tags.map((t) => (
            <li key={t}>
              {t}{" "}
              <Button
                variant="ghost"
                aria-label={`Remover etiqueta ${t}`}
                onClick={() => setTags(tags.filter((x) => x !== t))}
              >
                Remover
              </Button>
            </li>
          ))}
        </ul>
        <label className="form-label">
          Nova etiqueta
          <input
            maxLength={30}
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
          />
        </label>
        <Button variant="outline" onClick={addTag} disabled={tags.length >= 10}>
          Adicionar etiqueta
        </Button>
      </fieldset>
      <label className="form-label">
        Anotações ({notes.length}/2000)
        <textarea maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <p className="field-help">Não registre dados sensíveis (saúde, religião, política, documentos).</p>
      <Button disabled={busy} onClick={() => void run(() => requestJson(base, { action: "save", tags, notes }))}>
        {busy ? "Salvando…" : "Salvar etiquetas e anotações"}
      </Button>
      <div className="connected-order-actions">
        <Button asChild variant="outline">
          <a href={campaignLink(detail.phone, "")} target="_blank" rel="noopener noreferrer">
            Conversar no WhatsApp
          </a>
        </Button>
        {detail.marketing_status === "authorized" && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void run(() => save({ action: "revoke_marketing", id: detail.id }))}
          >
            Revogar autorização de marketing
          </Button>
        )}
        <Button variant="ghost" disabled={busy} onClick={() => setErasing(true)}>
          Excluir dados do cliente
        </Button>
      </div>
      {erasing && (
        <form
          className="form-stack crm-erase"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => requestJson(base, { action: "erase", confirm: "EXCLUIR" }), "close");
          }}
        >
          <p role="alert">
            Isto apaga etiquetas, anotações, endereços e o consentimento deste cliente e troca nome e telefone nos
            pedidos por “Cliente removido”. Os valores dos pedidos continuam no caixa. Não é possível desfazer.
          </p>
          <label className="form-label">
            Digite EXCLUIR para confirmar
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </label>
          <div className="connected-order-actions">
            <Button type="submit" disabled={busy || confirm !== "EXCLUIR"}>
              Excluir definitivamente
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setErasing(false);
                setConfirm("");
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
