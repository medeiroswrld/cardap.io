"use client";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { apiErrorCode, apiErrorMessages, requestJson } from "@/lib/client-api";
import { cycleLabel, cycleUnit, payableInvoice, planLabel, shortDate, targetPrice, type BillingInfo } from "@/lib/billing-view";
import type { Cycle, SellablePlan } from "@/lib/plans";
import { formatDocument, reactivateWhatsappUrl, safeRedirect } from "@/lib/sales";
import { money } from "@/lib/utils";
import { Button } from "./ui/button";

// Staff of a restaurant whose billing is blocked: only the message, no data.
const STAFF_NOTICE: Record<string, string> = {
  pendente: "A assinatura deste restaurante está pendente.",
  bloqueado: "A assinatura deste restaurante está com pagamento atrasado.",
  cancelado: "A assinatura deste restaurante foi cancelada.",
};
export function StaffBillingNotice({ state = "pendente" }: { state?: string }) {
  return (
    <section className="admin-panel billing-gate" role="status">
      <span className="billing-gate-icon" aria-hidden="true">
        <AlertTriangle size={22} />
      </span>
      <h2>{`${STAFF_NOTICE[state] ?? STAFF_NOTICE.pendente} Avise o responsável.`}</h2>
    </section>
  );
}

const OWNER_LEAD: Record<string, { title: string; text: string }> = {
  pendente: {
    title: "Finalize o pagamento para liberar o Fome Play.",
    text: "Assim que o pagamento for confirmado, a gestão e os pedidos voltam a funcionar. Seu cardápio continua no ar.",
  },
  bloqueado: {
    title: "Seu acesso está pausado por falta de pagamento.",
    text: "Regularize a fatura em aberto para voltar a receber pedidos. Seu cardápio continua no ar.",
  },
  cancelado: {
    title: "Sua assinatura foi cancelada.",
    text: "Para voltar a usar o Fome Play, é só reativar. Seu cardápio continua no ar.",
  },
};

type Choice = { plan: SellablePlan; cycle: Cycle };
const CHOICES: Choice[] = [
  { plan: "essencial", cycle: "mensal" },
  { plan: "essencial", cycle: "anual" },
  { plan: "profissional", cycle: "mensal" },
  { plan: "profissional", cycle: "anual" },
];

// Cancelled restaurant: pick plan and cycle, the server creates the charge (plan price only, no
// implantação) and the owner goes to the Asaas page.
function Reactivate({ restaurantId, whatsapp }: { restaurantId: string; whatsapp: string | null }) {
  const [choice, setChoice] = useState<Choice>({ plan: "essencial", cycle: "mensal" });
  const [doc, setDoc] = useState("");
  const [askDocument, setAskDocument] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  async function reactivate() {
    setWorking(true);
    setError("");
    try {
      const result = await requestJson<{ redirect?: string }>(`/api/restaurants/${restaurantId}/billing`, {
        action: "reactivate",
        ...choice,
        ...(askDocument && doc.trim() ? { document: doc.trim() } : {}),
      });
      const next = safeRedirect(result.redirect);
      if (!next) throw new Error("Não foi possível abrir o pagamento. Tente de novo.");
      window.location.assign(next);
    } catch (err) {
      if (apiErrorCode(err) === "INVALID_DOCUMENT") {
        setAskDocument(true);
        setError(apiErrorMessages.INVALID_DOCUMENT);
      } else setError((err as Error).message);
      setWorking(false);
    }
  }
  return (
    <div className="form-stack">
      <div className="billing-choices" role="radiogroup" aria-label="Plano e ciclo">
        {CHOICES.map((option) => {
          const selected = option.plan === choice.plan && option.cycle === choice.cycle;
          return (
            <label key={`${option.plan}-${option.cycle}`} className={`billing-choice${selected ? " selected" : ""}`}>
              <input type="radio" name="reactivate-target" checked={selected} onChange={() => setChoice(option)} />
              <span>
                <strong>
                  {planLabel(option.plan)} · {cycleLabel(option.cycle).toLowerCase()}
                </strong>
                <small>
                  {money(targetPrice(option))}/{cycleUnit(option.cycle)}
                </small>
              </span>
            </label>
          );
        })}
      </div>
      <p className="field-help">Sem nova taxa de implantação. Você paga só o primeiro período, no Asaas.</p>
      {askDocument && (
        <label className="form-label">
          CPF ou CNPJ
          <input inputMode="numeric" autoComplete="off" value={doc} onChange={(e) => setDoc(formatDocument(e.target.value))} />
        </label>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <Button onClick={() => void reactivate()} disabled={working || (askDocument && !doc.trim())}>
        {working ? "Abrindo…" : "Reativar assinatura"}
      </Button>
      {whatsapp && (
        <a className="button button-outline" href={whatsapp} target="_blank" rel="noopener noreferrer">
          Falar com a gente
        </a>
      )}
    </div>
  );
}

// Owner of a blocked restaurant: a lead message above the Plano e pagamento tab.
export function BillingGate({ state, restaurantId }: { state: string; restaurantId: string }) {
  const lead = OWNER_LEAD[state] ?? OWNER_LEAD.pendente;
  const whatsapp = state === "cancelado" ? reactivateWhatsappUrl(process.env.NEXT_PUBLIC_SALES_WHATSAPP) : null;
  return (
    <section className="admin-panel billing-gate" role="status">
      <span className="billing-gate-icon" aria-hidden="true">
        <AlertTriangle size={22} />
      </span>
      <h2>{lead.title}</h2>
      <p>{lead.text}</p>
      {state === "cancelado" && <Reactivate restaurantId={restaurantId} whatsapp={whatsapp} />}
    </section>
  );
}

// Top strip while the payment is late (atrasado, up to 7 days before orders pause).
export function OverdueBanner({
  restaurantId,
  since,
  onOpenPlan,
}: {
  restaurantId: string;
  since: string | null;
  onOpenPlan: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    requestJson<BillingInfo>(`/api/restaurants/${restaurantId}/billing`)
      .then((info) => {
        if (active) setUrl(payableInvoice(info.invoices)?.url ?? null);
      })
      .catch(() => {
        // Without the link the button sends the owner to Plano e pagamento.
      });
    return () => {
      active = false;
    };
  }, [restaurantId]);
  const date = shortDate(since);
  return (
    <div className="billing-banner" role="alert">
      <AlertTriangle size={18} aria-hidden="true" />
      <span>
        Pagamento pendente{date ? ` desde ${date}` : ""} — regularize para não pausar os pedidos.
      </span>
      {url ? (
        <a className="button button-sm" href={url} target="_blank" rel="noopener noreferrer">
          Pagar agora
        </a>
      ) : (
        <button type="button" className="button button-sm" onClick={onOpenPlan}>
          Pagar agora
        </button>
      )}
    </div>
  );
}
