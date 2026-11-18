"use client";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { requestJson } from "@/lib/client-api";
import { payableInvoice, shortDate, type BillingInfo } from "@/lib/billing-view";
import { reactivateWhatsappUrl } from "@/lib/sales";

// Staff of a restaurant whose billing is blocked: only the message, no data.
export function StaffBillingNotice() {
  return (
    <section className="admin-panel billing-gate" role="status">
      <span className="billing-gate-icon" aria-hidden="true">
        <AlertTriangle size={22} />
      </span>
      <h2>A assinatura deste restaurante está pendente. Avise o responsável.</h2>
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

// Owner of a blocked restaurant: a lead message above the Plano e pagamento tab.
export function BillingGate({ state }: { state: string }) {
  const lead = OWNER_LEAD[state] ?? OWNER_LEAD.pendente;
  const whatsapp = state === "cancelado" ? reactivateWhatsappUrl(process.env.NEXT_PUBLIC_SALES_WHATSAPP) : null;
  return (
    <section className="admin-panel billing-gate" role="status">
      <span className="billing-gate-icon" aria-hidden="true">
        <AlertTriangle size={22} />
      </span>
      <h2>{lead.title}</h2>
      <p>{lead.text}</p>
      {state === "cancelado" &&
        (whatsapp ? (
          <a className="button button-outline" href={whatsapp} target="_blank" rel="noopener noreferrer">
            Falar com a gente
          </a>
        ) : (
          <p>
            Para reativar, assine de novo em <a className="billing-link" href="/assinar">fomeplay.com.br/assinar</a>.
          </p>
        ))}
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
