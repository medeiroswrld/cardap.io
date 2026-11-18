"use client";
import { useCallback, useEffect, useState } from "react";
import { Star } from "lucide-react";
import { apiErrorCode, apiErrorMessages, requestJson } from "@/lib/client-api";
import {
  changeKind,
  cycleLabel,
  cycleUnit,
  fullDate,
  invoiceLink,
  invoiceView,
  payableInvoice,
  planLabel,
  shortDate,
  stateView,
  targetPrice,
  type BillingInfo,
} from "@/lib/billing-view";
import { FOUNDER_PRICE_CENTS, type Cycle, type SellablePlan } from "@/lib/plans";
import { formatDocument, safeRedirect } from "@/lib/sales";
import { money } from "@/lib/utils";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";

type Target = { plan: SellablePlan; cycle: Cycle };
const OPTIONS: Target[] = [
  { plan: "essencial", cycle: "mensal" },
  { plan: "essencial", cycle: "anual" },
  { plan: "profissional", cycle: "mensal" },
  { plan: "profissional", cycle: "anual" },
];
const DOCUMENT_REJECTED = "O Asaas recusou o CPF/CNPJ. Confira e tente de novo.";

export function BillingSettings({
  restaurantId,
  documentRejected = false,
  onChanged,
}: {
  restaurantId: string;
  documentRejected?: boolean;
  onChanged: () => void;
}) {
  const url = `/api/restaurants/${restaurantId}/billing`;
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  const [confirm, setConfirm] = useState<"change" | "cancel" | null>(null);
  const [founderWarn, setFounderWarn] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const load = useCallback(async () => {
    try {
      setInfo(await requestJson<BillingInfo>(url));
      setLoadError("");
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, [url]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  if (!info)
    return (
      <section className="admin-panel connected-panel billing-plan">
        {loadError ? (
          <>
            <p role="alert" className="form-error">
              {loadError}
            </p>
            <Button variant="outline" onClick={() => void load()}>
              Tentar de novo
            </Button>
          </>
        ) : (
          <p role="status">Carregando seu plano…</p>
        )}
      </section>
    );

  const courtesy = info.status === "cortesia";
  const pill = stateView(info.state);
  const current: Target = { plan: info.plan as SellablePlan, cycle: info.cycle };
  const chosen = target ?? current;
  const kind = changeKind(current, chosen);
  const manage = ["ativo", "atrasado"].includes(info.status) && info.hasSubscription && !info.cancelAt && !courtesy;
  // A refunded/cancelled plan has no future access: only an ending (still active) subscription shows the date.
  const ended = info.state === "cancelado";
  const accessUntil = ended ? null : info.cancelAt;
  const payable = payableInvoice(info.invoices);
  const periodEnd = shortDate(info.currentPeriodEnd);

  function close() {
    setConfirm(null);
    setFounderWarn(false);
    setError("");
  }
  async function changePlan(confirmFounderLoss: boolean) {
    setWorking(true);
    setError("");
    try {
      const result = await requestJson<{ applied?: string }>(url, {
        action: "change_plan",
        ...chosen,
        ...(confirmFounderLoss ? { confirmFounderLoss: true } : {}),
      });
      setConfirm(null);
      setFounderWarn(false);
      setTarget(null);
      setDone(
        kind === "same"
          ? "Pronto. Você continua no plano atual."
          : result.applied === "next_charge"
            ? "Troca agendada para a próxima cobrança."
            : "Plano alterado. Já vale agora.",
      );
      await load();
      onChanged();
    } catch (err) {
      if (apiErrorCode(err) === "FOUNDER_CONFIRM_REQUIRED") setFounderWarn(true);
      else setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function cancel() {
    setWorking(true);
    setError("");
    try {
      await requestJson(url, { action: "cancel" });
      setConfirm(null);
      setDone(`Assinatura cancelada. Seu acesso continua até ${periodEnd || "o fim do período"}.`);
      await load();
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  }

  const price = money(targetPrice(chosen));
  const label = `${planLabel(chosen.plan)} ${cycleLabel(chosen.cycle).toLowerCase()}`;

  return (
    <>
      <section className="admin-panel connected-panel billing-plan" aria-labelledby="billing-plan-title">
        <div className="billing-plan-head">
          <div>
            <span className="eyebrow">Seu plano</span>
            <h2 id="billing-plan-title">
              {planLabel(info.plan)}
              {info.founder && (
                <span className="billing-founder">
                  <Star size={13} aria-hidden="true" /> Fundador
                </span>
              )}
            </h2>
          </div>
          <span className={`status-pill tone-${pill.tone}`}>{pill.label}</span>
        </div>
        {courtesy ? (
          <p className="billing-note">Plano cortesia — sem cobrança.</p>
        ) : (
          <dl className="billing-facts">
            <div>
              <dt>Ciclo</dt>
              <dd>{cycleLabel(info.cycle)}</dd>
            </div>
            <div>
              <dt>Valor</dt>
              <dd>
                {money(info.priceCents)}/{cycleUnit(info.cycle)}
              </dd>
            </div>
            {accessUntil ? (
              <div>
                <dt>Acesso até</dt>
                <dd>{fullDate(accessUntil)}</dd>
              </div>
            ) : !ended ? (
              <div>
                <dt>Próxima cobrança</dt>
                <dd>{fullDate(info.currentPeriodEnd) || "—"}</dd>
              </div>
            ) : null}
          </dl>
        )}
        {info.pendingPlan && info.pendingCycle && !info.cancelAt && (
          <p className="billing-note" role="status">
            Muda para {planLabel(info.pendingPlan)} {cycleLabel(info.pendingCycle).toLowerCase()}
            {periodEnd ? ` em ${periodEnd}` : " na próxima cobrança"}.
          </p>
        )}
        {info.cancelAt && !ended && (
          <p className="billing-note" role="status">
            Assinatura cancelada. Acesso até {shortDate(info.cancelAt)}.
          </p>
        )}
        {done && (
          <p className="billing-done" role="status">
            {done}
          </p>
        )}
      </section>

      {info.status === "pendente" && (
        <PayNow url={url} documentRejected={documentRejected} generated={Boolean(payable)} />
      )}
      {["atrasado", "bloqueado"].includes(info.state) && payable && (
        <section className="admin-panel connected-panel billing-pay">
          <div>
            <h2>Existe uma fatura em aberto.</h2>
            <p>Pague para manter seus pedidos funcionando.</p>
          </div>
          <a className="button button-primary" href={payable.url} target="_blank" rel="noopener noreferrer">
            Pagar agora
          </a>
        </section>
      )}

      {!courtesy && (
        <section className="admin-panel connected-panel billing-invoices" aria-labelledby="billing-invoices-title">
          <h2 id="billing-invoices-title">Faturas</h2>
          {info.invoices === null ? (
            <p className="field-help" role="alert">
              Não foi possível carregar as faturas agora. Tente de novo em instantes.{" "}
              <button type="button" className="billing-link" onClick={() => void load()}>
                Tentar de novo
              </button>
            </p>
          ) : info.invoices.length === 0 ? (
            <p className="field-help">Nenhuma fatura ainda.</p>
          ) : (
            <div className="billing-table-wrap">
              <table className="billing-table">
                <thead>
                  <tr>
                    <th>Vencimento</th>
                    <th>Valor</th>
                    <th>Situação</th>
                    <th>
                      <span className="sr-only">Link</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...info.invoices]
                    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
                    .map((invoice) => {
                      const v = invoiceView(invoice.status);
                      const link = invoiceLink(invoice.invoiceUrl);
                      return (
                        <tr key={invoice.id}>
                          <td>{fullDate(invoice.dueDate)}</td>
                          <td className="money-cell">{money(invoice.valueCents)}</td>
                          <td>
                            <span className={`status-pill tone-${v.tone}`}>{v.label}</span>
                          </td>
                          <td>
                            {link && (
                              <a className="billing-link" href={link} target="_blank" rel="noopener noreferrer">
                                {v.action === "pay" ? "Pagar" : "Ver comprovante"}
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {manage && (
        <>
          <section className="admin-panel connected-panel billing-change" aria-labelledby="billing-change-title">
            <h2 id="billing-change-title">Trocar de plano</h2>
            <p className="field-help">
              Upgrade vale na hora, sem cobrança proporcional. Downgrade passa a valer na próxima cobrança.
            </p>
            <div className="billing-choices" role="radiogroup" aria-label="Plano e ciclo">
              {OPTIONS.map((option) => {
                const isCurrent = option.plan === current.plan && option.cycle === current.cycle;
                const isPending = option.plan === info.pendingPlan && option.cycle === info.pendingCycle;
                const selected = option.plan === chosen.plan && option.cycle === chosen.cycle;
                return (
                  <label key={`${option.plan}-${option.cycle}`} className={`billing-choice${selected ? " selected" : ""}`}>
                    <input
                      type="radio"
                      name="billing-target"
                      checked={selected}
                      onChange={() => {
                        setTarget(option);
                        setDone("");
                      }}
                    />
                    <span>
                      <strong>
                        {planLabel(option.plan)} · {cycleLabel(option.cycle).toLowerCase()}
                      </strong>
                      <small>
                        {money(isCurrent ? info.priceCents : targetPrice(option))}/{cycleUnit(option.cycle)}
                        {isCurrent ? " · atual" : isPending ? " · agendado" : ""}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="connected-toolbar">
              <Button
                disabled={kind === "same" && !info.pendingPlan}
                onClick={() => {
                  setDone("");
                  setConfirm("change");
                }}
              >
                {kind === "same" && info.pendingPlan ? "Manter o plano atual" : "Trocar de plano"}
              </Button>
            </div>
          </section>
          <section className="admin-panel connected-panel billing-cancel">
            <div>
              <h2>Cancelar assinatura</h2>
              <p>Seu acesso continua até o fim do período já pago.</p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setDone("");
                setConfirm("cancel");
              }}
            >
              Cancelar assinatura
            </Button>
          </section>
        </>
      )}

      <Modal
        open={confirm === "change"}
        onOpenChange={(open) => !open && close()}
        title={founderWarn ? "Perder o preço de fundador?" : kind === "same" ? "Manter o plano atual?" : "Confirmar troca de plano"}
      >
        <div className="billing-confirm">
          {founderWarn ? (
            <p>
              Você perde o preço de fundador ({money(FOUNDER_PRICE_CENTS)}/mês para sempre) ao trocar de plano ou
              ciclo. Confirmar mesmo assim?
            </p>
          ) : kind === "same" ? (
            <p>
              A troca agendada para {info.pendingPlan ? planLabel(info.pendingPlan) : ""} será cancelada e você
              continua no {planLabel(current.plan)} {cycleLabel(current.cycle).toLowerCase()}.
            </p>
          ) : kind === "upgrade" ? (
            <p>
              Trocar para {label} por {price}/{cycleUnit(chosen.cycle)}? Vale agora, e a próxima cobrança já vem com
              o novo valor.
            </p>
          ) : (
            <p>
              Trocar para {label} por {price}/{cycleUnit(chosen.cycle)}? Passa a valer na próxima cobrança
              {periodEnd ? `, em ${periodEnd}` : ""}. Até lá você continua no plano atual.
            </p>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="billing-confirm-actions">
            <Button variant="ghost" onClick={close} disabled={working}>
              Voltar
            </Button>
            <Button onClick={() => void changePlan(founderWarn)} disabled={working}>
              {founderWarn ? "Trocar e perder o preço de fundador" : kind === "same" ? "Manter o plano" : "Confirmar troca"}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal open={confirm === "cancel"} onOpenChange={(open) => !open && close()} title="Cancelar assinatura?">
        <div className="billing-confirm">
          <p>
            Seu acesso continua até {periodEnd || "o fim do período já pago"}. Depois disso, a gestão e os pedidos
            são pausados.
          </p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="billing-confirm-actions">
            <Button variant="ghost" onClick={close} disabled={working}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={() => void cancel()} disabled={working}>
              Cancelar assinatura
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// "Pagar agora" for an account that never paid: asks the server to (re)create the checkout and goes to the Asaas page.
function PayNow({ url, documentRejected, generated }: { url: string; documentRejected: boolean; generated: boolean }) {
  const [doc, setDoc] = useState("");
  const [askDocument, setAskDocument] = useState(documentRejected);
  const [failed, setFailed] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  async function pay() {
    setWorking(true);
    setError("");
    try {
      const result = await requestJson<{ redirect?: string }>(url, {
        action: "retry_payment",
        ...(askDocument && doc.trim() ? { document: doc.trim() } : {}),
      });
      const next = safeRedirect(result.redirect);
      if (!next) throw new Error("Não foi possível abrir o pagamento. Tente de novo.");
      window.location.assign(next);
    } catch (err) {
      setFailed(true);
      if (apiErrorCode(err) === "INVALID_DOCUMENT") {
        setAskDocument(true);
        setError(apiErrorMessages.INVALID_DOCUMENT);
      } else setError((err as Error).message);
      setWorking(false);
    }
  }
  return (
    <section className="admin-panel connected-panel billing-pay">
      <div className="form-stack">
        <div>
          <h2>Pague para começar.</h2>
          <p>Você será levado à página segura do Asaas, com Pix, boleto ou cartão.</p>
        </div>
        {documentRejected && !error && (
          <p role="alert" className="form-error">
            {DOCUMENT_REJECTED}
          </p>
        )}
        {askDocument && (
          <label className="form-label">
            CPF ou CNPJ
            <input
              inputMode="numeric"
              autoComplete="off"
              value={doc}
              onChange={(e) => setDoc(formatDocument(e.target.value))}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </div>
      <Button onClick={() => void pay()} disabled={working || (askDocument && !doc.trim())}>
        {working ? "Abrindo…" : failed || !generated ? "Tentar gerar o pagamento de novo" : "Pagar agora"}
      </Button>
    </section>
  );
}
