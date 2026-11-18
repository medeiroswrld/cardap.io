"use client";
import { Lock } from "lucide-react";
import type { PageKey } from "@/lib/admin-sections";
import { Button } from "./ui/button";

// One line per locked page: what the feature does for the restaurant.
export const PAGE_BENEFITS: Partial<Record<PageKey, string>> = {
  contatos: "Veja quem pede, quanto gasta e quando voltou, e chame cada cliente de volta.",
  avaliacoes: "Saiba o que seus clientes acharam de cada prato.",
  cupons: "Crie cupons de desconto e veja quantos pedidos cada um trouxe.",
  reconquistar: "Chame de volta quem sumiu, com cupom pronto para enviar no WhatsApp.",
  resultados: "Veja quanto o cardápio rendeu no mês e quanto você economizou do iFood.",
  metricas: "Descubra quais vídeos e fotos fazem seus pratos vender.",
  origem: "Saiba de onde vêm seus pedidos: Instagram, QR code, Google e mais.",
  caixa: "Feche o caixa do dia com o que entrou em dinheiro, Pix e cartão.",
  mes: "Veja o resultado do mês: vendas, custos e o que sobrou.",
  contas: "Controle as contas a pagar e não perca nenhum vencimento.",
};

// Full-page card shown when an Essencial owner opens a Profissional page.
export function PlanLock({ title, benefit, onUpgrade }: { title: string; benefit: string; onUpgrade: () => void }) {
  return (
    <section className="admin-panel plan-lock" aria-labelledby="plan-lock-title">
      <span className="plan-lock-icon" aria-hidden="true">
        <Lock size={22} />
      </span>
      <span className="eyebrow">Disponível no Profissional</span>
      <h2 id="plan-lock-title">{title}</h2>
      <p>{benefit}</p>
      <Button onClick={onUpgrade}>Liberar no Profissional</Button>
    </section>
  );
}

// Smaller card for a locked block inside a page that is otherwise open (settings panels).
export function PlanLockInline({ title, benefit, onUpgrade }: { title: string; benefit: string; onUpgrade: () => void }) {
  return (
    <section className="admin-panel connected-panel plan-lock-inline">
      <span className="plan-lock-icon" aria-hidden="true">
        <Lock size={18} />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{benefit}</p>
      </div>
      <Button variant="outline" onClick={onUpgrade}>
        Liberar no Profissional
      </Button>
    </section>
  );
}
